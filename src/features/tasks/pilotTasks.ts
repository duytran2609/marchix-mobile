import {
  Bytes, collection, doc, getDocFromServer, getDocsFromServer,
  limit, query, runTransaction, where, writeBatch,
} from 'firebase/firestore';
import type { DocumentData, DocumentReference } from 'firebase/firestore';
import { taskRoleNotices } from '../../../functions/taskRoleNotices';
import { auth, db, taskAssignmentEnabled } from '../../services/firebase/firebase';
import type { AssignmentInput, AttachmentUpload, ReviewRating, Task } from './tasks';
import { checklistProgress as percent } from './checklistProgress';

export const taskCategoryMaxLength = 160;

const open = (task: Task) => ['Chưa làm', 'Đang làm', 'Vướng'].includes(task.status);
const updated = (email: string, now: string) => ({ updatedBy: email, updatedAt: now });
const reviewer = (row: { role?: string; grants?: string[] }) =>
  row.role === 'admin' || (Array.isArray(row.grants) && row.grants.includes('taskReview'));

function email() {
  const user = auth.currentUser;
  if (!taskAssignmentEnabled || !user?.emailVerified || !user.email) {
    throw new Error('Vui lòng đăng nhập bằng tài khoản Marchix đã xác minh.');
  }
  return user.email;
}

async function directory() {
  const snapshot = await getDocsFromServer(collection(db, 'members'));
  return snapshot.docs.filter(row => row.get('enabled') !== false).map(row => {
    const data = row.data();
    const name = typeof data.name === 'string' ? data.name.trim() : '';
    const photoURL = [data.photoURL, data.avatarUrl, data.avatarURL].find(url =>
      typeof url === 'string' && /^https:\/\/[^\s]+$/.test(url)) ?? null;
    return { email: row.id, name: name && !name.includes('@') ? name : 'Thành viên Marchix',
      photoURL, canReview: reviewer(data) };
  });
}

export async function pilotDirectory() {
  email();
  const [members, projects] = await Promise.all([directory(), getDocsFromServer(collection(db, 'projects'))]);
  return { data: { members, projects: projects.docs.flatMap(project => {
    const name = project.get('name');
    return typeof name === 'string' && name.trim() ? [{ id: project.id, name }] : [];
  }) } };
}

const chunkSize = 900 * 1024;
const maxFileSize = 5 * 1024 * 1024;

function uploadBytes(attachments: AttachmentUpload[], copies = 1) {
  const files = attachments.map(({ name, type, base64 }) => ({
    name, type, bytes: Bytes.fromBase64String(base64).toUint8Array(),
  }));
  if (files.length > 5 || files.some(file => file.bytes.length > maxFileSize) ||
      files.reduce((sum, file) => sum + file.bytes.length, 0) * copies > 8 * 1024 * 1024) {
    throw new Error('Tệp đính kèm vượt giới hạn dung lượng.');
  }
  // Each file may require a rules lookup in the atomic write.
  if (files.length * copies > 16) throw new Error('Hãy chia số người nhận và tệp thành nhiều lượt giao việc.');
  return files;
}

type DocumentWriter = { set(ref: DocumentReference, data: DocumentData): unknown };

function attach(writer: DocumentWriter, task: DocumentReference,
  files: ReturnType<typeof uploadBytes>, by: string, at: string) {
  return files.map(({ name, type, bytes }) => {
    const ref = doc(collection(db, 'files'));
    const size = bytes.length;
    const chunks = Math.max(1, Math.ceil(size / chunkSize));
    writer.set(ref, { name, type, size, chunks, parent: task.path, scopeType: 'tasks', scopeId: task.id, by, at });
    for (let i = 0; i < chunks; i++) {
      writer.set(doc(ref, 'chunks', String(i)), { i, data: Bytes.fromUint8Array(bytes.subarray(i * chunkSize, (i + 1) * chunkSize)) });
    }
    return { id: ref.id, name, type, size };
  });
}

