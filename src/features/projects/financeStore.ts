import { collection, doc, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, where } from 'firebase/firestore';
import { db } from '../../services/firebase/firebase';
import { cashStatus, verifiedCash } from '../cash/cash';
import type { Cash } from '../cash/cash';
import { sameBudgetLines, validateBudgetApproval, validateFinance } from './financeMath';
import type { BudgetLine, FinancePlan, FinanceTransaction } from './financeMath';

export type Draft = FinancePlan & { revision: number };
export type BudgetVersion = { lines: BudgetLine[]; revision: number; reason?: string };

const confirmed = { includeMetadataChanges: true };
const draftRef = (id: string) => doc(db, 'projects', id, 'finance', 'draft');
const versionsRef = (id: string) => collection(db, 'projects', id, 'budgetVersions');

export function watchDraft(id: string, onData: (draft: Draft | null) => void, onError: () => void) {
  return onSnapshot(draftRef(id), confirmed, snapshot => {
    if (!snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites) onData(snapshot.data() as Draft ?? null);
  }, onError);
}

export function watchVersions(id: string, onData: (versions: BudgetVersion[]) => void, onError: () => void) {
  const ref = versionsRef(id);
  let recent: BudgetVersion[] | undefined;
  let original: BudgetVersion | null | undefined;
  function publish() {
    if (!recent || original === undefined) return;
    onData(original && !recent.some(version => version.revision === original?.revision) ? [...recent, original] : recent);
  }
  const latest = onSnapshot(query(ref, orderBy('revision', 'desc'), limit(10)), confirmed, snapshot => {
    if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
    recent = snapshot.docs.map(row => row.data() as BudgetVersion);
    publish();
  }, onError);
  const first = onSnapshot(query(ref, orderBy('revision', 'asc'), limit(1)), confirmed, snapshot => {
    if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
    original = snapshot.docs[0] ? snapshot.docs[0].data() as BudgetVersion : null;
    publish();
  }, onError);
  return () => { latest(); first(); };
}

export function watchProjectCash(id: string, onData: (rows: Cash[]) => void, onError: () => void) {
  return onSnapshot(query(collection(db, 'cash'), where('projectId', '==', id)), confirmed, snapshot => {
    if (!snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites) {
      onData(snapshot.docs.map(row => ({ ...row.data(), id: row.id }) as Cash)
        .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.id.localeCompare(b.id)));
    }
  }, onError);
}

export function financeTransactions(rows: Cash[]): FinanceTransaction[] {
  return rows.flatMap((row): FinanceTransaction[] => {
    const amount = Number(row.amount);
    if (!Number.isFinite(amount) || amount <= 0) return [];
    const status = cashStatus(row);
    const entry = { code: row.budgetCode || '', category: row.category, amount };
    if (row.type === 'thu') {
      return status === 'Đã thu' && (row.budgetFlow === 'depositReturn' || row.budgetFlow === 'expenseRefund')
        ? [{ ...entry, bucket: 'refund', refundKind: row.budgetFlow }] : [];
    }
    if (row.type !== 'chi') return [];
    if (status === 'Đã chi') return [{ ...entry, bucket: 'paid' }];
    if (status === 'Chờ chi' && verifiedCash(row)) return [{ ...entry, bucket: 'committed' }];
    if (status === 'Chờ duyệt' || status === 'Chờ chi') return [{ ...entry, bucket: 'pending' }];
    return [];
  });
}

export async function saveFinanceDraft(id: string, email: string, revision: number, plan: FinancePlan) {
  validateFinance(plan);
  const ref = draftRef(id);
  await runTransaction(db, async tx => {
    const current = (await tx.get(ref)).data();
    if ((current?.revision ?? 0) !== revision) throw Error('Dự toán vừa thay đổi. Hãy mở lại khoản trước khi lưu.');
    tx.set(ref, { ...current, ...plan, revision: revision + 1, by: email, at: serverTimestamp() });
  });
}

export async function closeFinanceBudget(id: string, email: string, draft: Draft, reason: string, adjustment: boolean) {
  const explanation = reason.trim();
  if (adjustment && explanation.length < 10) throw Error('Nhập lý do điều chỉnh dự toán ít nhất 10 ký tự.');
  const ref = draftRef(id);
  const versionRef = doc(versionsRef(id), String(draft.revision));
  await runTransaction(db, async tx => {
    const current = (await tx.get(ref)).data() as Draft | undefined;
    const version = await tx.get(versionRef);
    if (version.exists()) throw Error('Phiên bản này đã chốt.');
    if (!current || current.revision !== draft.revision || !sameBudgetLines(current.lines, draft.lines)) {
      throw Error('Dự toán vừa thay đổi. Hãy kiểm tra bản mới trước khi chốt.');
    }
    validateFinance(current);
    validateBudgetApproval(current.lines);
    tx.set(versionRef, { revision: current.revision, lines: current.lines, by: email,
      reason: explanation || 'Chốt dự toán ban đầu.', at: serverTimestamp() });
  });
}

export type ProjectExpenseSeed = {
  projectId: string; expenseProfile?: string; code?: string; name?: string; amount?: number | null; category?: string;
  refund?: 'depositReturn' | 'expenseRefund';
};
