import { collection, doc, onSnapshot, query, runTransaction, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, pilotMode, taskAssignmentEnabled, taskFunctions } from '../../services/firebase/firebase';
import { watchMemberDirectory } from '../auth/memberDirectory';
import { fetchTaskDirectory, pilotAddAttachments, pilotChecklist, pilotCreate, pilotDirectory, pilotDownload, pilotReport, pilotReview, pilotUpdate } from './pilotTasks';
import { editableStatuses } from './taskStatuses';
export { taskCategoryMaxLength } from './pilotTasks';
export { editableStatuses, taskStatuses } from './taskStatuses';

export type EditableStatus = typeof editableStatuses[number];
export const reviewRatings = ['Xuất sắc', 'Tốt', 'Khá', 'Trung bình', 'Kém'] as const;
export type ReviewRating = typeof reviewRatings[number];
export const commentMaxLength = 1000;
export const taskTitleMaxLength = 160;
export type TaskAssignee = { email: string; name: string; canReview?: boolean; photoURL?: string | null };
export type TaskAttachment = { id: string; name: string; type: string; size: number };
export type AttachmentUpload = Pick<TaskAttachment, 'name' | 'type'> & { base64: string };
export type TaskAttachmentMessage = { taskId: string; attachments: AttachmentUpload[]; message?: string };
export type AssignmentProject = { id: string; name: string };
export const taskPriorities = ['Cao', 'Trung bình', 'Thấp'] as const;
export const taskRepeatOptions = ['Không lặp', 'Hằng tuần', 'Hằng tháng'] as const;
export const taskCompletionModes = [
  { value: 'report', label: 'Chỉ báo cáo kết quả' },
  { value: 'review', label: 'Cần nghiệm thu' },
] as const;
export type AssignmentOptions = {
  priority: typeof taskPriorities[number];
  status: EditableStatus;
  repeat: typeof taskRepeatOptions[number];
  projectId: string;
  milestone: boolean;
  requireReview?: boolean;
};

type ChecklistItem = { t?: string; text?: string; done: boolean; weight?: number };
export type TaskReplyTarget = { index: number; by: string; at: string };
type TaskComment = { by: string; at: string; text: string; files?: TaskAttachment[]; kind?: 'assignment'; replyTo?: TaskReplyTarget };

export type Task = {
  id: string;
  title: string;
  category?: string;
  note?: string;
  startDate?: string;
  due?: string;
  priority?: string;
  status: string;
  progress?: number;
  assigneeEmail: string;
  assignee?: string;
  assignedBy?: string;
  projectId?: string;
  repeat?: string;
  recurrenceOn?: string;
  watchers?: string[];
  approverEmail?: string;
  requireReview?: boolean;
  milestone?: boolean;
  createdAt?: string;
  doneAt?: string;
  reviewedAt?: string;
  remindedAt?: string;
  updatedAt?: string;
  checklist?: ChecklistItem[];
  comments?: TaskComment[];
  rating?: string;
  reviewNote?: string;
};

export function editableStatus(status: string): status is EditableStatus {
  return editableStatuses.some(value => value === status);
}

export const remindTask = httpsCallable<{
  taskId: string; assigneeEmail: string; previousReminder: string | null;
}>(taskFunctions, 'remindMobileTask');

export function getAssignmentComment(task: Task) {
  return task.assignedBy ? task.comments?.find(comment => comment.by === task.assignedBy &&
    (comment.kind === 'assignment' || (task.createdAt && comment.at === task.createdAt))) : undefined;
}

export function findTaskReplyIndex(comments: readonly TaskComment[], target: TaskReplyTarget) {
  const matches = (comment?: TaskComment) => comment?.by === target.by && comment?.at === target.at;
  if (matches(comments[target.index])) return target.index;
  return comments.findIndex(matches);
}

export function parseTaskProgress(text: string) {
  const value = Number(text);
  return /^\d+$/.test(text) && value <= 100 ? value : undefined;
}

export function watchTask(id: string, onTask: (task: Task | null) => void, onError: () => void) {
  return onSnapshot(doc(db, 'tasks', id), { includeMetadataChanges: true }, snapshot => {
    // A direct link must be authorized for the current session before showing cached task data.
    if (snapshot.metadata.fromCache) return;
    onTask(snapshot.exists() ? { ...snapshot.data(), id: snapshot.id } as Task : null);
  }, onError);
}

function compareTasks(left: Task, right: Task) {
  return Number(editableStatus(right.status)) - Number(editableStatus(left.status)) ||
    (left.due || '9999').localeCompare(right.due || '9999') ||
    left.title.localeCompare(right.title, 'vi');
}