function writeTaskNotice(writer: DocumentWriter, from: string, to: string,
  taskId: string, title: string, body: string, createdAt: string) {
  writer.set(doc(collection(db, 'notifications')),
    { from, to, taskId, title, body, link: '#cong-viec', createdAt, read: false, emailed: false });
}

function notify(writer: DocumentWriter, from: string, recipients: (string | undefined)[],
  taskId: string, title: string, body: string, createdAt: string) {
  for (const to of new Set(recipients)) {
    if (!to || from === to) continue;
    writeTaskNotice(writer, from, to, taskId, title, body, createdAt);
  }
}

export async function pilotAddAttachments({ taskId, attachments }: { taskId: string; attachments: AttachmentUpload[] }) {
  const by = email();
  const uploads = uploadBytes(attachments);
  if (!uploads.length) throw new Error('Chọn ít nhất một tệp.');
  const ref = doc(db, 'tasks', taskId);
  await runTransaction(db, async tx => {
    const task = (await tx.get(ref)).data() as Task | undefined;
    if (!task || task.assigneeEmail !== by) throw new Error('Bạn không còn quyền gửi trao đổi cho công việc này.');
    if (task.status === 'Xong') throw new Error('Công việc đã xong và chỉ có thể xem chi tiết.');
    const at = new Date().toISOString();
    const files = attach(tx, ref, uploads, by, at);
    tx.update(ref, { comments: [...(task.comments ?? []), { by, at, text: '', files }] });
  });
}

function details(input: AssignmentInput) {
  return { title: input.title.trim(), startDate: input.startDate, due: input.due,
    note: input.note.trim(), priority: input.priority, repeat: input.repeat,
    projectId: input.projectId, milestone: input.milestone, watchers: input.watchers };
}

function assignmentCategory(value: AssignmentInput['category']) {
  const category = value?.trim();
  if (category !== undefined && category.length > taskCategoryMaxLength) {
    throw new Error('Hạng mục công việc chỉ được tối đa 160 ký tự.');
  }
  return category;
}

export async function pilotCreate(input: AssignmentInput) {
  const by = email();
  const category = assignmentCategory(input.category);
  const targets = [...new Set(input.assigneeEmails)];
  if (!targets.length || targets.length > 30 || !input.title.trim()) throw new Error('Nhập tên và chọn người thực hiện.');
  const files = uploadBytes(input.attachments ?? [], targets.length);
  const tasks = collection(db, 'tasks');
  const [members, existing] = await Promise.all([directory(), getDocsFromServer(
    query(tasks, where('assignedBy', '==', by), where('mobileAssignmentId', '==', input.taskId), limit(1)),
  )]);
  const people = new Map(members.map(member => [member.email, member]));
  if ([...targets, ...input.watchers].some(address => !people.has(address))) {
    throw new Error('Có thành viên không còn hoạt động. Hãy chọn lại.');
  }
  if (input.approverEmail && (!people.get(input.approverEmail)?.canReview || targets.includes(input.approverEmail))) {
    throw new Error('Người duyệt phải có quyền duyệt và khác người thực hiện.');
  }
  const batch = writeBatch(db);
  const now = new Date().toISOString();
  const assignments = targets.map((assigneeEmail, index) => {
    const ref = doc(tasks, index ? `${input.taskId}_${index}` : input.taskId);
    const assignee = people.get(assigneeEmail)!.name;
    if (!existing.empty) return { id: ref.id, assignee };
    const approverEmail = input.approverEmail ??
      (input.requireReview !== false && assigneeEmail !== by && people.get(by)?.canReview ? by : '');
    const attachments = attach(batch, ref, files, by, now);
    const comments = input.message || attachments.length
      ? [{ by, at: now, kind: 'assignment', text: input.message.trim(), files: attachments }] : [];
    batch.set(ref, { ...details(input), ...(category ? { category } : {}), assigneeEmail, assignee, approverEmail, assignedBy: by, mobileAssignmentId: input.taskId,
      ...(input.requireReview !== undefined && { requireReview: input.requireReview }),
      status: input.status, progress: input.checklist.length ? 0 : input.progress,
      checklist: input.checklist.map(({ t, weight }) => ({ t, weight, done: false })), comments,
      spawned: input.repeat !== 'Không lặp', doneAt: '', createdAt: now, ...updated(by, now),
      ...(input.repeat !== 'Không lặp' && { repeatSchedule: { cadence: input.repeat, period: 0, checkLegacy: false } }),
    });
    notify(batch, by, [assigneeEmail], ref.id, 'Bạn được giao việc mới', input.title.trim(), now);
    return { id: ref.id, assignee };
  });
  if (existing.empty) await batch.commit();
  return { data: { assignments } };
}

