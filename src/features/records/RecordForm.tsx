import { useEffect, useRef, useState } from 'react';
import { Bytes } from 'firebase/firestore';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { TextInput } from '../../components/TextInput';
import { AttachmentLabel } from '../../components/AttachmentLabel';
import { PopupAction, PopupBody } from '../../components/PopupBody';
import { KeyboardSafeAreaView } from '../../components/KeyboardViewport';
import { Button } from '../../components/Button';
import { DeleteIconButton } from '../../components/DeleteIconButton';
import { FieldLabel } from '../../components/FieldLabel';
import { Dropdown } from '../../components/Dropdown';
import { PopupHeader } from '../../components/PopupHeader';
import { SearchableChoiceDropdown } from '../../components/SearchableChoiceList';
import { useScreenStyles } from '../../theme/screenStyles';
import { useTheme } from '../../theme/theme';
import { AttachmentPreview } from '../../components/AttachmentPreview';
import { hasPdfHeader } from '../../utils/attachmentFile';
import { DateCalendarField } from '../tasks/CalendarDialog';
import { formatFileSize, pickTaskAttachments } from '../tasks/taskAttachments';
import type { PickedAttachment } from '../tasks/taskAttachments';
import { todayInVietnam } from '../tasks/taskDates';
import { recordingSignature, saveRecord } from './recordStore';
import { RecordAttachmentButton } from './RecordAttachment';
import type { RecordAttachment } from './RecordAttachment';
import type { RecordDraft } from './recordStore';
import { recordKinds, recordNumber } from './records';
import type { Correspondence, RecordBook, RecordStatus } from './records';

