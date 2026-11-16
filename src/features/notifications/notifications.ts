import { collection, doc, getDocFromServer, onSnapshot, query, where, writeBatch } from 'firebase/firestore';
import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from '../../services/firebase/firebase';
import { notificationProjectId } from './projectMention';
import type { Task } from '../tasks/tasks';

export type WorkspaceNotification = {
  id: string;
  title: string;
  body: string;
  link: string;
  createdAt: string;
  read: boolean;
  taskId?: string;
  projectId?: string;
};

export type NotificationTaskTarget = { id: string } | { title: string; assignment?: true };

export function notificationTaskTarget(note: WorkspaceNotification): NotificationTaskTarget | undefined {
  if (note.taskId) return { id: note.taskId };
  if (note.link === '#cho-duyet' && note.title === 'Có việc chờ duyệt') return { title: note.body };
  if (note.link !== '#cong-viec') return undefined;
  if (note.title === 'Bạn được giao việc mới') return { title: note.body, assignment: true };

  const title = /^(?:Nhắc việc|Trao đổi mới): (.+)$/s.exec(note.title)?.[1]
    ?? /^(?:Việc |.+ báo hoàn thành )“(.+)” (?:chuyển sang .+|đã được duyệt:.*|cần làm lại|— chờ duyệt)$/s.exec(note.title)?.[1]
    ?? (note.title === 'Nhắc việc' ? note.body : '');
  return title ? { title } : undefined;
}

export function findNotificationTask(target: { title: string; assignment?: true }, tasks: Task[], email: string) {
  const title = target.title.trim();
  const matches = tasks.filter(task => {
    const name = task.title?.trim();
    if (!name) return false;
    if (!target.assignment) return name === title;
    return task.assigneeEmail === email && (name === title ||
      title.startsWith(`${name} – hạn `) || title.startsWith(`${name} · `));
  });
  return matches.length === 1 ? matches[0] : undefined;
}

function readNotification(row: QueryDocumentSnapshot<DocumentData>): WorkspaceNotification {
  const data = row.data();
  return {
    id: row.id,
    title: typeof data.title === 'string' ? data.title : 'Thông báo',
    body: typeof data.body === 'string' ? data.body : '',
    link: typeof data.link === 'string' ? data.link : '',
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : '',
    read: data.read === true,
    taskId: typeof data.taskId === 'string' && /^[^/\s]+$/.test(data.taskId) && !/^\.{1,2}$/.test(data.taskId)
      ? data.taskId : undefined,
    projectId: notificationProjectId(data, row.id),
  };
}

export async function loadNotification(id: string, email: string) {
  if (!id || id.length > 1500 || id.includes('/') || id === '.' || id === '..') return undefined;
  const row = await getDocFromServer(doc(db, 'notifications', id));
  return row.exists() && row.get('to') === email ? readNotification(row) : undefined;
}

export function watchNotifications(email: string, onChange: (notes: WorkspaceNotification[]) => void, onError: () => void) {
  const inbox = query(collection(db, 'notifications'), where('to', '==', email));
  return onSnapshot(inbox, snapshot => {
    const notes = snapshot.docs.map(readNotification);
    onChange(notes.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }, onError);
}

export async function markNotificationsRead(notes: WorkspaceNotification[]) {
  const unread = notes.filter(note => !note.read);
  const batchSize = 450;
  for (let start = 0; start < unread.length; start += batchSize) {
    const batch = writeBatch(db);
    for (const note of unread.slice(start, start + batchSize)) {
      batch.update(doc(db, 'notifications', note.id), { read: true });
    }
    await batch.commit();
  }
}
