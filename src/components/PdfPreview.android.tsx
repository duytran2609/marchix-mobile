import { File, Paths } from 'expo-file-system';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useScreenStyles } from '../theme/screenStyles';
import { Button } from './Button';
import type { PdfPreviewProps } from './PdfPreview';

export function PdfPreview({ bytes }: PdfPreviewProps) {
  const styles = useScreenStyles();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');
  const session = useRef<{ active: boolean; opening: boolean; file?: File }>({ active: false, opening: false });

  useEffect(() => {
    const current = { active: true, opening: false, file: undefined as File | undefined };
    session.current = current;
    setOpening(false);
    setError('');
    return () => {
      current.active = false;
      if (!current.opening) deleteTemporaryFile(current.file);
    };
  }, [bytes]);

  async function open() {
    const current = session.current;
    if (!current.active || current.opening) return;
    current.opening = true;
    setOpening(true);
    setError('');
    try {
      if (!current.file?.exists) {
        current.file = new File(Paths.cache, `preview-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
        await current.file.write(bytes);
      }
      if (current.active) await current.file.preview({ mimeType: 'application/pdf' });
    } catch (cause) {
      deleteTemporaryFile(current.file);
      current.file = undefined;
      if (current.active) setError(cause instanceof Error && 'code' in cause && cause.code === 'ERR_FILE_PREVIEW_UNSUPPORTED'
        ? 'Điện thoại chưa có ứng dụng đọc PDF. Hãy cài một ứng dụng đọc PDF rồi thử lại.'
        : 'Không mở được PDF. Vui lòng thử lại.');
    } finally {
      current.opening = false;
      if (current.active) setOpening(false);
      else deleteTemporaryFile(current.file);
    }
  }

  return <View style={styles.stack}>
    <Button label={opening ? 'Đang mở PDF…' : 'Mở PDF'} secondary disabled={opening} onPress={() => void open()} />
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
  </View>;
}

function deleteTemporaryFile(file?: File) {
  try {
    if (file?.exists) file.delete();
  } catch {
    // Android can reclaim a temporary cache file if deletion fails.
  }
}
