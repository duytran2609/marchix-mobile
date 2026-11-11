import { collection, doc, onSnapshot, or, query, runTransaction, where, writeBatch } from 'firebase/firestore';
import { db } from '../../services/firebase/firebase';
import { writeCashFiles } from './cashAttachments';
import type { PreparedCashFiles } from './cashAttachments';

export const cashStatuses = ['Chờ duyệt', 'Chờ chi', 'Chờ thu', 'Đã chi', 'Đã thu', 'Từ chối'] as const;
export const expenseLimit = 2_000_000;
export const parties = ['Nhà cung cấp', 'Khách hàng', 'Nhân viên', 'Cơ quan nhà nước', 'Ngân hàng / tổ chức tín dụng', 'Chủ sở hữu', 'Khác'];
export const categories = {
  thu: { Thu: ['Doanh thu bán hàng, dịch vụ', 'Khách hàng trả nợ', 'Hoàn ứng', 'Vốn góp / chủ sở hữu bù', 'Vay', 'Thu khác'] },
  chi: {
    'Chi phí cố định': ['Thuê văn phòng / mặt bằng', 'Điện, nước', 'Internet, điện thoại', 'Phần mềm, tên miền, hosting', 'Dịch vụ kế toán, pháp lý', 'Chữ ký số, hóa đơn điện tử', 'Phí ngân hàng', 'Trả góp / khấu hao tài sản'],
    'Chi phí nhân sự': ['Lương', 'Thưởng, phụ cấp', 'BHXH, BHYT, BHTN', 'Kinh phí công đoàn', 'Phúc lợi, đào tạo', 'Tạm ứng nhân viên'],
    'Chi phí hoạt động': ['Văn phòng phẩm, vật tư', 'Marketing, quảng cáo', 'Công tác phí, đi lại, xăng xe', 'Tiếp khách', 'Sửa chữa, bảo trì', 'Mua hàng, nguyên vật liệu', 'Thuê ngoài, nhà thầu phụ'],
    'Thuế, phí nhà nước': ['Thuế GTGT', 'Thuế TNDN', 'Thuế TNCN nộp thay', 'Lệ phí môn bài', 'Phí, lệ phí khác', 'Tiền phạt, chậm nộp'],
    'Tài chính & khác': ['Trả nợ nhà cung cấp', 'Trả nợ vay, lãi vay', 'Chi khác'],
  },
};
export const vnd = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });
export const displayDate = (date?: string) => date?.slice(0, 10).split('-').reverse().join('/') || '—';
export type CashType = 'thu' | 'chi';
export type CashFields = {
  type: CashType; amount: number; date: string; dueDate: string; projectId: string;
  note: string; category: string; method: string; partyType: string; partyName: string; invoiceRef: string;
};
export type Cash = CashFields & {
  id: string; status?: string; approval?: string; createdBy: string; createdAt?: string; updatedAt?: string;
  approverEmail?: string; approvedBy?: string; approvedAt?: string; approvalNote?: string; ref?: string;
  paidBy?: string; paidAt?: string; projectLinkLocked?: boolean; legacyApproval?: unknown; files?: unknown[];
  requestId?: string;
};
export type CashAccess = { email: string; isAdmin: boolean; canReviewCash: boolean; canReadCash: boolean };
export type CashAction = 'route' | 'approve' | 'reject' | 'record' | 'requeue' | 'edit';

export function cashStatus(row: Cash) {
  return row.status || (row.type === 'chi' && row.approval === 'Chưa duyệt' && row.amount > expenseLimit
    ? 'Chờ duyệt' : row.type === 'chi' ? 'Đã chi' : 'Đã thu');
}

export function verifiedCash(row: Cash) {
  return typeof row.approvedBy === 'string' && !!row.approvedBy && row.approvedBy !== row.createdBy;
}

export function missingCashApproval(row: Cash) {
  return row.status === (row.type === 'chi' ? 'Chờ chi' : 'Chờ thu') && !verifiedCash(row);
}

export function canAct(action: CashAction, row: Cash, access: CashAccess) {
  const waiting = row.status === (row.type === 'chi' ? 'Chờ chi' : 'Chờ thu');
  if (action === 'record') return access.canReadCash && waiting && verifiedCash(row) && row.approvedBy !== access.email;
  if (action === 'requeue') return access.isAdmin && missingCashApproval(row) && !row.legacyApproval;
  if (row.status !== 'Chờ duyệt') return false;
  if (action === 'route') return access.isAdmin;
  if (action === 'edit') return !row.approvedBy && !row.requestId && row.createdBy === access.email;
  return access.canReviewCash && row.approverEmail === access.email && row.createdBy !== access.email;
}