export async function pilotUpdate(input: AssignmentInput & { revision: string; retainedFileIds: string[] }) {
  const by = email();
  const [assigneeEmail] = input.assigneeEmails;
  const category = assignmentCategory(input.category);
  const files = uploadBytes(input.attachments ?? []);
  const people = new Map((await directory()).map(member => [member.email, member]));
  const ref = doc(db, 'tasks', input.taskId);
  await runTransaction(db, async tx => {
    const task = (await tx.get(ref)).data() as Task | undefined;
    if (task?.assignedBy !== by) throw new Error('Chỉ người giao việc mới được chỉnh sửa công việc này.');
    if (task.status === 'Xong') throw new Error('Công việc đã xong và chỉ có thể xem chi tiết.');
    if ((task.updatedAt ?? '') !== input.revision) throw new Error('Công việc vừa thay đổi. Hãy mở lại để chỉnh sửa.');
    const now = new Date(Math.max(Date.now(), (Date.parse(input.revision) || 0) + 1)).toISOString();
    const comments = [...(task.comments ?? [])];
    const index = comments.findIndex(comment => comment.by === by &&
      (comment.kind === 'assignment' || comment.at === task.createdAt));
    const original = comments[index];
    const retained = original?.files?.filter(file => input.retainedFileIds.includes(file.id)) ?? [];
    if (retained.length !== input.retainedFileIds.length || retained.length + files.length > 5 ||
        retained.reduce((size, file) => size + file.size, 0) + files.reduce((size, file) => size + file.bytes.length, 0) > 8 * 1024 * 1024) {
      throw new Error('Chọn tối đa 5 tệp đính kèm với tổng dung lượng không quá 8 MB.');
    }
    const attachments = [...retained, ...attach(tx, ref, files, by, now)];
    if (index >= 0) comments.splice(index, 1);
    if (input.message || attachments.length) comments.splice(Math.max(0, index), 0,
      { by, at: original?.at ?? now, kind: 'assignment', text: input.message.trim(), files: attachments });
    const patch: Record<string, unknown> = { ...details(input), comments, ...updated(by, now),
      ...(input.repeat !== 'Không lặp' && { spawned: true }) };
    if (category !== undefined && category !== (task.category ?? '')) patch.category = category;
    if (open(task)) {
      const approverEmail = input.approverEmail ?? task.approverEmail ?? '';
      if (!people.has(assigneeEmail) && assigneeEmail !== task.assigneeEmail) throw new Error('Người thực hiện không còn hoạt động.');
      if (approverEmail && (approverEmail === assigneeEmail || !people.get(approverEmail)?.canReview)) {
        throw new Error('Người duyệt phải có quyền duyệt và khác người thực hiện.');
      }
      const original = task.checklist ?? [];
      const indices = input.checklist.flatMap(({ sourceIndex }) => sourceIndex == null ? [] : [sourceIndex]);
      const reserved = new Set(indices);
      if (reserved.size !== indices.length || indices.some(index => !Number.isSafeInteger(index) || index < 0 || !original[index])) {
        throw new Error('Việc con không hợp lệ.');
      }
      const remaining = original.filter((_, index) => !reserved.has(index));
      const items = input.checklist.map(({ t, weight, sourceIndex }) => {
        if (sourceIndex === null) return { t, weight, done: false };
        if (sourceIndex !== undefined) return { t, weight, done: original[sourceIndex].done === true };
        const item = remaining.findIndex(row => (row.t || row.text) === t);
        return item < 0 ? { t, weight, done: false } : { ...remaining.splice(item, 1)[0], weight };
      });
      Object.assign(patch, { assigneeEmail, approverEmail, status: input.status,
        checklist: items, progress: items.length ? percent(items) : input.progress });
      if (input.requireReview !== undefined) patch.requireReview = input.requireReview;
      if (assigneeEmail !== task.assigneeEmail) patch.assignee = people.get(assigneeEmail)!.name;
      if (input.status !== task.status) {
        const fields = ['assignedBy','assigneeEmail','assignee','approverEmail','due','projectId','priority',
          'repeat','watchers','title','startDate','note','milestone','category','requireReview'] as const;
        const taskFields = { ...task, id: input.taskId };
        if (fields.some(key => Object.hasOwn(patch, key) &&
          JSON.stringify(patch[key]) !== JSON.stringify(taskFields[key]))) {
          throw new Error('Hãy lưu thông tin công việc trước, rồi cập nhật trạng thái riêng.');
        }
      }
    } else if (task.status === 'Chờ duyệt' && input.approverEmail) {
      if (input.approverEmail === task.assigneeEmail || !people.get(input.approverEmail)?.canReview) {
        throw new Error('Người duyệt phải có quyền duyệt và khác người thực hiện.');
      }
      patch.approverEmail = input.approverEmail;
    }
    for (const { to, title, body } of taskRoleNotices(task, { ...task, ...patch })) {
      writeTaskNotice(tx, by, to, ref.id, title, body, now);
    }
    tx.update(ref, patch);
  });
}

