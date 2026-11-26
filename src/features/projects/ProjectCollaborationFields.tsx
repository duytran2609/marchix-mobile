import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { TextInput } from '../../components/TextInput';
import { AttachmentPreview } from '../../components/AttachmentPreview';
import { DeleteIconButton } from '../../components/DeleteIconButton';
import { DiscussionAttachment } from '../../components/Discussion';
import { FilePickerButton } from '../../components/FilePickerButton';
import { useScreenStyles } from '../../theme/screenStyles';
import { cashFileLimit, cashFileList } from '../cash/cashAttachments';
import type { AttachmentFile } from '../../utils/attachmentFile';
import { formatFileSize, pickTaskAttachments, readPickedAttachment } from '../tasks/taskAttachments';
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

export function useCollaborationFilePicker({ files, onChange, disabled, onPicking }: {
  files: PickedAttachment[]; onChange: (files: PickedAttachment[]) => void;
  disabled: boolean; onPicking?: (picking: boolean) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  async function pick() {
    if (lock.current || disabled) return;
    lock.current = true;
    setPicking(true);
    onPicking?.(true);
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
      onPicking?.(false);
    }
  }
  return { picking, error, pick };
}

export function CollaborationFilePicker({ label, files, onChange, disabled, onPicking, onPreview }: {
  label: string; files: PickedAttachment[]; onChange: (files: PickedAttachment[]) => void;
  disabled: boolean; onPicking: (picking: boolean) => void; onPreview?: (file: AttachmentFile) => void;
}) {
  const styles = useScreenStyles();
  const [opening, setOpening] = useState(false);
  const { picking, error, pick } = useCollaborationFilePicker({ files, onChange, disabled: disabled || opening, onPicking });
  return <View style={styles.stack}>
    <FilePickerButton label={label} accessibilityLabel={label} picking={picking} disabled={disabled || opening}
      onPress={() => void pick()} hint="Tối đa 5 tệp, tổng 8 MB, mỗi tệp tối đa 5 MB." />
    <PickedCollaborationFiles files={files} onChange={onChange} disabled={disabled || picking} error={error}
      onPreview={onPreview} onOpening={value => { setOpening(value); onPicking(value); }} />
  </View>;
}

export function PickedCollaborationFiles({ files, onChange, disabled, error, onOpening, onPreview }: {
  files: PickedAttachment[]; onChange: (files: PickedAttachment[]) => void; disabled: boolean; error: string;
  onOpening: (opening: boolean) => void; onPreview?: (file: AttachmentFile) => void;
}) {
  const styles = useScreenStyles();
  const lock = useRef(false);
  const [opening, setOpening] = useState<PickedAttachment>();
  const [preview, setPreview] = useState<AttachmentFile>();
  const [previewError, setPreviewError] = useState('');

  async function open(file: PickedAttachment) {
    if (lock.current || disabled) return;
    lock.current = true;
    setOpening(file);
    onOpening(true);
    setPreviewError('');
    try {
      const loaded = await readPickedAttachment(file);
      if (onPreview) onPreview(loaded);
      else setPreview(loaded);
    } catch {
      setPreviewError('Không mở được tệp vừa chọn. Vui lòng chọn lại.');
    } finally {
      lock.current = false;
      setOpening(undefined);
      onOpening(false);
    }
  }

  if (!files.length && !error) return null;
  const busy = disabled || !!opening;
  return <View style={styles.stack}>
    {files.map((file, index) => <DiscussionAttachment key={index} file={file} openLabel={file.name}
      detail={opening === file ? 'Đang mở…' : formatFileSize(file.size)} disabled={busy} onOpen={() => void open(file)}
      action={<DeleteIconButton label={`Bỏ tệp ${file.name}`} disabled={busy} onPress={() => {
        setPreviewError('');
        onChange(files.filter(candidate => candidate !== file));
      }} />}
    />)}
    {!!(error || previewError) && <Text accessibilityRole="alert" style={styles.error}>{error || previewError}</Text>}
    {preview && <AttachmentPreview downloadable={false} file={preview} onClose={() => setPreview(undefined)} />}
  </View>;
}

export function CollaborationFiles({ files, open }: { files: unknown; open: (file: TaskAttachment) => void }) {
  const list = cashFileList(files);
  if (!list.length) return null;
  return <View style={{ gap: 6 }}>
    {list.map(file => {
      const detail = formatFileSize(file.size);
      return <DiscussionAttachment key={file.id} file={file} detail={detail}
        openLabel={file.name + ' · ' + detail} onOpen={() => open(file)} />;
    })}
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
