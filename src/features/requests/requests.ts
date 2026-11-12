import { addDoc, collection, deleteField, doc, getDocsFromServer, onSnapshot, or, query, runTransaction, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, pilotMode, taskFunctions } from '../../services/firebase/firebase';
import { todayInVietnam } from '../tasks/taskDates';

export const requestTypes = ['Nghỉ phép', 'Tạm ứng lương', 'Công tác', 'Làm thêm giờ', 'Đề xuất khác'] as const;
export const pendingRequest = 'Chờ duyệt';
export const overtimeTaskLimit = 10;
export type OvertimeTask = { id: string; title: string };
type OvertimeDetails = { hours: number } & ({ tasks: OvertimeTask[] } | { taskId: string; taskTitle: string });
export type RequestFields = {
  type: string; reason: string; from: string; to: string; days: number; amount: number; month: string;
  trip?: { destination: string; host: string; estimatedCost: number };
  overtime?: OvertimeDetails;
};
export type StaffRequest = RequestFields & {
  id: string; status: string; createdBy: string; createdAt?: string; updatedAt?: string;
  approverEmail?: string; decidedBy?: string; decidedAt?: string; reply?: string;
};
export type RequestAccess = { email: string; isAdmin: boolean; canReviewRequests: boolean };
export type RequestAction = 'edit' | 'route' | 'approve' | 'reject' | 'delete';

export function overtimeTasks(overtime?: OvertimeDetails): OvertimeTask[] {
  if (!overtime) return [];
  return 'tasks' in overtime ? overtime.tasks : [{ id: overtime.taskId, title: overtime.taskTitle }];
}
type RequestMember = { email: string; name: string; canReview: boolean };
const listRequestMembers = httpsCallable<void, RequestMember[]>(taskFunctions, 'listMobileRequestMembers', { timeout: 12000 });

export function canActOnRequest(row: StaffRequest, action: RequestAction, access: RequestAccess) {
  const own = row.createdBy === access.email;
  if (action === 'delete' && access.isAdmin) return true;
  if (row.status !== pendingRequest) return false;
  if (action === 'edit' || action === 'delete') return own;
  if (action === 'route') return access.isAdmin;
  return !own && row.approverEmail === access.email && access.canReviewRequests;
}

export function watchRequests(access: RequestAccess, onData: (rows: StaffRequest[]) => void, onError: () => void) {
  const requests = collection(db, 'requests');
  const own = where('createdBy', '==', access.email);
  const scope = access.isAdmin ? requests : access.canReviewRequests
    ? query(requests, or(own, where('approverEmail', '==', access.email))) : query(requests, own);
  return onSnapshot(scope, { includeMetadataChanges: true }, snapshot => {
    if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
    onData(snapshot.docs.map(row => ({ ...row.data(), id: row.id }) as StaffRequest)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')));
  }, onError);
}

export async function loadRequestMembers(isAdmin: boolean): Promise<RequestMember[]> {
  if (!isAdmin && !pilotMode) {
    const { data } = await listRequestMembers();
    return data;
  }
  const snapshot = await getDocsFromServer(collection(db, 'members'));
  return snapshot.docs.map(row => {
    const member = row.data();
    return { email: row.id, name: typeof member.name === 'string' && member.name.trim() ? member.name : row.id,
      canReview: member.enabled !== false && (member.role === 'admin' ||
        (Array.isArray(member.grants) && member.grants.includes('requestReview'))) };
  });
}

export async function createRequest(fields: RequestFields, approverEmail: string, email: string) {
  const now = new Date().toISOString();
  await addDoc(collection(db, 'requests'), {
    ...fields, approverEmail, status: pendingRequest, createdBy: email, createdAt: now, updatedBy: email, updatedAt: now,
  });
}

export async function changeRequest(row: StaffRequest, access: RequestAccess, action: RequestAction,
  options: { fields?: RequestFields; value?: string; creatorName?: string } = {}) {
  const ref = doc(db, 'requests', row.id);
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(ref);
    const current = { ...snapshot.data(), id: row.id } as StaffRequest;
    if (!snapshot.exists() || current.updatedAt !== row.updatedAt || current.status !== row.status ||
        current.approverEmail !== row.approverEmail || !canActOnRequest(current, action, access)) {
      throw new Error('Đơn vừa thay đổi hoặc bạn không còn quyền xử lý. Hãy đóng và mở lại đơn.');
    }
    const now = new Date().toISOString();
    const patch = { updatedBy: access.email, updatedAt: now };
    if (action === 'delete') {
      transaction.delete(ref);
    } else if (action === 'edit') {
      transaction.update(ref, { ...options.fields, ...patch,
        ...(current.trip && !options.fields?.trip ? { trip: deleteField() } : {}),
        ...(current.overtime && !options.fields?.overtime ? { overtime: deleteField() } : {}),
      });
    } else if (action === 'route') {
      transaction.update(ref, { ...patch, approverEmail: options.value });
    } else {
      transaction.update(ref, { ...patch, status: action === 'approve' ? 'Đã duyệt' : 'Từ chối',
        decidedBy: access.email, decidedAt: now, reply: options.value ?? '' });
      if (action === 'approve' && current.type === 'Tạm ứng lương') {
        const name = (options.creatorName || current.createdBy).slice(0, 250);
        transaction.set(doc(db, 'cash', 'tu_' + row.id), {
          type: 'chi', status: pendingRequest, requestId: row.id, date: todayInVietnam(), amount: current.amount,
          category: 'Tạm ứng nhân viên', method: 'Chuyển khoản', projectId: '',
          note: 'Tạm ứng lương – ' + name, partyType: 'Nhân viên', partyName: name,
          createdBy: access.email, createdAt: now, ...patch,
        });
      }
    }
  });
}
