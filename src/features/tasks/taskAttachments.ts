import { getDocumentAsync } from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { isAvailableAsync, shareAsync } from 'expo-sharing';
import { Bytes } from 'firebase/firestore';
import { Platform } from 'react-native';
import { downloadTaskAttachment } from './tasks';
import type { AttachmentUpload, TaskAttachment } from './tasks';

const megabyte = 1024 * 1024;
const maxFileBytes = 5 * megabyte;
const maxCopiedBytes = 8 * megabyte;
const binaryType = 'application/octet-stream';
const mediaType = /^[\w.+-]+\/[\w.+-]+$/;

export type PickedAttachment = Pick<TaskAttachment, 'name' | 'type' | 'size'> & { read: () => Promise<string> };

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

export async function saveTaskAttachment(taskId: string, file: TaskAttachment) {
  const { data: { base64 } } = await downloadTaskAttachment({ taskId, fileId: file.id });
  const type = mediaType.test(file.type) ? file.type : binaryType;
  const safeName = file.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/^\.+$/, '_') || 'tep-dinh-kem';
  if (Platform.OS === 'web') {
    const bytes = Bytes.fromBase64String(base64).toUint8Array();
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = safeName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  if (Platform.OS === 'android') {
    const directory = await Directory.pickDirectoryAsync().catch((error: unknown) => {
      if (error instanceof Error && 'code' in error && error.code === 'ERR_PICKER_CANCELLED') return;
      throw error;
    });
    if (!directory) return;
    const saved = new Directory(directory.uri).createFile(safeName, type);
    try {
      await saved.write(base64, { encoding: 'base64' });
    } catch (error) {
      if (saved.exists) saved.delete();
      throw error;
    }
    return;
  }
  if (!await isAvailableAsync()) throw new Error('Thiết bị chưa hỗ trợ lưu tệp theo cách này.');
  const folder = new Directory(Paths.cache, 'task-attachments', file.id);
  folder.create({ intermediates: true, idempotent: true });
  const saved = new File(folder, safeName);
  saved.create({ overwrite: true });
  await saved.write(base64, { encoding: 'base64' });
  await shareAsync(saved.uri, { mimeType: type, dialogTitle: 'Lưu tệp đính kèm' });
}
