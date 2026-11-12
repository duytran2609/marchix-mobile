import { useCallback, useState } from 'react';
import { Modal, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/Button';
import { useScreenStyles } from '../../theme/screenStyles';
import { useTheme } from '../../theme/theme';
import { CashPdf } from '../cash/CashPdf';
import { readRecordPdf } from './recordStore';

export type RecordPdfDocument = { bytes: Uint8Array; name: string };

export function RecordPdfPreview({ file, onClose }: { file: RecordPdfDocument; onClose: () => void }) {
  const styles = useScreenStyles();
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const fail = useCallback(() => setFailed(true), []);
  return <Modal visible animationType="slide" onRequestClose={onClose}>
    <SafeAreaView style={{ flex: 1, padding: 16, gap: 12, backgroundColor: colors.background }}>
      <Text accessibilityRole="header" style={styles.cardTitle} numberOfLines={2}>{file.name}</Text>
      {failed ? <Text accessibilityRole="alert" style={styles.error}>Không hiển thị được nội dung PDF.</Text>
        : <CashPdf {...file} onError={fail} />}
      <Button label="Đóng PDF" secondary onPress={onClose} />
    </SafeAreaView>
  </Modal>;
}

export function RecordPdfButton({ recordId, fileId, disabled }: { recordId: string; fileId: string; disabled?: boolean }) {
  const styles = useScreenStyles();
  const [preview, setPreview] = useState<RecordPdfDocument>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function open() {
    if (busy) return;
    setBusy(true);
    setError('');
    try { setPreview(await readRecordPdf(recordId, fileId)); }
    catch { setError('Không mở được PDF. Kiểm tra quyền truy cập, kết nối và thử lại.'); }
    finally { setBusy(false); }
  }
  return <>
    <Button label={busy ? 'Đang tải PDF…' : 'Xem PDF đã lưu'} secondary disabled={busy || disabled}
      onPress={() => void open()} />
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {preview && <RecordPdfPreview file={preview} onClose={() => setPreview(undefined)} />}
  </>;
}
