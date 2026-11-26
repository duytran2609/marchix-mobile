import { getDocumentAsync } from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Bytes } from 'firebase/firestore';
import { Platform } from 'react-native';
import type { AttachmentFile } from '../../utils/attachmentFile';
import { downloadTaskAttachment } from './tasks';
import type { AttachmentUpload, TaskAttachment } from './tasks';

const megabyte = 1024 * 1024;
const maxFileBytes = 5 * megabyte;
const maxCopiedBytes = 8 * megabyte;
const binaryType = 'application/octet-stream';
const mediaType = /^[\w.+-]+\/[\w.+-]+$/;

export type PickedAttachment = Pick<TaskAttachment, 'name' | 'type' | 'size'> & { read: () => Promise<string> };

export async function readPickedAttachment({ name, type, size, read }: PickedAttachment): Promise<AttachmentFile> {
  const bytes = Bytes.fromBase64String(await read()).toUint8Array();
  if (bytes.length !== size) throw new Error('Kích thước tệp đã thay đổi.');
  return { name, type, bytes };
}

export async function pickTaskAttachments(options: { multiple?: boolean; type?: string | string[] } = {}): Promise<PickedAttachment[]> {
  const result = await getDocumentAsync({ multiple: true, copyToCacheDirectory: true, base64: false, ...options });
  if (result.canceled) return [];
  if (Platform.OS === 'web') result.assets.forEach(asset => URL.revokeObjectURL(asset.uri));
  return result.assets.map(asset => {
    const file = asset.file;
    const type = asset.mimeType && mediaType.test(asset.mimeType) ? asset.mimeType : binaryType;
    if (file) {
      return {
        name: asset.name, type, size: file.size,
        read: async () => Bytes.fromUint8Array(new Uint8Array(await file.arrayBuffer())).toBase64(),
      };
    }
    const local = new File(asset.uri);
    if (!local.exists) throw new Error(`Không đọc được tệp “${asset.name}”.`);
    return { name: asset.name, type, size: local.size, read: () => local.base64() };
  });
}

export function attachmentLimit(files: Pick<TaskAttachment, 'name' | 'size'>[], copies = 1) {
  if (files.length > 5) return 'Chọn tối đa 5 tệp đính kèm.';
  const tooLarge = files.find(file => file.size > maxFileBytes);
  if (tooLarge) return `Tệp “${tooLarge.name}” lớn hơn 5 MB.`;
  const total = files.reduce((sum, file) => sum + file.size, 0) * Math.max(1, copies);
  if (total > maxCopiedBytes) return 'Tổng dung lượng tệp vượt quá 8 MB sau khi tính số người thực hiện.';
  return '';
}

export function formatFileSize(size: number) {
  if (size >= megabyte) return `${(size / megabyte).toFixed(1)} MB`;
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${size} B`;
}

export async function readTaskAttachments(files: PickedAttachment[]): Promise<AttachmentUpload[]> {
  return Promise.all(files.map(async ({ name, type, read }) => ({ name, type, base64: await read() })));
}

export async function readTaskAttachment(taskId: string, file: TaskAttachment) {
  const { data: { base64 } } = await downloadTaskAttachment({ taskId, fileId: file.id });
  return { bytes: Bytes.fromBase64String(base64).toUint8Array(), name: file.name, type: file.type };
}
