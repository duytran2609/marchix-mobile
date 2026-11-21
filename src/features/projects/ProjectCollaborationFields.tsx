import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { TextInput } from '../../components/TextInput';
import { AttachmentLabel, FileTypeIcon } from '../../components/AttachmentLabel';
import { Button } from '../../components/Button';
import { FilePickerButton } from '../../components/FilePickerButton';
import { useScreenStyles } from '../../theme/screenStyles';
import { cashFileLimit, cashFileList } from '../cash/cashAttachments';
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

export function CollaborationFilePicker({ label, files, onChange, disabled, onPicking }: {
  label: string; files: PickedAttachment[]; onChange: (files: PickedAttachment[]) => void;
  disabled: boolean; onPicking: (picking: boolean) => void;
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
      const next = [...files, ...await pickTaskAttachments()];
      const problem = cashFileLimit(next);
      if (problem) setError(problem);
      else onChange(next);
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
      onPress={() => void pick()} hint="Tối đa 5 tệp, tổng 8 MB, mỗi tệp tối đa 5 MB." />
    {files.map((file, index) => <View key={index} style={styles.detailRow}>
      <AttachmentLabel file={file}><Text style={[styles.muted, styles.metadataValue]}>{file.name} · {formatFileSize(file.size)}</Text></AttachmentLabel>
      <Button label={'Bỏ ' + file.name} secondary disabled={disabled || picking}
        onPress={() => onChange(files.filter((_, position) => position !== index))} />
    </View>)}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
  </View>;
}

export function CollaborationFiles({ files, open }: { files: unknown; open: (file: TaskAttachment) => void }) {
  const list = cashFileList(files);
  if (!list.length) return null;
  return <View style={{ gap: 6 }}>
    {list.map(file => <Button key={file.id} secondary label={file.name + ' · ' + formatFileSize(file.size)}
      leading={<FileTypeIcon name={file.name} type={file.type} />} onPress={() => open(file)} />)}
  </View>;
}

export function useCollaborationAction() {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function run(operation: () => Promise<string | void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
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
  return { busy, error, notice, run };
}

export function CollaborationFeedback({ error, notice }: { error?: string; notice?: string }) {
  const styles = useScreenStyles();
  return <>
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {!!notice && <Text accessibilityLiveRegion="polite" style={styles.body}>{notice}</Text>}
  </>;
}