export function watchCash(access: CashAccess, onData: (rows: Cash[]) => void, onError: () => void) {
  const ledger = collection(db, 'cash');
  const scope = access.canReadCash ? ledger : query(ledger, or(
    where('createdBy', '==', access.email), where('approverEmail', '==', access.email),
  ));
  return onSnapshot(scope, { includeMetadataChanges: true }, snapshot => {
    if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
    onData(snapshot.docs.map(row => ({ ...row.data(), id: row.id }) as Cash)
      .filter(row => row.type === 'thu' || row.type === 'chi')
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || '')));
  }, onError);
}

export function watchCashApprovers(onData: (rows: { id: string; name: string }[]) => void, onError: () => void) {
  return onSnapshot(collection(db, 'members'), { includeMetadataChanges: true }, snapshot => {
    if (snapshot.metadata.fromCache) return;
    onData(snapshot.docs.flatMap(row => {
      const member = row.data();
      return member.enabled !== false && (member.role === 'admin' || (Array.isArray(member.grants) && member.grants.includes('cashReview')))
        ? [{ id: row.id, name: member.name || row.id }] : [];
    }).sort((a, b) => a.name.localeCompare(b.name, 'vi')));
  }, onError);
}

export async function createCash(fields: CashFields, approverEmail: string, email: string, attachments: PreparedCashFiles = []) {
  const now = new Date().toISOString();
  const ref = doc(collection(db, 'cash'));
  const batch = writeBatch(db);
  const files = writeCashFiles(batch, ref, attachments, email, now);
  batch.set(ref, {
    ...fields, approverEmail, ref: '', status: 'Chờ duyệt',
    createdBy: email, updatedBy: email, createdAt: now, updatedAt: now,
    ...(files.length ? { files } : {}),
  });
  await batch.commit();
  return ref.id;
}

export async function changeCash(row: Cash, action: CashAction, access: CashAccess, value = '', fields?: CashFields,
  attachments: PreparedCashFiles = []) {
  const ref = doc(db, 'cash', row.id);
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(ref);
    const current = { ...snapshot.data(), id: row.id } as Cash;
    if (!snapshot.exists() || current.updatedAt !== row.updatedAt ||
        current.status !== row.status || current.approverEmail !== row.approverEmail || !canAct(action, current, access)) {
      throw new Error('Khoản thu chi vừa thay đổi. Hãy mở lại và kiểm tra trước khi xử lý.');
    }
    const now = new Date().toISOString();
    const patch = { updatedAt: now, updatedBy: access.email };
    if (action === 'edit' && fields) {
      const files = writeCashFiles(transaction, ref, attachments, access.email, now);
      transaction.update(ref, { ...fields, ...patch,
        ...(files.length ? { files: [...(current.files ?? []), ...files] } : {}) });
    } else if (action === 'route') {
      transaction.update(ref, { ...patch, approverEmail: value });
    } else if (action === 'record') {
      transaction.update(ref, { ...patch, status: current.type === 'chi' ? 'Đã chi' : 'Đã thu', ref: value, paidAt: now, paidBy: access.email });
    } else if (action === 'requeue') {
      transaction.update(ref, { ...patch, status: 'Chờ duyệt', approvedBy: '', approvedAt: '',
        legacyApproval: { by: current.approvedBy ?? '', at: current.approvedAt ?? '' } });
    } else if (action === 'approve' || action === 'reject') {
      transaction.update(ref, { ...patch, status: action === 'reject' ? 'Từ chối' : current.type === 'chi' ? 'Chờ chi' : 'Chờ thu',
        approvedBy: access.email, approvedAt: now, approvalNote: value });
    }
  });
}

export function cashTotals(rows: Cash[]) {
  const categories = new Map<string, number>();
  let income = 0, expense = 0, pending = 0;
  for (const row of rows) {
    const amount = Number(row.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const status = cashStatus(row);
    if (row.type === 'thu' && status === 'Đã thu') income += amount;
    if (row.type === 'chi' && status === 'Đã chi') {
      expense += amount;
      const key = row.category || 'Chi khác';
      categories.set(key, (categories.get(key) ?? 0) + amount);
    }
    if (row.type === 'chi' && (status === 'Chờ duyệt' || status === 'Chờ chi')) pending += amount;
  }
  return { income, expense, pending, categories: [...categories].sort((a, b) => b[1] - a[1]) };
}
