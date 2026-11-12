import { collection, onSnapshot, or, query, where } from 'firebase/firestore';
import { db } from '../../services/firebase/firebase';

export const recordBooks = { in: 'Văn bản đến', out: 'Văn bản đi' };
export const recordKinds = { letter: 'Công văn', decision: 'Quyết định' };
export const recordStates = {
  registered: 'Đã vào sổ', assigned: 'Đã giao', processing: 'Đang xử lý', completed: 'Đã xử lý',
  draft: 'Bản nháp', review: 'Chờ duyệt nội dung', approved: 'Đã duyệt nội dung', signing: 'Chờ ký',
  signed: 'Đã ký', numbered: 'Đã cấp số', issued: 'Đã phát hành', void: 'Hủy số', archived: 'Đã lưu',
};

export type RecordBook = keyof typeof recordBooks;
export type RecordStatus = keyof typeof recordStates;
export const bookStatuses: Record<RecordBook, RecordStatus[]> = {
  in: ['registered', 'assigned', 'processing', 'completed', 'archived'],
  out: ['draft', 'review', 'approved', 'signing', 'signed', 'numbered', 'issued', 'void', 'archived'],
};

type RecordTime = { toMillis(): number };
export type Correspondence = {
  id: string;
  direction: RecordBook;
  status: RecordStatus;
  kind?: keyof typeof recordKinds;
  subject?: string;
  partner?: string;
  assigneeEmail?: string;
  watchers?: string[];
  priority?: string;
  year?: number | string;
  serial?: number | string;
  numbering?: { seq?: number; at?: RecordTime };
  externalNumber?: string;
  registeredOn?: string;
  documentOn?: string;
  dueOn?: string;
  createdAt?: RecordTime;
  updatedAt?: RecordTime;
  fileId?: string;
  fileName?: string;
  signedByName?: string;
  signedOn?: string;
  lastEventId?: string;
};

export function watchRecords(email: string, isAdmin: boolean, onChange: (rows: Correspondence[]) => void, onError: () => void) {
  const records = collection(db, 'correspondence');
  const scope = isAdmin ? records : query(records, or(
    where('assigneeEmail', '==', email),
    where('watchers', 'array-contains', email),
  ));
  return onSnapshot(scope, { includeMetadataChanges: true }, snapshot => {
    if (snapshot.metadata.fromCache) return;
    const rows = snapshot.docs.map(document => ({ ...document.data(), id: document.id }) as Correspondence);
    onChange(rows.filter(row => row.direction === 'in' || row.direction === 'out'));
  }, onError);
}

export function recordNumber(row: Correspondence) {
  if (row.direction === 'out') return row.externalNumber || 'Chưa cấp số';
  const serial = row.numbering?.seq ?? row.serial;
  return serial != null && row.year ? `${String(serial).padStart(2, '0')}/${row.year}` : 'Chưa cấp số';
}

export function recordSystemCode(row: Correspondence, today: string) {
  const year = row.year || row.registeredOn?.slice(0, 4) || today.slice(0, 4);
  return `MX-${row.direction === 'in' ? 'DEN' : 'DI'}-${year}-${row.id}`;
}

export function recordIsOpen(row: Correspondence) {
  return !['completed', 'issued', 'void', 'archived'].includes(row.status);
}

export function recordIsLate(row: Correspondence, today: string) {
  return Boolean(row.dueOn && row.dueOn < today && recordIsOpen(row));
}

export function recordSortTime(row: Correspondence, watching: boolean) {
  const time = watching ? row.updatedAt : row.numbering?.at ?? row.createdAt;
  return time?.toMillis?.() ?? 0;
}

export function recordActions(row: Correspondence, email: string, isAdmin: boolean): { status: RecordStatus; label: string }[] {
  if (!isAdmin && row.assigneeEmail !== email) return [];
  switch (row.status) {
    case 'registered': return isAdmin ? [{ status: 'assigned', label: 'Giao xử lý' }] : [];
    case 'assigned': return [{ status: 'processing', label: 'Bắt đầu xử lý' }];
    case 'processing': return [{ status: 'completed', label: 'Hoàn tất xử lý' }];
    case 'completed':
    case 'issued': return isAdmin ? [{ status: 'archived', label: 'Lưu hồ sơ' }] : [];
    case 'draft': return [{ status: 'review', label: 'Trình duyệt nội dung' }];
    case 'review': return isAdmin ? [{ status: 'approved', label: 'Duyệt nội dung' }, { status: 'draft', label: 'Trả về bản nháp' }] : [];
    case 'approved': return [{ status: 'signing', label: 'Chuyển chờ ký' }];
    case 'signing': return isAdmin ? [{ status: 'numbered', label: 'Xác nhận bản đã ký và cấp số' }] : [];
    case 'signed': return row.numbering
      ? (isAdmin ? [{ status: 'issued', label: 'Ghi nhận phát hành' }] : [])
      : [{ status: 'numbered', label: 'Lấy số chính thức' }];
    case 'numbered': return isAdmin ? [
      row.signedByName ? { status: 'issued', label: 'Ghi nhận phát hành' } : { status: 'signed', label: 'Bổ sung bản đã ký' },
      { status: 'void', label: 'Hủy số' },
    ] : [];
    default: return [];
  }
}