export function watchTeamTasks(onTasks: (tasks: Task[]) => void, onError: () => void) {
  return onSnapshot(collection(db, 'tasks'), { includeMetadataChanges: true }, snapshot => {
    if (snapshot.metadata.fromCache) return;
    onTasks(snapshot.docs.map(row => ({ ...row.data(), id: row.id } as Task)).sort(compareTasks));
  }, onError);
}

export function watchTasks(email: string, onTasks: (tasks: Task[], complete: boolean) => void, onError: () => void, onSentError: () => void) {
  const tasks = collection(db, 'tasks');
  let received: Task[] | undefined;
  let sent: Task[] = [];
  let receivedReady = false;
  let sentReady = false;

  function publish() {
    if (!received) return;
    const combined = new Map(sent.map(task => [task.id, task]));
    for (const task of received) combined.set(task.id, task);
    onTasks(Array.from(combined.values()).sort(compareTasks), receivedReady && sentReady);
  }

  const stopReceived = onSnapshot(query(tasks, where('assigneeEmail', '==', email)), { includeMetadataChanges: true }, snapshot => {
    received = snapshot.docs.map(row => ({ ...row.data(), id: row.id } as Task));
    receivedReady ||= !snapshot.metadata.fromCache;
    publish();
  }, onError);
  const stopSent = onSnapshot(query(tasks, where('assignedBy', '==', email)), { includeMetadataChanges: true }, snapshot => {
    sent = snapshot.docs.map(row => ({ ...row.data(), id: row.id } as Task));
    sentReady ||= !snapshot.metadata.fromCache;
    publish();
  }, () => {
    sent = [];
    sentReady = true;
    publish();
    onSentError();
  });
  return () => { stopReceived(); stopSent(); };
}

export function submissionVersion(task: Task) {
  return task.doneAt || task.updatedAt || '';
}

export type ReviewQueueTasks = { mine: Task[]; needsReviewer?: Task[] };

export function watchReviewQueue(email: string, isAdmin: boolean, hasReviewGrant: boolean,
  onTasks: (tasks: ReviewQueueTasks) => void, onError: () => void) {
  const tasks = collection(db, 'tasks');
  const pending = where('status', '==', 'Chờ duyệt');
  // Pilot shares the web's task visibility. Other environments may restrict reads to task participants.
  const browseAll = pilotMode && isAdmin;
  const readDesignated = hasReviewGrant && !browseAll;
  let managed: Task[] | undefined;
  let designated: Task[] | undefined = readDesignated ? undefined : [];
  let reviewers: Set<string> | undefined;

  function compare(left: Task, right: Task) {
    return submissionVersion(right).localeCompare(submissionVersion(left)) || left.title.localeCompare(right.title, 'vi');
  }

  function publish() {
    if (!managed || !designated) return;
    const mine = (browseAll ? managed : designated).filter(task =>
      hasReviewGrant && task.approverEmail === email && task.assigneeEmail !== email);
    const needsReviewer = managed.filter(task =>
      !task.approverEmail || task.approverEmail === task.assigneeEmail ||
      reviewers?.has(task.approverEmail) === false);
    onTasks({ mine: mine.sort(compare), needsReviewer: needsReviewer.sort(compare) });
  }

  let stopDirectory: (() => void) | undefined;
  const managedQuery = browseAll ? query(tasks, pending) : query(tasks, where('assignedBy', '==', email), pending);
  const stopManaged = onSnapshot(managedQuery, snapshot => {
    managed = snapshot.docs.map(row => ({ ...row.data(), id: row.id } as Task));
    const needsDirectory = managed.some(task => task.approverEmail && task.approverEmail !== task.assigneeEmail);
    if (!needsDirectory) {
      stopDirectory?.();
      stopDirectory = undefined;
      reviewers = undefined;
    } else if (!stopDirectory) {
      stopDirectory = watchMemberDirectory(isAdmin, members => {
        reviewers = new Set(members.filter(member => member.canReviewTasks).map(member => member.email));
        publish();
      }, onError);
    }
    publish();
  }, () => {
    managed = [];
    onError();
    publish();
  });
  const stopDesignated = readDesignated ? onSnapshot(query(tasks, where('approverEmail', '==', email), pending), snapshot => {
    designated = snapshot.docs.map(row => ({ ...row.data(), id: row.id } as Task));
    publish();
  }, () => {
    designated = [];
    onError();
    publish();
  }) : undefined;
  return () => { stopManaged(); stopDesignated?.(); stopDirectory?.(); };
}

