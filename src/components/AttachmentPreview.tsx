import { Bytes } from 'firebase/firestore';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Image, Modal, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useScreenStyles } from '../theme/screenStyles';
import { useTheme } from '../theme/theme';
import { attachmentMimeType, hasPdfHeader, saveAttachment } from '../utils/attachmentFile';
import type { AttachmentFile } from '../utils/attachmentFile';
import { AttachmentLabel } from './AttachmentLabel';
import { Button } from './Button';
import { PdfPreview } from './PdfPreview';

const imageTypes = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const textLimit = 64 * 1024;

export function AttachmentPreview({ file, onClose, embedded, downloadable = true }: {
  file: AttachmentFile; onClose: () => void; embedded?: boolean; downloadable?: boolean;
}) {
  const styles = useScreenStyles();
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const saveLock = useRef(false);
  const fail = useCallback(() => setFailed(true), []);
  const type = attachmentMimeType(file);
  const pdf = type === 'application/pdf' && hasPdfHeader(file.bytes);
  const imageUri = useMemo(() => imageTypes.has(type)
    ? `data:${type};base64,${Bytes.fromUint8Array(file.bytes).toBase64()}` : '', [file.bytes, type]);
  const plainText = useMemo(() => type.startsWith('text/') && typeof TextDecoder !== 'undefined'
    ? new TextDecoder().decode(file.bytes.subarray(0, textLimit)) : undefined, [file.bytes, type]);

  async function download() {
    if (saveLock.current) return;
    saveLock.current = true;
    setSaving(true);
    setError('');
    setSaved('');
    try {
      setSaved(await saveAttachment(file) ?? '');
    } catch {
      setError('Không tải xuống được tệp. Vui lòng thử lại.');
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  const close = () => { if (!saveLock.current) onClose(); };
  const content = (
    <SafeAreaView style={{ flex: 1, padding: 16, gap: 12, backgroundColor: colors.background }}>
      <AttachmentLabel file={file}>
        <Text accessibilityRole="header" style={styles.cardTitle} numberOfLines={2}>{file.name}</Text>
      </AttachmentLabel>
      {failed || (type === 'application/pdf' && !pdf)
        ? <Text accessibilityRole="alert" style={styles.error}>Không hiển thị được nội dung tệp.</Text>
        : pdf ? <PdfPreview bytes={file.bytes} name={file.name} onError={fail} />
          : imageUri ? <Image accessibilityLabel={file.name} source={{ uri: imageUri }} resizeMode="contain"
            onError={fail} style={{ flex: 1, width: '100%' }} />
            : plainText !== undefined ? <ScrollView><Text selectable style={styles.body}>{plainText}</Text>
              {file.bytes.length > textLimit && <Text style={styles.muted}>Đang hiển thị phần đầu của tệp.</Text>}
            </ScrollView>
              : <Text style={styles.muted}>{downloadable
                ? 'Tải tệp xuống để mở bằng ứng dụng phù hợp.'
                : 'Định dạng này cần ứng dụng phù hợp để mở.'}</Text>}
      {downloadable && Platform.OS === 'ios' && <Text style={styles.muted}>Chọn “Lưu vào Tệp” để lưu trên iPhone.</Text>}
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {!!saved && <Text accessibilityLiveRegion="polite" role="status" style={styles.body}>{saved}</Text>}
      <View style={styles.choices}>
        <Button label={pdf ? 'Đóng PDF' : 'Đóng xem trước'} secondary onPress={close} disabled={saving} />
        {downloadable && <Button label={saving ? 'Đang tải xuống…' : 'Tải xuống'} disabled={saving}
          onPress={() => void download()} />}
      </View>
    </SafeAreaView>
  );
  return embedded ? content : <Modal visible animationType="slide" onRequestClose={close}>{content}</Modal>;
}
