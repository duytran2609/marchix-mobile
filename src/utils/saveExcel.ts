import { Directory, File, Paths } from 'expo-file-system';
import { isAvailableAsync, shareAsync } from 'expo-sharing';
import { Platform } from 'react-native';

const excelType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function saveExcel(bytes: ArrayBuffer, filename: string, dialogTitle: string) {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([bytes], { type: excelType }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }
  if (Platform.OS === 'android') {
    const directory = await Directory.pickDirectoryAsync().catch((error: unknown) => {
      if (error instanceof Error && 'code' in error && error.code === 'ERR_PICKER_CANCELLED') return;
      throw error;
    });
    if (!directory) return false;
    const saved = directory.createFile(filename, excelType);
    try {
      await saved.write(bytes);
    } catch (error) {
      if (saved.exists) saved.delete();
      throw error;
    }
    return true;
  }
  if (!await isAvailableAsync()) throw new Error('Thiết bị chưa hỗ trợ chia sẻ tệp.');
  const saved = new File(Paths.cache, filename);
  saved.create({ overwrite: true });
  try {
    await saved.write(bytes);
    await shareAsync(saved.uri, { mimeType: excelType, UTI: 'org.openxmlformats-officedocument.spreadsheetml.sheet', dialogTitle });
  } finally {
    if (saved.exists) saved.delete();
  }
  return true;
}
