import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { TextInput } from '../../components/TextInput';
import { DiscussionAttachment } from '../../components/Discussion';
import { FilePickerButton } from '../../components/FilePickerButton';
import { useScreenStyles } from '../../theme/screenStyles';
import { cashFileLimit, cashFileList } from '../cash/cashAttachments';
import { attachmentMimeType, type AttachmentFile } from '../../utils/attachmentFile';
import { formatFileSize, pickTaskAttachments } from '../tasks/taskAttachments';
import type { PickedAttachment } from '../tasks/taskAttachments';
import type { TaskAttachment } from '../tasks/tasks';

export const choice = (value: string, label = value) => ({ value, label });
export const toggleChoice = (values: string[], id: string) => values.includes(id) ? values.filter(value => value !== id) : [...values, id];

export function CollaborationInput({ label, value, onChange, limit, multiline, disabled }: {
  label: string; value: string; onChange: (value: string) => void; limit: number; multiline?: boolean; disabled?: boolean;
}) {
  const styles = useScreenStyles();
  return <View style={{ gap: 4 }}>
    <Text style={styles.label}>{label}</Text>
    <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} editable={!disabled}
      maxLength={limit} multiline={multiline} style={[styles.input, multiline && styles.messageInput]} />
  </View>;
}

export const isCollaborationImage = (file: Pick<AttachmentFile, 'name' | 'type'>) => attachmentMimeType(file).startsWith('image/');

export function CollaborationFilePicker({ label, onSelect, disabled, onPicking, kind }: {
  label: string; onSelect: (files: PickedAttachment[]) => Promise<void>;
  disabled: boolean; onPicking: (picking: boolean) => void; kind: 'images' | 'files';
}) {
  const styles = useScreenStyles();
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  async function pick() {
    if (lock.current || disabled) return;
    lock.current = true;
    setPicking(true);
    onPicking(true);
    setError('');
    try {
      const selected = await pickTaskAttachments({ type: kind === 'images' ? 'image/*' : '*/*' });
      if (!selected.length) return;
      if (kind === 'images' && selected.some(file => !isCollaborationImage(file))) {
        setError('Chỉ chọn hình ảnh trong tab này.');
        return;
      }
      if (kind === 'files' && selected.some(isCollaborationImage)) {
        setError('Để đính kèm ảnh, hãy chuyển sang tab Hình ảnh.');
        return;
      }
      const problem = cashFileLimit(selected);
      if (problem) setError(problem);
      else await onSelect(selected);
    } catch {
      setError('Không chọn được tệp. Vui lòng thử lại.');
    } finally {
      lock.current = false;
      setPicking(false);
      onPicking(false);
    }
  }
  return <View style={styles.stack}>
    <FilePickerButton label={label} accessibilityLabel={label} picking={picking} disabled={disabled}
      pickingLabel={kind === 'images' ? 'Đang đính kèm ảnh…' : 'Đang đính kèm tệp…'}
      onPress={() => void pick()} hint="Tối đa 5 tệp, tổng 8 MB, mỗi tệp tối đa 5 MB." />
    <CollaborationFeedback error={error} />
  </View>;
}

export function CollaborationFiles({ files, open, renderAction }: {
  files: unknown; open: (file: TaskAttachment) => void; renderAction?: (file: TaskAttachment) => ReactNode;
}) {
  const list = cashFileList(files);
  if (!list.length) return null;
  return <View style={{ gap: 6 }}>
    {list.map(file => {
      const detail = formatFileSize(file.size);
      return <DiscussionAttachment key={file.id} file={file} detail={detail}
        openLabel={file.name + ' · ' + detail} onOpen={() => open(file)} action={renderAction?.(file)} />;
    })}
  </View>;
}

export function useCollaborationAction() {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  function clearFeedback() {
    setError('');
    setNotice('');
  }
  async function run(operation: () => Promise<string | void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    clearFeedback();
    try {
      setNotice(await operation() || '');
    } catch (cause) {
      const reason = cause as { code?: string; message?: string };
      setError(reason?.code === 'permission-denied' ? 'Quyền truy cập không đủ hoặc quyền nhóm vừa thay đổi.'
        : reason?.message || 'Không thực hiện được. Vui lòng thử lại.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return { busy, error, notice, run, clearFeedback };
}

export function CollaborationFeedback({ error, notice }: { error?: string; notice?: string }) {
  const styles = useScreenStyles();
  return <>
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {!!notice && <Text accessibilityLiveRegion="polite" style={styles.body}>{notice}</Text>}
  </>;
}