export async function pilotChecklist(input: { taskId: string; index: number; label: string; done: boolean }) {
  const by = email();
  const ref = doc(db, 'tasks', input.taskId);
  await runTransaction(db, async tx => {
    const task = (await tx.get(ref)).data() as Task | undefined;
    const items = [...(task?.checklist ?? [])];
    const item = items[input.index];
    if (!task || task.assigneeEmail !== by || !open(task) || !item || (item.t || item.text || '') !== input.label) {
      throw new Error('Checklist vừa thay đổi hoặc công việc không còn cho phép chỉnh sửa.');
    }
    items[input.index] = { ...item, done: input.done };
    tx.update(ref, { checklist: items, progress: percent(items), ...updated(by, new Date().toISOString()) });
  });
}

export async function pilotReport(input: { taskId: string; note: string }) {
  const by = email();
  const ref = doc(db, 'tasks', input.taskId);
  await runTransaction(db, async tx => {
    const [snapshot, settings] = await Promise.all([tx.get(ref), tx.get(doc(db, 'settings', 'work'))]);
    const task = snapshot.data() as Task | undefined;
    if (!task || task.assigneeEmail !== by) throw new Error('Bạn không có quyền báo hoàn thành công việc này.');
    if (task.status === 'Chờ duyệt' || (task.status === 'Xong' && task.progress === 100 && task.doneAt)) return;
    if (!open(task)) throw new Error('Công việc này hiện không thể báo hoàn thành.');
    if (task.checklist?.some(item => !item.done)) throw new Error('Hãy đánh dấu xong tất cả việc con.');
    if (!task.checklist?.length && task.progress !== 100) {
      throw new Error('Đặt và lưu tiến độ 100% để báo hoàn thành.');
    }
    const text = input.note.trim();
    if (text.length > 1000 || (settings.get('requireReportNote') === true && !text)) {
      throw new Error('Hãy ghi kết quả thực hiện trong tối đa 1.000 ký tự.');
    }
    const requiresReview = typeof task.requireReview === 'boolean'
      ? task.requireReview : settings.get('requireReview') !== false;
    if (requiresReview && !task.approverEmail) throw new Error('Hãy nhờ người giao việc chỉ định người duyệt trước khi báo hoàn thành.');
    const now = new Date().toISOString();
    tx.update(ref, { status: requiresReview ? 'Chờ duyệt' : 'Xong', progress: 100, doneAt: now, ...updated(by, now),
      ...(text ? { comments: [...(task.comments ?? []), { by, at: now, text, files: [] }] } : {}) });
    const recipients = requiresReview ? [task.assignedBy, task.approverEmail] : [task.assignedBy];
    notify(tx, by, recipients, ref.id, requiresReview ? 'Công việc chờ duyệt' : `Việc “${task.title}” chuyển sang Xong`, task.title, now);
  });
}

