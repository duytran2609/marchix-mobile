import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { Bytes, collection, doc, getDocFromServer, getDocsFromServer } from 'firebase/firestore';
import type { DocumentData, DocumentReference } from 'firebase/firestore';
import { db } from '../../services/firebase/firebase';
import type { PickedAttachment } from '../tasks/taskAttachments';
import type { TaskAttachment } from '../tasks/tasks';

export type CashAttachment = TaskAttachment;
const mib = 1024 * 1024;
const chunkSize = 900 * 1024;
const maxSize = 5 * mib;
const binary = 'application/octet-stream';
const mimePattern = /^[\w.+-]+\/[\w.+-]+$/;

export function cashFileLimit(files: Pick<CashAttachment, 'size' | 'name'>[]) {
  if (files.length > 5) return 'Chọn tối đa 5 tệp trong một lượt.';
  const invalid = files.find(file => !file.name.trim() || file.name.length > 255 || file.size < 1 || file.size > maxSize);
  if (invalid) return `Tệp “${invalid.name}” phải có tên hợp lệ và dung lượng từ 1 B đến 5 MB.`;
  if (files.reduce((sum, file) => sum + file.size, 0) > 8 * mib) return 'Tổng dung lượng mỗi lượt tối đa 8 MB.';
  return '';
}

export async function prepareCashFiles(picked: PickedAttachment[]) {
  const invalid = cashFileLimit(picked);
  if (invalid) throw new Error(invalid);
  return Promise.all(picked.map(async ({ name, type, size, read }) => {
    const bytes = Bytes.fromBase64String(await read()).toUint8Array();
    if (bytes.length !== size) throw new Error(`Tệp “${name}” đã thay đổi. Vui lòng chọn lại.`);
    return {
      file: { id: doc(collection(db, 'files')).id, name, type: mimePattern.test(type) ? type : binary, size },
      bytes, sha256: bytesToHex(sha256(bytes)),
    };
  }));
}

export type PreparedCashFiles = Awaited<ReturnType<typeof prepareCashFiles>>;
type FileWriter = { set: (ref: DocumentReference, data: DocumentData) => unknown };

export function writeCashFiles(writer: FileWriter, cash: DocumentReference, files: PreparedCashFiles, by: string, at: string) {
  return files.map(({ file, bytes, sha256 }) => {
    const ref = doc(db, 'files', file.id);
    const chunks = Math.ceil(bytes.length / chunkSize);
    writer.set(ref, { name: file.name, type: file.type, size: file.size, chunks, parent: cash.path,
      scopeType: 'cash', scopeId: cash.id, by, at, sha256 });
    for (let i = 0; i < chunks; i++) {
      writer.set(doc(ref, 'chunks', String(i)), { i,
        data: Bytes.fromUint8Array(bytes.subarray(i * chunkSize, (i + 1) * chunkSize)) });
    }
    return file;
  });
}

export function cashFileList(value: unknown): CashAttachment[] {
  return Array.isArray(value) ? value.filter((file): file is CashAttachment =>
    file && typeof file.id === 'string' && /^[^/]+$/.test(file.id) && typeof file.name === 'string'
    && typeof file.type === 'string' && Number.isInteger(file.size) && file.size >= 0 && file.size <= maxSize) : [];
}

export async function readCashFile(cashId: string, fileId: string) {
  const cashRef = doc(db, 'cash', cashId);
  const fileRef = doc(db, 'files', fileId);
  const [cash, snapshot] = await Promise.all([getDocFromServer(cashRef), getDocFromServer(fileRef)]);
  const file = cashFileList(cash.data()?.files).find(item => item.id === fileId);
  const meta = snapshot.data();
  if (!file || !meta || meta.parent !== cashRef.path || (meta.scopeType ?? 'cash') !== 'cash'
      || (meta.scopeId ?? cashId) !== cashId || meta.size !== file.size
      || meta.chunks !== Math.max(1, Math.ceil(file.size / chunkSize))) {
    throw new Error('Chứng từ không còn thuộc hồ sơ này hoặc dữ liệu tệp không hợp lệ.');
  }
  const chunks = await getDocsFromServer(collection(fileRef, 'chunks'));
  const bytes = new Uint8Array(file.size);
  if (chunks.size !== meta.chunks) throw new Error('Chứng từ chưa đủ dữ liệu.');
  for (let i = 0; i < meta.chunks; i++) {
    const chunk = chunks.docs.find(entry => entry.id === String(i))?.data();
    const offset = i * chunkSize;
    if (!chunk || chunk.i !== i || !(chunk.data instanceof Bytes)) throw new Error('Chứng từ chưa đủ dữ liệu.');
    const part = chunk.data.toUint8Array();
    if (part.length !== Math.min(chunkSize, file.size - offset)) throw new Error('Chứng từ có dữ liệu không hợp lệ.');
    bytes.set(part, offset);
  }
  if (meta.sha256 && meta.sha256 !== bytesToHex(sha256(bytes))) throw new Error('Không xác minh được nội dung chứng từ.');
  const type = typeof meta.type === 'string' && mimePattern.test(meta.type) ? meta.type : binary;
  const pdf = type === 'application/pdf' && [37, 80, 68, 70, 45].every((byte, index) => bytes[index] === byte);
  const image = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(type);
  const safeName = file.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/^\.+$/, '_') || 'chung-tu';
  return { bytes, type, name: safeName, kind: pdf ? 'pdf' as const : image ? 'image' as const : 'file' as const };
}

export type OpenCashFile = Awaited<ReturnType<typeof readCashFile>>;
