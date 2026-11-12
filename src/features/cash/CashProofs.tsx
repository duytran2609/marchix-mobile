import { Directory, File, Paths } from 'expo-file-system';
import { isAvailableAsync, shareAsync } from 'expo-sharing';
import { Bytes } from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Modal, Platform, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/Button';
import { useScreenStyles } from '../../theme/screenStyles';
import { useTheme } from '../../theme/theme';
import { formatFileSize } from '../tasks/taskAttachments';
import { readCashFile, type CashAttachment, type OpenCashFile } from './cashAttachments';
import { CashPdf } from './CashPdf';

export async function saveAttachmentBytes(file: { bytes: Uint8Array; name: string; type: string }, dialogTitle = 'Lưu chứng từ') {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([new Uint8Array(file.bytes)], { type: 'application/octet-stream' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
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
    const saved = directory.createFile(file.name, file.type);
    try {
      await saved.write(file.bytes);
    } catch (error) {
      if (saved.exists) saved.delete();
      throw error;
    }
    return;
  }
  if (!await isAvailableAsync()) throw new Error('Thiết bị chưa hỗ trợ chia sẻ tệp.');
  const folder = new Directory(Paths.cache, `chung-tu-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  folder.create();
  try {
    const saved = folder.createFile(file.name, file.type);
    await saved.write(file.bytes);
    await shareAsync(saved.uri, { mimeType: file.type, dialogTitle });
  } finally {
    folder.delete();
  }
}

function Preview({ file, onClose }: { file: OpenCashFile; onClose: () => void }) {
  const styles = useScreenStyles();
  const { colors } = useTheme();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [previewError, setPreviewError] = useState(false);
  const failPreview = useCallback(() => setPreviewError(true), []);
  const [imageUri] = useState(() => file.kind === 'image'
    ? `data:${file.type};base64,${Bytes.fromUint8Array(file.bytes).toBase64()}` : '');

  async function save() {
    if (saving) return;
    setSaving(true);
    setSaveError('');
    try { await saveAttachmentBytes(file); }
    catch { setSaveError('Không lưu được chứng từ. Vui lòng thử lại.'); }
    finally { setSaving(false); }
  }

  return <Modal visible animationType="slide" onRequestClose={saving ? () => undefined : onClose}>
    <SafeAreaView style={{ flex: 1, padding: 16, gap: 12, backgroundColor: colors.background }}>
      <Text accessibilityRole="header" style={styles.cardTitle} numberOfLines={2}>{file.name}</Text>
      {previewError || file.kind === 'file'
        ? <Text style={styles.muted}>{previewError ? 'Không hiển thị được chứng từ.' : 'Định dạng này cần ứng dụng phù hợp để mở.'}</Text>
        : file.kind === 'image'
          ? <Image accessibilityLabel={file.name} source={{ uri: imageUri }} resizeMode="contain"
            onError={failPreview} style={{ flex: 1, width: '100%' }} />
          : <CashPdf bytes={file.bytes} name={file.name} onError={failPreview} />}
      {!!saveError && <Text accessibilityRole="alert" style={styles.error}>{saveError}</Text>}
      <View style={styles.choices}>
        <Button label="Đóng chứng từ" secondary onPress={onClose} disabled={saving} />
        <Button label={saving ? 'Đang lưu…' : 'Lưu chứng từ'} onPress={() => void save()} disabled={saving} />
      </View>
    </SafeAreaView>
  </Modal>;
}

export function CashProofs({ cashId, files }: { cashId: string; files: CashAttachment[] }) {
  const styles = useScreenStyles();
  const [opening, setOpening] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<OpenCashFile>();
  const active = useRef(true);
  const lock = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  async function open(file: CashAttachment) {
    if (lock.current) return;
    lock.current = true;
    setOpening(file.id);
    setError('');
    try {
      const result = await readCashFile(cashId, file.id);
      if (active.current) setPreview(result);
    } catch (cause) {
      if (active.current) setError(cause && typeof cause === 'object' && 'code' in cause
        ? cause.code === 'permission-denied' ? 'Bạn không còn quyền xem chứng từ này.' : 'Không tải được chứng từ. Vui lòng thử lại.'
        : cause instanceof Error ? cause.message : 'Không mở được chứng từ.');
    } finally {
      lock.current = false;
      if (active.current) setOpening('');
    }
  }

  return <View style={styles.stack}>
    <Text style={styles.label}>Chứng từ đính kèm</Text>
    {files.map(file => <View key={file.id} style={styles.detailRow}>
      <Text style={styles.body}>{file.name} · {formatFileSize(file.size)}</Text>
      <Button label={opening === file.id ? 'Đang mở…' : `Xem ${file.name}`}
        secondary onPress={() => void open(file)} disabled={!!opening} />
    </View>)}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {preview && <Preview file={preview} onClose={() => setPreview(undefined)} />}
  </View>;
}