export async function pilotReview(input: { taskId: string; submission: string; decision: 'approve' | 'rework'; rating: ReviewRating | ''; note: string }) {
  const by = email();
  const ref = doc(db, 'tasks', input.taskId);
  const approved = input.decision === 'approve';
  const reviewNote = input.note.trim();
  if (reviewNote.length > 1000 || (approved ? !input.rating : !reviewNote)) throw new Error('Hãy nhập thông tin duyệt công việc.');
  await runTransaction(db, async tx => {
    const task = (await tx.get(ref)).data() as Task | undefined;
    if (!task || task.approverEmail !== by || task.assigneeEmail === by || task.status !== 'Chờ duyệt' ||
        (task.doneAt || task.updatedAt || '') !== input.submission) throw new Error('Lượt gửi duyệt này đã thay đổi hoặc bạn không có quyền duyệt.');
    const now = new Date().toISOString();
    const change: Record<string, unknown> = { status: approved ? 'Xong' : 'Đang làm',
      progress: approved ? 100 : task.checklist?.length ? percent(task.checklist) : task.progress ?? 0,
      doneAt: approved ? task.doneAt || now : '', rating: approved ? input.rating : '',
      reviewNote, reviewedBy: by, reviewedAt: now, ...updated(by, now) };
    tx.update(ref, change);
    notify(tx, by, [task.assigneeEmail, task.assignedBy], ref.id,
      approved ? 'Công việc đã được duyệt' : 'Công việc cần làm lại', reviewNote || task.title, now);
  });
}

export async function pilotDownload(input: { taskId: string; fileId: string }) {
  email();
  const task = (await getDocFromServer(doc(db, 'tasks', input.taskId))).data() as Task | undefined;
  if (!task?.comments?.some(comment => comment.files?.some(file => file.id === input.fileId))) {
    throw new Error('Không tìm thấy tệp trong công việc.');
  }
  const ref = doc(db, 'files', input.fileId);
  const meta = (await getDocFromServer(ref)).data();
  if (!meta || (meta.scopeType && (meta.scopeType !== 'tasks' || meta.scopeId !== input.taskId)) ||
      !Number.isInteger(meta.size) || meta.size < 0 || meta.size > maxFileSize ||
      !Number.isInteger(meta.chunks) || meta.chunks < 1 || meta.chunks > 6) throw new Error('Tệp đính kèm không khả dụng.');
  const snapshots = await Promise.all(Array.from({ length: meta.chunks }, (_, i) =>
    getDocFromServer(doc(ref, 'chunks', String(i)))));
  const bytes = new Uint8Array(meta.size);
  let length = 0;
  for (const [index, snapshot] of snapshots.entries()) {
    const data = snapshot.get('data');
    if (!(data instanceof Bytes) || snapshot.get('i') !== index) throw new Error('Tệp đính kèm chưa đầy đủ.');
    const part = data.toUint8Array();
    if (length + part.length > bytes.length) throw new Error('Tệp đính kèm không hợp lệ.');
    bytes.set(part, length);
    length += part.length;
  }
  if (length !== bytes.length) throw new Error('Tệp đính kèm chưa đầy đủ.');
  return { data: { base64: Bytes.fromUint8Array(bytes).toBase64() } };
}
