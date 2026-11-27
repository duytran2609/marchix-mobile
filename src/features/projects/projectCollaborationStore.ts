import { collection, doc, getDocFromServer, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp,
  setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import type { Query, Timestamp, WriteBatch } from 'firebase/firestore';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { pilotProjectMentionId } from '../notifications/projectMention';
import { db, pilotMode } from '../../services/firebase/firebase';
import { prepareCashFiles, readScopedFileBytes, writeScopedFiles } from '../cash/cashAttachments';
import type { AttachmentFile } from '../../utils/attachmentFile';
import type { PickedAttachment } from '../tasks/taskAttachments';
import type { TaskAttachment } from '../tasks/tasks';

export const postKinds = ['Cập nhật', 'Hỏi đáp', 'Báo vướng', 'Xin quyết định'] as const;
export type PostKind = typeof postKinds[number];
export type ProjectComment = { id: string; body: string; replyTo: string; files: TaskAttachment[]; createdBy: string; createdAt?: Timestamp };
export type ProjectPost = ProjectComment & {
  title: string; kind: PostKind; taskId: string; status: 'open' | 'resolved'; pinned: boolean; conclusion: string; mentions: string[];
};
export type ProjectLibraryFile = TaskAttachment & { folderPath: string; createdAt?: Timestamp; createdBy: string };
export type ProjectFolder = { id: string; path: string };
export type CollaborationMember = { id: string; name: string; role: string; enabled?: boolean; photoURL?: string | null };

const projectRef = (projectId: string) => doc(db, 'projects', projectId);
const projectCollection = (projectId: string, name: string) => collection(projectRef(projectId), name);
const postRef = (projectId: string, postId: string) => doc(projectCollection(projectId, 'posts'), postId);
const confirmed = { includeMetadataChanges: true };

function watchRows<T>(source: Query, receive: (rows: T[]) => void, fail: () => void) {
  return onSnapshot(source, confirmed, snapshot => {
    if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
    receive(snapshot.docs.map(row => ({ ...row.data(), id: row.id }) as T));
  }, fail);
}

export function watchCollaborationMembers(receive: (rows: CollaborationMember[]) => void, fail: () => void) {
  return watchRows<CollaborationMember>(collection(db, 'members'), rows =>
    receive(rows.filter(row => row.enabled !== false).sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, 'vi'))), fail);
}

export function watchProjectPosts(projectId: string, count: number, receive: (rows: ProjectPost[]) => void, fail: () => void) {
  return watchRows(query(projectCollection(projectId, 'posts'), orderBy('createdAt', 'desc'), limit(count)), receive, fail);
}

export function watchProjectComments(projectId: string, postId: string, receive: (rows: ProjectComment[]) => void, fail: () => void) {
  return watchRows<ProjectComment>(query(collection(postRef(projectId, postId), 'comments'), orderBy('createdAt', 'desc'), limit(100)),
    rows => receive(rows.reverse()), fail);
}

export function watchProjectLibrary(projectId: string, receive: (rows: ProjectLibraryFile[]) => void, fail: () => void) {
  return watchRows(query(projectCollection(projectId, 'library'), orderBy('createdAt', 'desc'), limit(100)), receive, fail);
}

export function watchProjectFolders(projectId: string, receive: (rows: ProjectFolder[]) => void, fail: () => void) {
  return watchRows(query(projectCollection(projectId, 'folders'), orderBy('path'), limit(100)), receive, fail);
}

export function watchProjectLike(projectId: string, postId: string, email: string, receive: (liked: boolean) => void) {
  return onSnapshot(doc(postRef(projectId, postId), 'reactions', email), confirmed, snapshot => {
    if (!snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites) receive(snapshot.exists());
  }, () => receive(false));
}

