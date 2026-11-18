import { useCallback, useEffect, useRef, useState } from 'react';
import { Bytes } from 'firebase/firestore';
import { Image, Modal, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AttachmentLabel, FileTypeIcon } from '../../components/AttachmentLabel';
import { Button } from '../../components/Button';
import { useScreenStyles } from '../../theme/screenStyles';
import { useTheme } from '../../theme/theme';
import { CashPdf } from '../cash/CashPdf';
import { saveAttachmentBytes } from '../cash/CashProofs';
import { readRecordAttachment } from './recordStore';

export type RecordAttachment = { bytes: Uint8Array; name: string; type: string };

export function RecordAttachmentPreview({ file, onClose, embedded, downloadable }: {
  file: RecordAttachment; onClose: () => void; embedded?: boolean; downloadable?: boolean;
}) {
  const styles = useScreenStyles();
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const saveLock = useRef(false);
  const pdf = file.type === 'application/pdf';
  const [imageUri] = useState(() => ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)
    ? `data:${file.type};base64,${Bytes.fromUint8Array(file.bytes).toBase64()}` : '');
  const [plainText] = useState(() => ['text/plain', 'text/csv'].includes(file.type) && typeof TextDecoder !== 'undefined'
    ? new TextDecoder().decode(file.bytes.subarray(0, 64 * 1024)) : undefined);
  const fail = useCallback(() => setFailed(true), []);
  async function download() {
    if (saveLock.current) return;
    saveLock.current = true;
    setSaving(true);
    setError('');
    try {
      const name = file.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/^\.+$/, '_') || 'tep-dinh-kem';
      await saveAttachmentBytes({ ...file, name }, 'Lưu tệp');
    } catch { setError('Không tải xuống được tệp. Vui lòng thử lại.'); }
    finally { saveLock.current = false; setSaving(false); }
  }
  const content = (
    <SafeAreaView style={{ flex: 1, padding: 16, gap: 12, backgroundColor: colors.background }}>
      <AttachmentLabel file={file}>
        <Text accessibilityRole="header" style={styles.cardTitle} numberOfLines={2}>{file.name}</Text>
      </AttachmentLabel>
      {failed ? <Text accessibilityRole="alert" style={styles.error}>Không hiển thị được nội dung tệp.</Text>
        : pdf ? <CashPdf {...file} onError={fail} />
          : imageUri ? <Image accessibilityLabel={file.name} source={{ uri: imageUri }} resizeMode="contain"
            onError={fail} style={{ flex: 1, width: '100%' }} />
            : plainText !== undefined ? <ScrollView><Text selectable style={styles.body}>{plainText}</Text>
              {file.bytes.length > 64 * 1024 && <Text style={styles.muted}>Đang hiển thị phần đầu của tệp.</Text>}
            </ScrollView>
              : <Text style={styles.muted}>Định dạng này cần ứng dụng phù hợp để mở.</Text>}
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <View style={styles.choices}>
        <Button label={pdf ? 'Đóng PDF' : 'Đóng xem trước'} secondary onPress={onClose} disabled={saving} />
        {downloadable && <Button label={saving ? 'Đang tải xuống…' : 'Tải xuống'} disabled={saving}
          onPress={() => void download()} />}
      </View>
    </SafeAreaView>
  );
  return embedded ? content : <Modal visible animationType="slide" onRequestClose={() => {
    if (!saveLock.current) onClose();
  }}>{content}</Modal>;
}

export function RecordAttachmentButton({ recordId, fileId, fileName, disabled, onPreview }: {
  recordId: string; fileId: string; fileName?: string; disabled?: boolean;
  onPreview?: (file: RecordAttachment) => void;
}) {
  const styles = useScreenStyles();
  const [preview, setPreview] = useState<RecordAttachment>();
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
      const file = await readRecordAttachment(recordId, fileId);
      if (!mounted.current) return;
      if (onPreview) onPreview(file);
      else setPreview(file);
    }
    catch { if (mounted.current) setError('Không mở được tệp. Kiểm tra quyền truy cập, kết nối và thử lại.'); }
    finally { if (mounted.current) setBusy(false); }
  }
  return <>
    <Button label={busy ? 'Đang tải tệp…' : fileName || 'Xem tệp đã lưu'} secondary disabled={busy || disabled}
      leading={<FileTypeIcon name={fileName ?? ''} />}
      onPress={() => void open()} />
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {preview && <RecordAttachmentPreview downloadable file={preview} onClose={() => setPreview(undefined)} />}
  </>;
}