export async function saveProgress(task: Task, email: string, status: EditableStatus, progress?: number) {
  if (pilotMode && !taskAssignmentEnabled) throw new Error('Bản pilot chỉ xem công việc.');
  if (!editableStatus(status) || (progress !== undefined &&
      (!Number.isInteger(progress) || progress < 0 || progress > 100))) {
    throw new Error('Tiến độ phải là số nguyên từ 0 đến 100.');
  }

  const ref = doc(db, 'tasks', task.id);
  return runTransaction(db, async transaction => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.data() as Task | undefined;
    if (!current || current.assigneeEmail !== email || !editableStatus(current.status)) {
      throw new Error('Công việc này hiện không thể cập nhật tiến độ.');
    }
    if (current.updatedAt !== task.updatedAt || current.status !== task.status ||
        current.progress !== task.progress) {
      throw new Error('Công việc vừa thay đổi. Mở lại để cập nhật từ bản mới nhất.');
    }

    const update = {
      status,
      ...(progress !== undefined && !current.checklist?.length ? { progress } : {}),
      updatedAt: new Date().toISOString(),
      updatedBy: email,
    };
    transaction.update(ref, update);
    return { ...current, ...update, id: task.id };
  });
}

export async function addTaskComment(taskId: string, email: string, message: string) {
  if (pilotMode && !taskAssignmentEnabled) throw new Error('Bản pilot chỉ xem công việc.');
  const text = message.trim();
  if (!text || text.length > commentMaxLength) {
    throw new Error('Nhập nội dung trao đổi từ 1 đến 1.000 ký tự.');
  }

  const ref = doc(db, 'tasks', taskId);
  const comment = { by: email, at: new Date().toISOString(), text, files: [] };
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(ref);
    const task = snapshot.data() as Task | undefined;
    if (!task || task.assigneeEmail !== email) {
      throw new Error('Bạn không còn quyền gửi trao đổi cho công việc này.');
    }
    if (task.status === 'Xong') throw new Error('Công việc đã xong và chỉ có thể xem chi tiết.');
    const comments = task.comments ?? [];
    transaction.update(ref, { comments: [...comments, comment] });
  });
}

export const updateTaskComment = httpsCallable<{ taskId: string; target: TaskReplyTarget; message: string | null }>(
  taskFunctions, 'updateMobileTaskComment', { timeout: 12000 },
);

export const setTaskChecklistItem = pilotMode ? pilotChecklist : httpsCallable<{
  taskId: string;
  index: number;
  label: string;
  done: boolean;
}>(taskFunctions, 'setTaskChecklistItem', { timeout: 12000 });

export const reportTaskCompletion = pilotMode ? pilotReport : httpsCallable<{ taskId: string; note: string }>(
  taskFunctions, 'reportTaskCompletion', { timeout: 12000 },
);

export const reviewTaskCompletion = pilotMode ? pilotReview : httpsCallable<{
  taskId: string;
  submission: string;
  decision: 'approve' | 'rework';
  rating: ReviewRating | '';
  note: string;
}>(taskFunctions, 'reviewTaskCompletion', { timeout: 30000 });

export const listTaskAssignees = pilotMode ? pilotDirectory : fetchTaskDirectory;

export function newTaskId() {
  return doc(collection(db, 'tasks')).id;
}

export type AssignmentInput = {
  taskId: string; title: string; assigneeEmails: string[]; due: string; startDate: string;
  category?: string;
  note: string; message: string; checklist: { t: string; weight: number; sourceIndex?: number | null }[]; watchers: string[]; progress: number; approverEmail?: string;
  attachments?: AttachmentUpload[];
} & AssignmentOptions;

export const createTask = pilotMode ? pilotCreate : httpsCallable<AssignmentInput, { assignments: { id: string; assignee: string }[] }>(
  taskFunctions, 'createMobileTask', { timeout: 90000 },
);

export const updateTask = pilotMode ? pilotUpdate : httpsCallable<AssignmentInput & { revision: string; retainedFileIds: string[] }>(
  taskFunctions, 'updateMobileTask', { timeout: 90000 },
);

export const deleteTask = httpsCallable<{ taskId: string }, void>(taskFunctions, 'deleteMobileTask');

export const downloadTaskAttachment = pilotMode ? pilotDownload : httpsCallable<{ taskId: string; fileId: string }, { base64: string }>(
  taskFunctions, 'downloadMobileTaskAttachment', { timeout: 45000 },
);

export const addTaskAttachments = pilotMode ? pilotAddAttachments : httpsCallable<TaskAttachmentMessage>(
  taskFunctions, 'addMobileTaskAttachments', { timeout: 90000 },
);

export const replyToTaskComment = httpsCallable<TaskAttachmentMessage & { replyTo: TaskReplyTarget }>(
  taskFunctions, 'replyToMobileTaskComment', { timeout: 90000 },
);
