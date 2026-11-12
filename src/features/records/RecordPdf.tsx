import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/Button';
import { useScreenStyles } from '../../theme/screenStyles';
import { useTheme } from '../../theme/theme';
import { CashPdf } from '../cash/CashPdf';
import { saveAttachmentBytes } from '../cash/CashProofs';
import { readRecordPdf } from './recordStore';

export type RecordPdfDocument = { bytes: Uint8Array; name: string };

export function RecordPdfPreview({ file, onClose, embedded, downloadable }: {
  file: RecordPdfDocument; onClose: () => void; embedded?: boolean; downloadable?: boolean;
}) {
  const styles = useScreenStyles();
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const saveLock = useRef(false);
  const fail = useCallback(() => setFailed(true), []);
  async function download() {
    if (saveLock.current) return;
    saveLock.current = true;
    setSaving(true);
    setError('');
    try {
      const name = file.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/^\.+$/, '_') || 'van-ban.pdf';
      await saveAttachmentBytes({ ...file, name, type: 'application/pdf' }, 'Lưu PDF');
    } catch { setError('Không tải xuống được PDF. Vui lòng thử lại.'); }
    finally { saveLock.current = false; setSaving(false); }
  }
  const content = (
    <SafeAreaView style={{ flex: 1, padding: 16, gap: 12, backgroundColor: colors.background }}>
      <Text accessibilityRole="header" style={styles.cardTitle} numberOfLines={2}>{file.name}</Text>
      {failed ? <Text accessibilityRole="alert" style={styles.error}>Không hiển thị được nội dung PDF.</Text>
        : <CashPdf {...file} onError={fail} />}
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <View style={styles.choices}>
        <Button label="Đóng PDF" secondary onPress={onClose} disabled={saving} />
        {downloadable && <Button label={saving ? 'Đang tải xuống…' : 'Tải xuống'} disabled={saving}
          onPress={() => void download()} />}
      </View>
    </SafeAreaView>
  );
  return embedded ? content : <Modal visible animationType="slide" onRequestClose={() => {
    if (!saveLock.current) onClose();
  }}>{content}</Modal>;
}

export function RecordPdfButton({ recordId, fileId, fileName, disabled, onPreview }: {
  recordId: string; fileId: string; fileName?: string; disabled?: boolean;
  onPreview?: (file: RecordPdfDocument) => void;
}) {
  const styles = useScreenStyles();
  const [preview, setPreview] = useState<RecordPdfDocument>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  async function open() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const file = await readRecordPdf(recordId, fileId);
      if (!mounted.current) return;
      if (onPreview) onPreview(file);
      else setPreview(file);
    }
    catch { if (mounted.current) setError('Không mở được PDF. Kiểm tra quyền truy cập, kết nối và thử lại.'); }
    finally { if (mounted.current) setBusy(false); }
  }
  return <>
    <Button label={busy ? 'Đang tải PDF…' : fileName || 'Xem PDF đã lưu'} secondary disabled={busy || disabled}
      onPress={() => void open()} />
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {preview && <RecordPdfPreview downloadable file={preview} onClose={() => setPreview(undefined)} />}
  </>;
}
