import { Directory, File, Paths } from 'expo-file-system';
import { isAvailableAsync, shareAsync } from 'expo-sharing';
import { Platform } from 'react-native';

export type AttachmentFile = { bytes: Uint8Array; name: string; type: string };

const binaryType = 'application/octet-stream';
const mimePattern = /^[\w.+-]+\/[\w.+-]+$/;
const typesByExtension = new Map([
  ['pdf', 'application/pdf'], ['jpg', 'image/jpeg'], ['jpeg', 'image/jpeg'],
  ['png', 'image/png'], ['gif', 'image/gif'], ['webp', 'image/webp'],
  ['txt', 'text/plain'], ['csv', 'text/csv'],
  ['doc', 'application/msword'],
  ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['xls', 'application/vnd.ms-excel'],
  ['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ['ppt', 'application/vnd.ms-powerpoint'],
  ['pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
]);

export function attachmentMimeType(file: Pick<AttachmentFile, 'name' | 'type'>) {
  const type = file.type?.split(';')[0].trim().toLowerCase();
  if (type && type !== binaryType && mimePattern.test(type)) return type;
  const extension = /\.([a-z0-9]+)$/i.exec(file.name.trim())?.[1].toLowerCase();
  return typesByExtension.get(extension ?? '') ?? binaryType;
}

export function hasPdfHeader(bytes: Uint8Array) {
  return [37, 80, 68, 70, 45].every((byte, index) => bytes[index] === byte);
}

async function saveToAndroidDownloads(name: string, type: string, bytes: Uint8Array) {
  const { fs, media } = await import('react-native-blob-util');
  const source = new File(Paths.cache, `attachment-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  let uri: string | undefined;
  try {
    await source.write(bytes);
    uri = await media.createFile({ name, mimeType: type }, 'Download');
    await fs.cp(source.uri, uri);
    if ((await fs.stat(uri)).size !== bytes.length) throw new Error('Tệp đã lưu không đủ dữ liệu.');
  } catch (error) {
    if (uri) await fs.unlink(uri).catch(() => undefined);
    throw error;
  } finally {
    await fs.unlink(source.uri).catch(() => undefined);
  }
}

export async function saveAttachment(file: AttachmentFile) {
  const name = file.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim().replace(/^\.+$/, '_') || 'tep-dinh-kem';
  const type = attachmentMimeType(file);

  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([new Uint8Array(file.bytes)], { type: binaryType }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }

  if (Platform.OS === 'android' && Platform.Version >= 29) {
    try {
      await saveToAndroidDownloads(name, type, file.bytes);
      return 'Đã lưu tệp vào thư mục Tải xuống.';
    } catch {
      // A user-selected folder remains available if Android rejects the shared download.
    }
  }

  if (Platform.OS === 'android') {
    const directory = await Directory.pickDirectoryAsync().catch((error: unknown) => {
      if (error instanceof Error && 'code' in error && error.code === 'ERR_PICKER_CANCELLED') return;
      throw error;
    });
    if (!directory) return;
    const destination = directory.createFile(name, type);
    try {
      await destination.write(file.bytes);
    } catch (error) {
      if (destination.exists) destination.delete();
      throw error;
    }
    return 'Đã lưu tệp vào thư mục đã chọn.';
  }

  if (!await isAvailableAsync()) throw new Error('Thiết bị chưa hỗ trợ lưu tệp.');
  const folder = new Directory(Paths.cache, `attachment-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  folder.create();
  try {
    const destination = new File(folder, name);
    destination.create();
    await destination.write(file.bytes);
    await shareAsync(destination.uri, { dialogTitle: 'Lưu tệp đính kèm' });
  } finally {
    folder.delete();
  }
}
