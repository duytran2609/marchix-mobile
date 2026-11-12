import { useEffect, useRef, useState } from 'react';
import { Bytes } from 'firebase/firestore';
import { Text, TextInput, View } from 'react-native';
import { Button } from '../../components/Button';
import { Dropdown } from '../../components/Dropdown';
import { useScreenStyles } from '../../theme/screenStyles';
import { useTheme } from '../../theme/theme';
import { hasPdfHeader } from '../cash/cashAttachments';
import { pickTaskAttachments } from '../tasks/taskAttachments';
import type { PickedAttachment } from '../tasks/taskAttachments';
import { todayInVietnam } from '../tasks/taskDates';
import { recordingSignature, saveRecord } from './recordStore';
import { RecordPdfButton, RecordPdfPreview } from './RecordPdf';
import type { RecordPdfDocument } from './RecordPdf';
import type { RecordDraft } from './recordStore';
import { recordKinds, recordNumber } from './records';
import type { Correspondence, RecordBook, RecordStatus } from './records';

export function RecordForm({ direction, existing, action, names, email, isAdmin, onCancel, onSaved }: {
  direction: RecordBook;
  existing?: Correspondence;
  action?: { status: RecordStatus; label: string };
  names: Map<string, string>;
  email: string;
  isAdmin: boolean;
  onCancel: () => void;
  onSaved: (result: Awaited<ReturnType<typeof saveRecord>>) => void;
}) {
  const styles = useScreenStyles();
  const { colors } = useTheme();
  const incoming = direction === 'in';
  const signing = recordingSignature(existing, action?.status);
  const issuing = action?.status === 'issued';
  const voiding = action?.status === 'void';
  const lock = useRef(false);
  const mounted = useRef(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [signedByName, setSignedByName] = useState('');
  const [signedOn, setSignedOn] = useState(todayInVietnam);
  const [note, setNote] = useState('');
  const [pdf, setPdf] = useState<PickedAttachment>();
  const [preview, setPreview] = useState<RecordPdfDocument>();
  const [draft, setDraft] = useState<RecordDraft>({
    kind: 'letter', subject: '', partner: '', assigneeEmail: existing?.assigneeEmail ?? '',
    documentOn: '', externalNumber: '', dueOn: '', priority: 'normal',
  });
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const title = action?.label ?? (incoming ? 'Vào sổ và cấp số đến' : 'Lập bản nháp');
  const people = [{ value: '', label: 'Chưa giao' }, ...Array.from(names, ([value, label]) => ({ value, label }))];
  const set = <Key extends keyof RecordDraft>(key: Key, value: RecordDraft[Key]) => {
    setDraft(current => ({ ...current, [key]: value }));
  };

  function field(label: string, value: string, change: (text: string) => void, maxLength: number,
    placeholder?: string, multiline = false) {
    return <View style={{ gap: 5 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput accessibilityLabel={label} style={[styles.input, multiline && styles.messageInput]}
        editable={!busy} value={value} onChangeText={change} maxLength={maxLength}
        placeholder={placeholder} placeholderTextColor={colors.muted} multiline={multiline} />
    </View>;
  }

  async function pick() {
    if (lock.current) return;
    lock.current = true;
    setBusy('Đang chọn tệp…');
    setError('');
    try {
      const [file] = await pickTaskAttachments({ multiple: false, type: 'application/pdf' });
      if (!file) return;
      if (file.size > 5 * 1024 * 1024 || file.size < 5) throw new Error('Chọn PDF hợp lệ, tối đa 5 MB.');
      setPdf(file);
      setConfirmed(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không đọc được tệp PDF.');
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
        assigneeEmail: draft.assigneeEmail, pdf });
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
    if (!pdf || lock.current) return;
    lock.current = true;
    setBusy('Đang mở PDF…');
    setError('');
    try {
      const bytes = Bytes.fromBase64String(await pdf.read()).toUint8Array();
      if (bytes.length !== pdf.size || !hasPdfHeader(bytes)) throw new Error('Chọn lại bản PDF hợp lệ.');
      setPreview({ name: pdf.name, bytes });
    } catch { setError('Không mở được bản PDF vừa chọn. Vui lòng chọn lại.'); }
    finally { lock.current = false; setBusy(''); }
  }

  return <View style={styles.panel}>
    <Text accessibilityRole="header" style={styles.cardTitle}>{title}</Text>
    {!existing && <>
      <Dropdown label="Loại văn bản" value={draft.kind} onChange={value => set('kind', value)} disabled={!!busy}
        choices={[{ value: 'letter', label: recordKinds.letter }, { value: 'decision', label: recordKinds.decision }]} />
      {field('Trích yếu', draft.subject, value => set('subject', value), 240)}
      {field(incoming ? 'Nơi gửi' : 'Nơi nhận', draft.partner, value => set('partner', value), 160)}
      {incoming && <>
        {field('Số bên gửi', draft.externalNumber, value => set('externalNumber', value), 100)}
        {field('Ngày văn bản', draft.documentOn, value => set('documentOn', value), 10, 'YYYY-MM-DD')}
      </>}
      {field('Hạn xử lý', draft.dueOn, value => set('dueOn', value), 10, 'YYYY-MM-DD')}
      <Dropdown label="Mức độ" value={draft.priority} disabled={!!busy} onChange={value => set('priority', value)}
        choices={[{ value: 'normal', label: 'Thường' }, { value: 'urgent', label: 'Khẩn' }]} />
    </>}
    {(!existing || existing.status === 'registered') && <Dropdown label="Người xử lý" value={draft.assigneeEmail}
      onChange={value => set('assigneeEmail', value)} choices={people} disabled={!!busy} />}
    {signing && <>
      {field('Họ tên người ký', signedByName, setSignedByName, 160)}
      {field('Ngày ký', signedOn, setSignedOn, 10, 'YYYY-MM-DD')}
      <Text style={styles.muted}>Chọn bản PDF đã ký hoặc dùng bản đã lưu nếu đã kiểm tra chữ ký.</Text>
    </>}
    {issuing && <Text style={styles.body}>Số, ký hiệu {existing ? recordNumber(existing) : ''}. Kiểm tra bản phát hành trước khi xác nhận.</Text>}
    {voiding && <Text style={styles.body}>Số {existing ? recordNumber(existing) : ''} sẽ bị hủy và không được cấp lại.</Text>}
    {(!existing || signing || issuing || (isAdmin && existing.status === 'draft' && !existing.fileId)) && <>
      <Button label={pdf ? 'Chọn PDF khác' : 'Chọn PDF'} secondary disabled={!!busy} onPress={() => void pick()} />
      {!!(pdf?.name || existing?.fileName) && <Text style={styles.muted}>{pdf?.name ?? existing?.fileName}</Text>}
      {pdf && <Button label="Xem PDF vừa chọn" secondary disabled={!!busy} onPress={() => void previewPicked()} />}
      {!!pdf && <Button label="Bỏ tệp vừa chọn" secondary disabled={!!busy}
        onPress={() => { setPdf(undefined); setConfirmed(false); }} />}
    </>}
    {existing?.fileId && <RecordPdfButton key={existing.fileId} recordId={existing.id} fileId={existing.fileId} disabled={!!busy} />}
    {(signing || issuing) && <Button secondary selected={confirmed} disabled={!!busy}
      label={signing ? 'Tôi đã kiểm tra chữ ký trên PDF' : 'Tôi đã kiểm tra chữ ký, số và ngày trên PDF'}
      onPress={() => setConfirmed(value => !value)} />}
    {field(issuing ? 'Bằng chứng phát hành' : voiding ? 'Lý do hủy số' : 'Ghi chú nhật ký', note, setNote, 500,
      issuing ? 'Nơi nhận, thời điểm, kênh gửi và tham chiếu' : undefined, true)}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    <View style={styles.choices}>
      <Button label="Hủy" secondary disabled={!!busy} onPress={onCancel} />
      <Button label={busy || (existing ? 'Xác nhận' : title)} disabled={!!busy} onPress={() => void submit()} />
    </View>
    {preview && <RecordPdfPreview file={preview} onClose={() => setPreview(undefined)} />}
  </View>;
}
