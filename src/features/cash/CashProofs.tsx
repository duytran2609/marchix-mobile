import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { AttachmentLabel } from '../../components/AttachmentLabel';
import { AttachmentPreview } from '../../components/AttachmentPreview';
import { useScreenStyles } from '../../theme/screenStyles';
import { formatFileSize } from '../tasks/taskAttachments';
import { readCashFile, type CashAttachment, type OpenCashFile } from './cashAttachments';

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
    {files.map(file => <Pressable key={file.id} style={styles.detailRow} accessibilityRole="button"
      accessibilityLabel={`Xem ${file.name}`} disabled={!!opening} onPress={() => void open(file)}>
      <AttachmentLabel file={file}>
        <Text style={styles.body}>{file.name}</Text>
        <Text style={styles.muted}>{opening === file.id ? 'Đang mở…' : formatFileSize(file.size)}</Text>
      </AttachmentLabel>
    </Pressable>)}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {preview && <AttachmentPreview file={preview} onClose={() => setPreview(undefined)} />}
  </View>;
}
