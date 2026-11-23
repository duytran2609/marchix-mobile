import { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import { FileTypeIcon } from '../../components/AttachmentLabel';
import { AttachmentPreview } from '../../components/AttachmentPreview';
import { Button } from '../../components/Button';
import { useScreenStyles } from '../../theme/screenStyles';
import type { AttachmentFile } from '../../utils/attachmentFile';
import { readRecordAttachment } from './recordStore';

export type RecordAttachment = AttachmentFile;

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
    {preview && <AttachmentPreview file={preview} onClose={() => setPreview(undefined)} />}
  </>;
}
