import { Bytes } from 'firebase/firestore';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useScreenStyles } from '../theme/screenStyles';
import { createThemedStyles, useTheme } from '../theme/theme';
import { attachmentMimeType, hasPdfHeader, saveAttachment } from '../utils/attachmentFile';
import type { AttachmentFile } from '../utils/attachmentFile';
import { FileTypeIcon } from './AttachmentLabel';
import { PdfPreview } from './PdfPreview';
import { PopupHeader } from './PopupHeader';

const imageTypes = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const textLimit = 64 * 1024;

export function AttachmentPreview({ file, onClose, embedded, downloadable = true }: {
  file: AttachmentFile; onClose: () => void; embedded?: boolean; downloadable?: boolean;
}) {
  const styles = useScreenStyles();
  const headerStyles = useHeaderStyles();
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
      <PopupHeader title={file.name} closeLabel={pdf ? 'Đóng PDF' : 'Đóng xem trước'} onClose={close}
        disabled={saving} inset={false} titleLines={2} leading={<FileTypeIcon name={file.name} type={file.type} />}
        actions={downloadable && <Pressable accessibilityRole="button" accessibilityLabel="Tải xuống"
          accessibilityState={{ busy: saving, disabled: saving }} disabled={saving} onPress={() => void download()}
          style={({ pressed }) => [headerStyles.download, pressed && styles.dimmed]}>
          {saving ? <ActivityIndicator color={colors.accent} />
            : <View aria-hidden pointerEvents="none" style={headerStyles.downloadIcon}>
              <View style={headerStyles.arrowShaft} />
              <View style={headerStyles.arrowHead} />
              <View style={headerStyles.tray} />
            </View>}
        </Pressable>} />
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
    </SafeAreaView>
  );
  return embedded ? content : <Modal visible animationType="slide" onRequestClose={close}>{content}</Modal>;
}

const useHeaderStyles = createThemedStyles(colors => StyleSheet.create({
  download: { width: 44, height: 44, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  downloadIcon: { width: 22, height: 22, alignItems: 'center' },
  arrowShaft: { width: 2, height: 13, borderRadius: 1, backgroundColor: colors.accent },
  arrowHead: { position: 'absolute', top: 5, width: 8, height: 8, borderBottomWidth: 2, borderRightWidth: 2,
    borderColor: colors.accent, transform: [{ rotate: '45deg' }] },
  tray: { position: 'absolute', bottom: 0, width: 20, height: 7, borderWidth: 2, borderTopWidth: 0,
    borderBottomLeftRadius: 3, borderBottomRightRadius: 3, borderColor: colors.accent },
}));