async function attach(batch: WriteBatch, projectId: string, email: string, folderPath: string, picked: PickedAttachment[]) {
  if (folderPath.length > 500) throw Error('Đường dẫn thư mục quá dài.');
  const files = writeScopedFiles(batch, projectRef(projectId), 'projects', await prepareCashFiles(picked),
    email, new Date().toISOString());
  for (const { id, ...file } of files) {
    batch.set(doc(projectCollection(projectId, 'library'), id), {
      ...file, folderPath, createdBy: email, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
  }
  return files;
}

export async function publishProjectPost(projectId: string, email: string, input: {
  title: string; body: string; kind: PostKind; taskId: string; mentions: string[];
}) {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title || !body) throw Error('Nhập tiêu đề và nội dung trao đổi.');
  const batch = writeBatch(db);
  const ref = doc(projectCollection(projectId, 'posts'));
  const mentions = [...new Set(input.mentions)].filter(value => value !== email);
  batch.set(ref, { title, body, kind: input.kind, taskId: input.taskId, mentions, files: [],
    status: 'open', pinned: false, conclusion: '', createdBy: email, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await batch.commit();
  const results = await Promise.allSettled(mentions.map(async to => {
    const notification = doc(collection(db, 'notifications'));
    const target = pilotMode
      ? doc(db, 'notifications', pilotProjectMentionId(projectId, notification.id))
      : notification;
    await setDoc(target, {
      to, from: email, title: 'Bạn được nhắc trong dự án',
      body: 'Mở mục Trao đổi & tài liệu để xem nội dung.', link: '#du-an',
      ...(pilotMode ? {} : { kind: 'projectMention', projectId, postId: ref.id }),
      createdAt: new Date().toISOString(), read: false, emailed: false,
    });
  }));
  return results.filter(result => result.status === 'rejected').length;
}

export async function publishProjectComment(projectId: string, postId: string, email: string, body: string,
  replyTo: string) {
  if (!body.trim()) throw Error('Nhập nội dung bình luận.');
  const batch = writeBatch(db);
  batch.set(doc(collection(postRef(projectId, postId), 'comments')), {
    body: body.trim(), replyTo, files: [], createdBy: email, createdAt: serverTimestamp(),
  });
  await batch.commit();
}

export function toggleProjectLike(projectId: string, postId: string, email: string) {
  const ref = doc(postRef(projectId, postId), 'reactions', email);
  return runTransaction(db, async tx => {
    if ((await tx.get(ref)).exists()) tx.delete(ref);
    else tx.set(ref, { by: email, at: serverTimestamp() });
  });
}

export function pinProjectPost(projectId: string, postId: string, pinned: boolean) {
  return updateDoc(postRef(projectId, postId), { pinned, updatedAt: serverTimestamp() });
}

export async function resolveProjectPost(projectId: string, postId: string, conclusion?: string) {
  if (conclusion !== undefined && !conclusion.trim()) throw Error('Nhập kết luận trước khi chốt.');
  await updateDoc(postRef(projectId, postId), {
    ...(conclusion === undefined ? { status: 'open' } : { status: 'resolved', conclusion: conclusion.trim() }),
    updatedAt: serverTimestamp(),
  });
}

export async function createProjectFolder(projectId: string, email: string, parent: string, name: string) {
  const clean = name.trim().replaceAll('/', '-');
  if (!clean || clean === '.' || clean === '..') throw Error('Nhập tên thư mục hợp lệ.');
  const path = [parent, clean].filter(Boolean).join('/');
  if (path.length > 500) throw Error('Đường dẫn thư mục quá dài.');
  const id = bytesToHex(sha256(utf8ToBytes(path))).slice(0, 20);
  const ref = doc(projectCollection(projectId, 'folders'), id);
  await runTransaction(db, async tx => {
    if ((await tx.get(ref)).exists()) throw Error('Thư mục này đã có.');
    tx.set(ref, { path, createdBy: email, createdAt: serverTimestamp() });
  });
  return path;
}

export async function uploadProjectFiles(projectId: string, email: string, folderPath: string, files: PickedAttachment[]) {
  if (!files.length) throw Error('Chọn tệp trước khi tải lên.');
  const batch = writeBatch(db);
  await attach(batch, projectId, email, folderPath || 'Chung', files);
  await batch.commit();
}

export function removeProjectLibraryEntry(projectId: string, fileId: string) {
  const entry = doc(projectCollection(projectId, 'library'), fileId);
  return runTransaction(db, async tx => {
    if ((await tx.get(entry)).exists()) tx.delete(entry);
  });
}

export async function readProjectAttachment(projectId: string, file: TaskAttachment): Promise<AttachmentFile> {
  const ref = doc(db, 'files', file.id);
  const meta = (await getDocFromServer(ref)).data();
  if (!meta || meta.parent !== projectRef(projectId).path || meta.scopeType !== 'projects' ||
      meta.scopeId !== projectId || meta.size !== file.size || meta.name !== file.name) {
    throw Error('Tệp không còn thuộc dự án hoặc dữ liệu không hợp lệ.');
  }
  const bytes = await readScopedFileBytes(ref, file.size, meta.chunks, meta.sha256);
  const type = typeof meta.type === 'string' && /^[\w.+-]+\/[\w.+-]+$/.test(meta.type) ? meta.type : 'application/octet-stream';
  return { bytes, type, name: file.name };
}