export function RecordForm({ direction, existing, action, names, email, isAdmin, onCancel, onSaved, onPreview }: {
  direction: RecordBook;
  existing?: Correspondence;
  action?: { status: RecordStatus; label: string };
  names: Map<string, string>;
  email: string;
  isAdmin: boolean;
  onCancel: () => void;
  onSaved: (result: Awaited<ReturnType<typeof saveRecord>>) => void;
  onPreview?: (file: RecordAttachment, downloadable: boolean) => void;
}) {
  const styles = useScreenStyles();
  const { colors } = useTheme();
  const incoming = direction === 'in';
  const signing = recordingSignature(existing, action?.status);
  const issuing = action?.status === 'issued';
  const starting = existing?.status === 'assigned' && action?.status === 'processing';
  const showPdfFileRow = action?.status === 'review' || signing || issuing ||
    (existing?.status === 'signing' && action?.status === 'numbered');
  const voiding = action?.status === 'void';
  const flatForm = !existing || starting || showPdfFileRow || voiding ||
    action?.status === 'assigned' || action?.status === 'completed' || action?.status === 'archived';
  const lock = useRef(false);
  const mounted = useRef(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [signedByName, setSignedByName] = useState('');
  const [signedOn, setSignedOn] = useState(todayInVietnam);
  const [note, setNote] = useState('');
  const [watchers, setWatchers] = useState<string[]>([]);
  const [attachment, setAttachment] = useState<PickedAttachment>();
  const [preview, setPreview] = useState<RecordAttachment>();
  const [draft, setDraft] = useState<RecordDraft>({
    kind: 'letter', subject: '', partner: '', assigneeEmail: existing?.assigneeEmail ?? '',
    documentOn: '', externalNumber: '', dueOn: '', priority: 'normal',
  });
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const title = action?.label ?? (incoming ? 'Vào sổ và cấp số đến' : 'Lập bản nháp');
  const people = Array.from(names, ([id, name]) => ({ id, name }));
  const set = <Key extends keyof RecordDraft>(key: Key, value: RecordDraft[Key]) => {
    setDraft(current => ({ ...current, [key]: value }));
  };

  function field(label: string, value: string, change: (text: string) => void, maxLength: number,
    options: { placeholder?: string; multiline?: boolean; required?: boolean } = {}) {
    const { placeholder, multiline, required } = options;
    return <View style={{ gap: 5 }}>
      <FieldLabel style={styles.label} required={required}>{label}</FieldLabel>
      <TextInput accessibilityLabel={label} style={[styles.input, multiline && styles.messageInput]}
        editable={!busy} value={value} onChangeText={change} maxLength={maxLength}
        placeholder={placeholder} multiline={multiline} />
    </View>;
  }

  async function pick() {
    if (lock.current) return;
    lock.current = true;
    setBusy('Đang chọn tệp…');
    setError('');
    try {
      const [file] = await pickTaskAttachments({ multiple: false, type: existing ? 'application/pdf' : '*/*' });
      if (!file) return;
      if (file.size > 5 * 1024 * 1024 || file.size < 1) throw new Error('Chọn tệp hợp lệ, tối đa 5 MB.');
      setAttachment(file);
      setConfirmed(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không đọc được tệp.');
    } finally {
      lock.current = false;
      setBusy('');
    }
  }

  async function submit() {
    if (lock.current) return;
    lock.current = true;
    setBusy('Đang lưu…');
    setError('');
    try {
      const saved = await saveRecord({ email, isAdmin, direction, existing, target: action?.status,
        draft: existing ? undefined : draft, signedByName, signedOn, confirmed, note,
        assigneeEmail: draft.assigneeEmail, watchers, attachment });
      if (mounted.current) onSaved(saved);
    } catch (cause) {
      setError(cause && typeof cause === 'object' && 'code' in cause
        ? cause.code === 'permission-denied' ? 'Máy chủ từ chối thao tác. Kiểm tra quyền hoặc trạng thái hồ sơ.'
          : 'Chưa lưu được hồ sơ. Kiểm tra kết nối và thử lại.'
        : cause instanceof Error ? cause.message : 'Chưa lưu được hồ sơ.');
    } finally {
      lock.current = false;
      setBusy('');
    }
  }

  async function previewPicked() {
    if (!attachment || lock.current) return;
    lock.current = true;
    setBusy('Đang mở tệp…');
    setError('');
    try {
      const bytes = Bytes.fromBase64String(await attachment.read()).toUint8Array();
      const type = existing ? 'application/pdf' : attachment.type;
      if (bytes.length !== attachment.size || (type === 'application/pdf' && !hasPdfHeader(bytes))) {
        throw new Error('Chọn lại tệp hợp lệ.');
      }
      const file = { name: attachment.name, type, bytes };
      if (onPreview) onPreview(file, false);
      else setPreview(file);
    } catch { setError('Không mở được tệp vừa chọn. Vui lòng chọn lại.'); }
    finally { lock.current = false; setBusy(''); }
  }

  function removePicked() {
    setAttachment(undefined);
    setConfirmed(false);
  }

  const content = <View style={flatForm ? styles.stack : styles.panel}>
    {!existing && <>
      <Dropdown required label="Loại văn bản" value={draft.kind} onChange={value => set('kind', value)} disabled={!!busy} highlightSelection={false}
        choices={[{ value: 'letter', label: recordKinds.letter }, { value: 'decision', label: recordKinds.decision }]} />
      {field('Trích yếu', draft.subject, value => set('subject', value), 240, { required: true })}
      {field(incoming ? 'Nơi gửi' : 'Nơi nhận', draft.partner, value => set('partner', value), 160, { required: true })}
      {incoming && <>
        <View style={popup.field}>
          <Text style={styles.label}>Ngày vào sổ</Text>
          <Text style={styles.body}>{todayInVietnam().split('-').reverse().join('/')}</Text>
        </View>
        {field('Số bên gửi', draft.externalNumber, value => set('externalNumber', value), 100)}
        <DateCalendarField label="Ngày văn bản" value={draft.documentOn} clearLabel="Bỏ ngày"
          disabled={!!busy} onChange={day => set('documentOn', day)} />
        <Text style={styles.muted}>Mã hồ sơ và số đến được cấp tự động khi lưu.</Text>
      </>}
      <DateCalendarField label="Hạn xử lý" value={draft.dueOn} clearLabel="Bỏ ngày"
        disabled={!!busy} onChange={day => set('dueOn', day)} />
      <Dropdown required label="Mức độ" value={draft.priority} disabled={!!busy} highlightSelection={false} onChange={value => set('priority', value)}
        choices={[{ value: 'normal', label: 'Thường' }, { value: 'urgent', label: 'Khẩn' }]} />
    </>}
    {(!existing || existing.status === 'registered') && <View style={popup.field}>
      <FieldLabel style={styles.label} required={!!existing}>Người xử lý</FieldLabel>
      <SearchableChoiceDropdown title="Người xử lý" label="Tìm người xử lý" placeholder="Chưa giao"
        items={people}
        selected={draft.assigneeEmail ? [draft.assigneeEmail] : []}
        onToggle={value => set('assigneeEmail', value === draft.assigneeEmail ? '' : value)}
        disabled={!!busy} emptyMessage="Không có người xử lý phù hợp." />
    </View>}
    {!existing && <View style={styles.stack}>
      <Text style={styles.label}>Người theo dõi</Text>
      <Text style={styles.muted}>Chọn tối đa 5 người. Họ có thể xem hồ sơ và nhận thông báo cập nhật.</Text>
      <SearchableChoiceDropdown title="Người theo dõi" multiple items={people}
        selected={watchers} disabled={!!busy} label="Tìm người theo dõi" emptyMessage="Không tìm thấy thành viên."
        showAvatar={false} onToggle={id => {
          if (!watchers.includes(id) && watchers.length >= 5) {
            setError('Chọn tối đa 5 người theo dõi.');
            return;
          }
          setError('');
          setWatchers(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
        }} />
    </View>}
    {signing && <>
      {field('Họ tên người ký', signedByName, setSignedByName, 160, { required: true })}
      <DateCalendarField required label="Ngày ký" value={signedOn} max={todayInVietnam()} disabled={!!busy} onChange={setSignedOn} />
      <Text style={styles.muted}>Chọn bản PDF đã ký hoặc dùng bản đã lưu nếu đã kiểm tra chữ ký.</Text>
    </>}
    {issuing && <Text style={styles.body}>Số, ký hiệu {existing ? recordNumber(existing) : ''}. Kiểm tra bản phát hành trước khi xác nhận.</Text>}
    {voiding && <Text style={styles.body}>Số {existing ? recordNumber(existing) : ''} sẽ bị hủy và không được cấp lại.</Text>}
    {(!existing || signing || issuing || (isAdmin && existing.status === 'draft' && !existing.fileId)) && <>
      {!existing ? <View style={popup.field}>
        <Text style={styles.label}>Tài liệu đính kèm</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={attachment ? 'Chọn tệp khác' : 'Chọn tệp'}
          disabled={!!busy} onPress={() => void pick()}
          style={({ pressed }) => [popup.filePicker, { borderColor: colors.accent, backgroundColor: colors.accentSoft },
            (pressed || !!busy) && styles.dimmed]}>
          <Text style={[popup.fileAction, { color: colors.accent }]}>
            {busy === 'Đang chọn tệp…' ? busy : attachment ? '+ Chọn tệp khác' : '+ Chọn tệp'}
          </Text>
          <Text style={[popup.fileHint, { color: colors.muted }]}>1 tệp, tối đa 5 MB.</Text>
        </Pressable>
      </View> : <>
        <FieldLabel style={styles.label} required={(signing || issuing) && !existing.fileId}>Bản PDF (tối đa 5 MB)</FieldLabel>
        <Button label={attachment ? 'Chọn PDF khác' : 'Chọn PDF'} secondary disabled={!!busy} onPress={() => void pick()} />
      </>}
      {attachment && (showPdfFileRow ? <View style={[popup.fileCard, popup.fileRow, { borderColor: colors.line }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={attachment.name} disabled={!!busy}
          onPress={() => void previewPicked()}
          style={({ pressed }) => [popup.fileOpen, (pressed || !!busy) && styles.dimmed]}>
          <AttachmentLabel file={attachment}>
            <Text style={[styles.body, styles.metadataValue]}>{attachment.name}</Text>
            <Text style={styles.muted}>{formatFileSize(attachment.size)}</Text>
          </AttachmentLabel>
        </Pressable>
        <DeleteIconButton label={`Bỏ tệp ${attachment.name}`} disabled={!!busy} onPress={removePicked} />
      </View> : <>
        <View style={existing ? undefined : [popup.fileCard, { borderColor: colors.line }]}>
          <AttachmentLabel file={attachment}>
            <Text style={[styles.body, styles.metadataValue]}>{attachment.name}</Text>
            {!existing && <Text style={[styles.muted, styles.metadataValue]}>{formatFileSize(attachment.size)}</Text>}
          </AttachmentLabel>
        </View>
        <View style={[styles.choices, !existing && popup.rightActions]}>
          <Button label={existing ? 'Xem PDF vừa chọn' : 'Xem trước'} secondary disabled={!!busy}
            onPress={() => void previewPicked()} />
          <Button label={existing ? 'Bỏ tệp vừa chọn' : 'Bỏ tệp'} secondary={!!existing} danger={!existing} disabled={!!busy}
            onPress={removePicked} />
        </View>
      </>)}
    </>}
    {existing?.fileId && !starting && !(showPdfFileRow && attachment) && <RecordAttachmentButton key={existing.fileId} recordId={existing.id} fileId={existing.fileId}
      fileName={existing.fileName} disabled={!!busy} onPreview={onPreview && (file => onPreview(file, true))} />}
    {(signing || issuing) && <Button required secondary selected={confirmed} disabled={!!busy}
      label={signing ? 'Tôi đã kiểm tra chữ ký trên PDF' : 'Tôi đã kiểm tra chữ ký, số và ngày trên PDF'}
      onPress={() => setConfirmed(value => !value)} />}
    {field(starting ? 'Ghi chú xử lý' : issuing ? 'Bằng chứng phát hành' : voiding ? 'Lý do hủy số' : 'Ghi chú nhật ký', note, setNote, 500,
      { placeholder: issuing ? 'Nơi nhận, thời điểm, kênh gửi và tham chiếu' : undefined,
        multiline: true, required: issuing || voiding })}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
  </View>;
  const footer = <View style={[styles.choices, flatForm && popup.rightActions]}>
    <PopupAction label={busy || (existing ? 'Xác nhận' : title)} disabled={!!busy} onPress={() => void submit()} />
  </View>;
  if (existing) return <>
    <View style={popup.editHeader}>
      <PopupHeader title={title} closeLabel="Đóng biểu mẫu Văn thư" onClose={onCancel} disabled={!!busy} inset={false} />
    </View>
    <PopupBody contentContainerStyle={popup.editBody} footer={footer}>{content}</PopupBody>
    {preview && <AttachmentPreview downloadable={false} file={preview} onClose={() => setPreview(undefined)} />}
  </>;
  const close = () => {
    if (preview) setPreview(undefined);
    else if (!lock.current) onCancel();
  };
  return <Modal visible transparent animationType="fade" onRequestClose={close}>
    <KeyboardSafeAreaView style={popup.backdrop}>
      <View role="dialog" accessibilityViewIsModal accessibilityLabel={incoming ? 'Vào sổ · Văn bản đến' : 'Lập bản nháp · Văn bản đi'}
        style={[popup.card, { backgroundColor: colors.paper }]}>
        {preview ? <AttachmentPreview embedded downloadable={false} file={preview} onClose={() => setPreview(undefined)} /> : <>
          <PopupHeader title={incoming ? 'Vào sổ · Văn bản đến' : 'Lập bản nháp · Văn bản đi'}
            closeLabel="Đóng biểu mẫu Văn thư" disabled={!!busy} onClose={close} />
          <PopupBody contentContainerStyle={popup.body} footer={footer}>{content}</PopupBody>
        </>}
      </View>
    </KeyboardSafeAreaView>
  </Modal>;
}

const popup = StyleSheet.create({
  backdrop: { flex: 1, padding: 16, justifyContent: 'center', alignItems: 'center', backgroundColor: '#17102588' },
  card: { width: '100%', maxWidth: 560, height: '92%', borderRadius: 18, overflow: 'hidden' },
  body: { paddingHorizontal: 16, paddingBottom: 20, paddingTop: 8 },
  editBody: { padding: 12 },
  editHeader: { paddingHorizontal: 12, paddingTop: 8, flexShrink: 0 },
  field: { gap: 6 },
  filePicker: { padding: 16, alignItems: 'center', gap: 6, borderRadius: 9, borderWidth: 1, borderStyle: 'dashed' },
  fileAction: { fontSize: 14, fontWeight: '700' },
  fileHint: { fontSize: 12, textAlign: 'center' },
  fileCard: { padding: 12, gap: 4, borderWidth: 1, borderRadius: 9 },
  fileRow: { flexDirection: 'row', alignItems: 'center', paddingRight: 4 },
  fileOpen: { flex: 1, minWidth: 0 },
  rightActions: { justifyContent: 'flex-end' },
});
