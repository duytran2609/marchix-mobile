import { collection, deleteDoc, doc, getDoc, getDocs, runTransaction, setDoc } from 'firebase/firestore';
import { db } from '../../services/firebase/firebase';
import { todayInVietnam } from '../tasks/taskDates';
import { grants } from './adminSettingsFields';
import type { AdminSettingsTab, FieldValues } from './adminSettingsFields';

export type SettingsRow = { id: string; data: Record<string, unknown> };
type DocumentTab = Exclude<AdminSettingsTab, 'members' | 'recurring'>;

export async function loadSettings(tab: AdminSettingsTab): Promise<SettingsRow[]> {
  if (tab === 'members' || tab === 'recurring') {
    const snapshot = await getDocs(collection(db, tab));
    return snapshot.docs.map(row => ({ id: row.id, data: row.data() })).sort((a, b) =>
      tab === 'recurring' ? Number(a.data.day || 0) - Number(b.data.day || 0)
        : String(a.data.name || a.id).localeCompare(String(b.data.name || b.id), 'vi'));
  }
  const snapshot = await getDoc(doc(db, 'settings', tab));
  return [{ id: snapshot.id, data: snapshot.data() ?? {} }];
}

export async function loadProjectChoices() {
  const snapshot = await getDocs(collection(db, 'projects'));
  return [['', 'Không gắn dự án'], ...snapshot.docs.map(row => [row.id, String(row.data().name || row.id)] as const)] as const;
}

export async function saveSettings(tab: DocumentTab, values: FieldValues, email: string) {
  const fields = { ...values };
  const metadata = { updatedBy: email, updatedAt: new Date().toISOString() };
  if (tab === 'work') {
    if (values.gpsOn && !values.gpsLat && !values.gpsLng) throw new Error('Cần nhập tọa độ văn phòng khi bật GPS.');
    const days = Object.fromEntries(Array.from({ length: 7 }, (_, day) => {
      const key = `day${day}`;
      delete fields[key];
      return [day, values[key]];
    }));
    await setDoc(doc(db, 'settings', tab), { ...fields, days, ...metadata }, { merge: true });
  } else {
    await setDoc(doc(db, 'settings', tab), tab === 'payroll' ? { ...fields, ...metadata } : fields, { merge: true });
  }
}

export const protectedOwner = 'dungnlt.ops@gmail.com';

export async function saveMember(values: FieldValues, currentEmail: string, id?: string) {
  const email = String(values.email).toLowerCase();
  if (!/^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/.test(email)) throw new Error('Email Google không hợp lệ.');
  const ref = doc(db, 'members', id ?? email);
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(ref);
    if (!id && snapshot.exists()) throw new Error('Email đã tồn tại. Mở tài khoản hiện có để chỉnh sửa.');
    if (id && !snapshot.exists()) throw new Error('Tài khoản đã thay đổi. Hãy tải lại danh sách.');
    const protectedAccount = [protectedOwner, currentEmail].includes(email) || [protectedOwner, currentEmail].includes(ref.id);
    transaction.set(ref, {
      name: values.name, email, role: protectedAccount ? 'admin' : values.role, enabled: protectedAccount || values.enabled,
      grants: Object.keys(grants).filter(key => values[key]),
    }, { merge: true });
  });
}

export async function saveRecurring(values: FieldValues, id?: string) {
  const ref = id ? doc(db, 'recurring', id) : doc(collection(db, 'recurring'));
  await runTransaction(db, async transaction => {
    const current = await transaction.get(ref);
    if (id && !current.exists()) throw new Error('Khoản chi đã thay đổi. Hãy tải lại danh sách.');
    transaction.set(ref, values, { merge: true });
  });
}

export async function generateMonthlyExpenses(rows: SettingsRow[], email: string) {
  const month = todayInVietnam().slice(0, 7);
  const active = rows.filter(row => row.data.active !== false);
  const entries = active.map(({ id, data }) => {
    const amount = Number(data.amount);
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error(`Kiểm tra số tiền của “${data.name || id}”.`);
    const day = String(Math.min(28, Math.max(1, Math.trunc(Number(data.day)) || 1))).padStart(2, '0');
    return {
      ref: doc(db, 'cash', `cd_${month}_${id}`),
      data: {
        type: 'chi', date: `${month}-${day}`, amount, category: String(data.category || ''), method: 'Chuyển khoản',
        projectId: String(data.projectId || ''), note: `${data.name || id} tháng ${month.slice(5)}/${month.slice(0, 4)}`,
        partyType: String(data.partyType || 'Nhà cung cấp'), partyName: String(data.partyName || ''),
        status: 'Chờ duyệt', createdBy: email, updatedBy: email,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      },
    };
  });
  if (!entries.length) return 0;
  return runTransaction(db, async transaction => {
    const existing = await Promise.all(entries.map(({ ref }) => transaction.get(ref)));
    const missing = entries.filter((_, index) => !existing[index].exists());
    for (const entry of missing) transaction.set(entry.ref, entry.data);
    return missing.length;
  });
}

export function removeRecurring(id: string) {
  return deleteDoc(doc(db, 'recurring', id));
}
