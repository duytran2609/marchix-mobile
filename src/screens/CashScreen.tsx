import { useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { ActivityIndicator, Keyboard, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { PageHeader } from '../components/PageHeader';
import { Dropdown } from '../components/Dropdown';
import { Button } from '../components/Button';
import { useToast } from '../components/Toast';
import { canAct, cashStatus, cashStatuses, cashTotals, categories, changeCash, createCash, displayDate,
  expenseLimit, parties, verifiedCash, vnd, watchCash, watchCashApprovers } from '../features/cash/cash';
import type { Cash, CashAccess, CashAction, CashType } from '../features/cash/cash';
import { exportCash } from '../features/cash/exportCash';
import { cashFileLimit, cashFileList, prepareCashFiles } from '../features/cash/cashAttachments';
import { CashProofs } from '../features/cash/CashProofs';
import { watchProjects, type Project } from '../features/projects/projects';
import { formatFileSize, pickTaskAttachments, type PickedAttachment } from '../features/tasks/taskAttachments';
import { AssignmentCalendar, displayDay } from '../features/tasks/AssignmentCalendar';
import { todayInVietnam } from '../features/tasks/taskDates';
import { useScreenStyles } from '../theme/screenStyles';
import { createThemedStyles, useTheme } from '../theme/theme';

type Option = { id: string; name: string };
const options = (values: readonly string[]) => values.map(value => ({ id: value, name: value }));
const blank = (name: string) => ({ id: '', name });
const amountDigits = (value: string) => value.replace(/[^0-9]/g, '');
const formatAmount = (value: string) => value.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const validDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

function Picker({ label, value, choices, onChange, disabled, style }: {
  label: string; value: string; choices: Option[]; onChange: (value: string) => void; disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return <Dropdown label={label} value={value} choices={choices.map(({ id, name }) => ({ value: id, label: name }))}
    fallbackLabel={value || 'Chọn'} onChange={onChange} disabled={disabled} style={style} />;
}

function Field({ label, value, onChange, limit = 250, numeric = false, placeholder }: {
  label: string; value: string; onChange: (value: string) => void; limit?: number; numeric?: boolean; placeholder?: string;
}) {
  const styles = useScreenStyles();
  const { colors } = useTheme();
  return <View style={{ gap: 6 }}>
    <Text style={styles.label}>{label}</Text>
    <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} style={styles.input}
      placeholder={placeholder} placeholderTextColor={colors.muted} maxLength={limit}
      keyboardType={numeric ? 'number-pad' : 'default'} autoCapitalize="none" />
  </View>;
}

function CashDateField({ label, value, onChange, optional = false, disabled }: {
  label: string; value: string; onChange: (value: string) => void; optional?: boolean; disabled: boolean;
}) {
  const styles = useScreenStyles();
  const local = useLocalStyles();
  const [open, setOpen] = useState(false);
  const trigger = useRef<ComponentRef<typeof Pressable>>(null);
  const day = validDate(value) ? value : '';
  const display = day ? displayDay(day) : 'Chọn ngày';
  function close() {
    setOpen(false);
    if (Platform.OS === 'web') requestAnimationFrame(() => trigger.current?.focus());
  }
  return <View style={local.field}>
    <Text style={styles.label}>{label}</Text>
    <Pressable ref={trigger} accessibilityRole="button" accessibilityLabel={`${label}, ${display}`}
      aria-expanded={open} disabled={disabled} style={[styles.input, local.dateButton]}
      onPress={() => { Keyboard.dismiss(); setOpen(true); }}>
      <Text style={day ? styles.label : styles.muted}>{display}</Text>
      <Text style={styles.label} aria-hidden>▦</Text>
    </Pressable>
    {open && <Modal transparent animationType="none" onRequestClose={close}>
      <View style={local.calendarOverlay}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Đóng lịch" onPress={close} />
        <ScrollView style={local.calendarPanel} contentContainerStyle={local.calendarContent} keyboardShouldPersistTaps="handled">
          <Text accessibilityRole="header" style={styles.heading}>{label}</Text>
          <AssignmentCalendar initialDay={day || todayInVietnam()} value={day} disabled={disabled}
            onSelect={next => { onChange(next); close(); }} />
          {optional && day && <Button label="Bỏ ngày" secondary onPress={() => { onChange(''); close(); }} />}
          <Button label="Đóng" secondary onPress={close} />
        </ScrollView>
      </View>
    </Modal>}
  </View>;
}

const cashTypes = ['thu', 'chi'] as const;
const cashTabLabel = (type: CashType, isAdmin: boolean) => isAdmin ? 'Ghi khoản ' + type
  : type === 'chi' ? 'Đề nghị chi' : 'Báo khoản thu';

function CashTabs({ active, isAdmin, disabled, onSelect }: {
  active?: CashType; isAdmin: boolean; disabled?: boolean; onSelect: (type: CashType) => void;
}) {
  const local = useLocalStyles();
  return <View style={local.pair}>{cashTypes.map(type => <Button key={type}
    label={cashTabLabel(type, isAdmin)} secondary={active ? active !== type : type === 'thu'}
    selected={active && active === type} style={[local.half, active === type && local.activeTab]}
    disabled={disabled} onPress={() => onSelect(type)} />)}</View>;
}

function CashForm({ type, row, projects, ledger, approvers, access, onSwitch, onBack, onSaved }: {
  type: CashType; row?: Cash; projects: Project[]; ledger: Cash[] | null; approvers: Option[]; access: CashAccess;
  onSwitch?: (type: CashType) => void; onBack: () => void; onSaved: (id: string, date: string) => void;
}) {
  const styles = useScreenStyles();
  const local = useLocalStyles();
  const [values, setValues] = useState(() => ({
    date: row?.date || todayInVietnam(), amount: row ? String(row.amount) : '', dueDate: row?.dueDate || '',
    projectId: row?.projectId || '', note: row?.note || '', category: row?.category || '',
    method: row?.method || 'Chuyển khoản', partyType: row?.partyType || 'Khác',
    partyName: row?.partyName || '', invoiceRef: row?.invoiceRef || '', approver: '',
  }));
  const [group, setGroup] = useState(() => Object.entries(categories[type]).find(([, list]) => list.includes(values.category))?.[0] || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<PickedAttachment[]>([]);
  const [picking, setPicking] = useState(false);
  const lock = useRef(false);
  const set = (key: keyof typeof values) => (value: string) => setValues(prev => ({ ...prev, [key]: value }));
  const amount = Number(values.amount);
  const cap = Number(projects.find(project => project.id === values.projectId)?.budget) || 0;
  const committed = type === 'chi' && access.canReadCash && cap > 0 ? (ledger || []).reduce((total, item) => {
    if (item.id === row?.id || item.type !== 'chi' || item.projectId !== values.projectId) return total;
    const state = cashStatus(item);
    return state === 'Đã chi' || (state === 'Chờ chi' && verifiedCash(item)) ? total + (Number(item.amount) || 0) : total;
  }, 0) : 0;
  const categoryGroups: Record<string, string[]> = categories[type];
  async function pick() {
    if (lock.current) return;
    lock.current = true;
    setPicking(true);
    setError('');
    try {
      const files = [...picked, ...await pickTaskAttachments()];
      const problem = cashFileLimit(files);
      if (problem) setError(problem);
      else setPicked(files);
    } catch {
      setError('Không đọc được tệp đã chọn. Vui lòng chọn lại.');
    } finally {
      lock.current = false;
      setPicking(false);
    }
  }

  async function save() {
    if (lock.current) return;
    setError('');
    if (!Number.isSafeInteger(amount) || amount < 1) return setError('Nhập số tiền nguyên lớn hơn 0 (VNĐ).');
    if (!validDate(values.date) || (values.dueDate && !validDate(values.dueDate))) return setError('Chọn ngày hợp lệ.');
    if (!values.note.trim() || !values.category) return setError('Nhập nội dung và chọn hạng mục.');
    if (type === 'chi' && values.method !== 'Chuyển khoản') return setError('Khoản chi phải dùng chuyển khoản.');
    const { approver, ...draft } = values;
    const fields = { ...draft, type, amount, note: draft.note.trim(), partyName: draft.partyName.trim(), invoiceRef: draft.invoiceRef.trim() };
    lock.current = true;
    setBusy(true);
    try {
      const attachments = await prepareCashFiles(picked);
      if (row) await changeCash(row, 'edit', access, '', fields, attachments);
      onSaved(row?.id ?? await createCash(fields, approver, access.email, attachments), fields.date);
    } catch (cause) {
      setError(writeError(cause));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return <View style={styles.panel}>
    {onSwitch && <CashTabs active={type} isAdmin={access.isAdmin} disabled={busy || picking} onSelect={onSwitch} />}
    {row && <Text accessibilityRole="header" style={styles.heading}>Sửa khoản {type}</Text>}
    <Text style={styles.muted}>{row ? 'Chỉ sửa được khi khoản còn chờ duyệt.'
      : access.isAdmin ? 'Khoản mới sẽ ở trạng thái Chờ duyệt.'
      : 'Khoản mới sẽ ở trạng thái Chờ duyệt. Quản trị viên sẽ chỉ định người xử lý.'}</Text>
    <Field label="Nội dung" value={values.note} onChange={set('note')} limit={1000} />
    <Field label="Số tiền (VNĐ)" value={formatAmount(values.amount)}
      onChange={value => set('amount')(amountDigits(value))} numeric limit={32} />
    {type === 'chi' && amount > expenseLimit && <Text style={styles.error}>Khoản chi trên 2.000.000 đ cần duyệt bằng văn bản trước khi chi.</Text>}
    <CashDateField label="Ngày giao dịch" value={values.date} onChange={set('date')} disabled={busy} />
    <View style={local.pair}>
      <Picker label="Nhóm hạng mục" value={group} choices={options(Object.keys(categoryGroups))} style={local.half}
        onChange={value => { setGroup(value); set('category')(''); }} />
      <Picker label="Hạng mục" value={values.category} choices={options(categoryGroups[group] || [])} style={local.half}
        onChange={set('category')} disabled={!group} />
    </View>
    <Picker label="Dự án" value={values.projectId} choices={[blank('Không gắn dự án'), ...projects]}
      onChange={set('projectId')} disabled={row?.projectLinkLocked} />
    {type === 'chi' && access.canReadCash && ledger && cap > 0 && committed + amount > cap &&
      <Text style={styles.error}>Khoản này sẽ vượt trần vốn dự án ({vnd.format(cap)}) nếu được duyệt.</Text>}
    <View style={local.pair}>
      <Picker label="Hình thức" value={values.method} choices={options(type === 'chi' ? ['Chuyển khoản'] : ['Chuyển khoản', 'Tiền mặt'])}
        onChange={set('method')} style={local.half} />
      <Picker label="Loại đối tượng" value={values.partyType} choices={options(parties)} onChange={set('partyType')} style={local.half} />
    </View>
    <Field label="Tên đối tượng" value={values.partyName} onChange={set('partyName')} />
    <CashDateField label="Hạn thanh toán" value={values.dueDate} onChange={set('dueDate')} optional disabled={busy} />
    <Field label="Số hóa đơn / báo giá" value={values.invoiceRef} onChange={set('invoiceRef')} limit={150} />
    {!row && access.isAdmin && <Picker label="Người duyệt" value={values.approver}
      choices={[blank('Chỉ định sau'), ...approvers]} onChange={set('approver')} />}
    {row && cashFileList(row.files).length > 0 && <CashProofs cashId={row.id} files={cashFileList(row.files)} />}
    <View style={local.field}>
      <Text style={styles.label}>Đính kèm chứng từ</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Đính kèm chứng từ"
        disabled={busy || picking} onPress={() => void pick()}
        style={({ pressed }) => [local.filePicker, (pressed || busy || picking) && styles.dimmed]}>
        <Text style={local.fileAction}>{picking ? 'Đang chọn tệp…' : '+ Chọn tệp'}</Text>
        <Text style={local.fileHint}>Tối đa 5 tệp mỗi lượt, 5 MB mỗi tệp và 8 MB tổng cộng.</Text>
      </Pressable>
    </View>
    {picked.map((file, index) => <View key={index} style={styles.detailRow}>
      <Text style={styles.body}>{file.name} · {formatFileSize(file.size)}</Text>
      <Button label={`Bỏ ${file.name}`} secondary disabled={busy || picking}
        onPress={() => setPicked(current => current.filter((_, i) => i !== index))} />
    </View>)}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    <Button label={busy ? 'Đang lưu…' : row ? 'Lưu thay đổi' : 'Gửi khoản ' + type} onPress={() => void save()} disabled={busy || picking} />
    <Button label="Quay lại" secondary onPress={onBack} disabled={busy || picking} />
  </View>;
}

function writeError(cause: unknown) {
  if (cause && typeof cause === 'object' && 'code' in cause) {
    if (cause.code === 'permission-denied') return 'Không thể lưu với quyền hiện tại. Kiểm tra quyền hoặc mở lại hồ sơ.';
    return 'Không lưu được khoản thu chi. Kiểm tra kết nối và thử lại.';
  }
  return cause instanceof Error ? cause.message : 'Không lưu được khoản thu chi.';
}

function CashDetail({ row, access, approvers, project, backLabel, onBack, onEdit }: {
  row: Cash; access: CashAccess; approvers: Option[]; project: string; backLabel: string;
  onBack: () => void; onEdit: () => void;
}) {
  const styles = useScreenStyles();
  const toast = useToast();
  const [assignee, setAssignee] = useState(row.approverEmail || '');
  const [note, setNote] = useState('');
  const [proof, setProof] = useState(row.ref || '');
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const can = (action: CashAction) => canAct(action, row, access);
  const files = cashFileList(row.files);
  async function handle(action: CashAction, raw = '') {
    if (lock.current) return;
    const value = raw.trim();
    setError('');
    if (action === 'reject' && !value) return setError('Nhập lý do từ chối.');
    if (action === 'record' && !value) return setError('Nhập mã chứng từ hoặc tham chiếu giao dịch.');
    if (action === 'record' && !confirm) { setConfirm(true); return; }
    lock.current = true;
    setBusy(true);
    try {
      await changeCash(row, action, access, value);
      setConfirm(false);
      toast('Đã cập nhật khoản thu chi.', 'success');
    } catch (cause) { setError(writeError(cause)); }
    finally { lock.current = false; setBusy(false); }
  }
  const fields = [
    ['Ngày giao dịch', displayDate(row.date)], ['Hạn thanh toán', row.dueDate && displayDate(row.dueDate)],
    ['Hạng mục', row.category], ['Hình thức', row.method], ['Dự án', project],
    ['Đối tượng', [row.partyName, row.partyType].filter(Boolean).join(' · ')], ['Người lập', row.createdBy],
    ['Người duyệt được giao', row.approverEmail || 'Chưa chỉ định'], ['Người xử lý', row.approvedBy],
    ['Thời điểm duyệt', row.approvedAt && displayDate(row.approvedAt)],
    ['Ý kiến xử lý', row.approvalNote], ['Người xác nhận', row.paidBy], ['Ngày xác nhận', row.paidAt && displayDate(row.paidAt)],
    ['Hóa đơn / báo giá', row.invoiceRef], ['Mã chứng từ / giao dịch', row.ref], ['Mã hồ sơ', row.id],
  ];
  return <View style={styles.panel}>
    <Button label={backLabel} secondary onPress={onBack} disabled={busy} />
    <Text style={styles.badge}>{cashStatus(row)}</Text>
    <Text accessibilityRole="header" style={styles.heading}>{row.note || (row.type === 'chi' ? 'Khoản chi' : 'Khoản thu')}</Text>
    <Text style={styles.cardTitle}>{row.type === 'chi' ? '−' : '+'}{vnd.format(row.amount)}</Text>
    {fields.filter(([, value]) => !!value).map(([label, value]) => <View key={label} style={styles.detailRow}>
      <Text style={styles.label}>{label}</Text><Text selectable style={styles.body}>{value}</Text>
    </View>)}
    {files.length > 0 && <CashProofs cashId={row.id} files={files} />}
    {can('edit') && <Button label="Sửa khoản này" secondary onPress={onEdit} disabled={busy} />}
    {can('route') && <>
      <Picker label="Người duyệt" value={assignee}
        choices={[blank('Chọn người duyệt'), ...approvers.filter(option => option.id !== row.createdBy)]}
        onChange={setAssignee} disabled={busy} />
      <Button label="Lưu người duyệt" secondary onPress={() => void handle('route', assignee)}
        disabled={busy || !assignee || assignee === row.approverEmail || !approvers.some(option => option.id === assignee)} />
    </>}
    {can('approve') && <>
      <Field label="Ý kiến xử lý" value={note} onChange={setNote} limit={500} />
      <View style={styles.choices}>
        <Button label="Duyệt" onPress={() => void handle('approve', note)} disabled={busy} />
        <Button label="Từ chối" secondary onPress={() => void handle('reject', note)} disabled={busy} />
      </View>
    </>}
    {can('requeue') && <>
      <Text style={styles.muted}>Khoản cũ chưa có người duyệt hợp lệ. Đưa về Chờ duyệt trước khi xác nhận giao dịch.</Text>
      <Button label="Đưa về chờ duyệt" secondary onPress={() => void handle('requeue')} disabled={busy} />
    </>}
    {can('record') && <>
      <Field label="Mã chứng từ hoặc tham chiếu giao dịch" value={proof}
        onChange={value => { setProof(value); setConfirm(false); }} limit={150} />
      {confirm && <Text style={styles.muted}>Chỉ xác nhận khi giao dịch {vnd.format(row.amount)} đã thực sự hoàn tất.</Text>}
      <Button label={confirm ? 'Xác nhận giao dịch đã hoàn tất' : row.type === 'chi' ? 'Xác nhận đã chi' : 'Xác nhận đã thu'}
        onPress={() => void handle('record', proof)} disabled={busy} />
      {confirm && <Button label="Hủy xác nhận" secondary onPress={() => setConfirm(false)} disabled={busy} />}
    </>}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
  </View>;
}

const pageSize = 25;
export function CashScreen({ access, initialCashId, onBackToReview, onScrollTop }: {
  access: CashAccess; initialCashId?: string; onBackToReview?: () => void; onScrollTop: () => void;
}) {
  const styles = useScreenStyles();
  const local = useLocalStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const [rows, setRows] = useState<Cash[] | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [approvers, setApprovers] = useState<Option[]>([]);
  const [lookupError, setLookupError] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const currentMonth = todayInVietnam().slice(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [project, setProject] = useState('');
  const [limit, setLimit] = useState(pageSize);
  const [selected, setSelected] = useState(initialCashId ?? '');
  const [awaiting, setAwaiting] = useState('');
  const [editor, setEditor] = useState<{ type: CashType; row?: Cash }>();
  const [exporting, setExporting] = useState(false);
  const { email, isAdmin, canReadCash, canReviewCash } = access;
  useEffect(() => watchCash({ email, isAdmin, canReadCash, canReviewCash }, setRows,
    () => { setRows(null); setError(true); }), [email, isAdmin, canReadCash, canReviewCash, retry]);
  useEffect(() => watchProjects(setProjects, () => { setProjects([]); setLookupError(true); }), [retry]);
  useEffect(() => {
    if (!isAdmin) return;
    return watchCashApprovers(setApprovers, () => { setApprovers([]); setLookupError(true); });
  }, [isAdmin, retry]);
  const selectedRow = rows?.find(row => row.id === selected);
  useEffect(() => { if (selectedRow && awaiting === selectedRow.id) setAwaiting(''); }, [awaiting, selectedRow]);
  const projectName = (id: string) => id ? projects.find(item => item.id === id)?.name || id : '';
  const base = (rows || []).filter(row => (!month || row.date?.slice(0, 7) === month) && (!project || row.projectId === project));
  const visible = base.filter(row => (!type || row.type === type) && (!status || cashStatus(row) === status));
  const months = [...new Set([currentMonth, ...(rows || []).map(row => row.date?.slice(0, 7)).filter(value => /^\d{4}-\d{2}$/.test(value || ''))])]
    .sort().reverse().map(id => ({ id, name: `Tháng ${id.slice(5)}/${id.slice(0, 4)}` }));
  const totals = cashTotals(base);
  function openForm(kind: CashType) {
    if (editor?.type === kind && !editor.row) return;
    setEditor({ type: kind });
    onScrollTop();
  }
  const onWeb = () => { void Linking.openURL('https://quanly.marchix.vn/#thu-chi').catch(() => toast('Không mở được trang Thu chi trên web.', 'error')); };
  const backLabel = onBackToReview ? 'Về Phê duyệt' : 'Về sổ thu chi';
  function back() {
    if (onBackToReview) return onBackToReview();
    setEditor(undefined); setSelected(''); setAwaiting(''); onScrollTop();
  }
  function reload() { setRows(null); setError(false); setLookupError(false); setRetry(n => n + 1); }
  async function download() {
    setExporting(true);
    try { await exportCash(month, base, projectName); }
    catch (cause) { toast(cause instanceof Error ? cause.message : 'Không xuất được sổ thu chi.', 'error'); }
    finally { setExporting(false); }
  }
  const showEditor = editor && (!editor.row || (selectedRow && canAct('edit', selectedRow, access)));
  function renderForm(kind: CashType, row?: Cash) {
    return <CashForm type={kind} row={row} access={access} projects={projects} ledger={rows}
      approvers={approvers.filter(option => option.id !== email)} onSwitch={row ? undefined : openForm}
      onBack={() => { setEditor(undefined); onScrollTop(); }}
      onSaved={(id, date) => {
        if (!row) {
          setAwaiting(id); setMonth(date.slice(0, 7)); setType(''); setStatus(''); setProject(''); setLimit(pageSize);
        }
        setSelected(id); setEditor(undefined); onScrollTop(); toast('Đã lưu khoản thu chi.', 'success');
      }} />;
  }
  return <View style={styles.stack}>
    {(!selected || error) && <PageHeader title="Thu chi" />}
    {!!lookupError && <View style={styles.panel}>
      <Text style={styles.muted}>Chưa tải được đầy đủ dự án hoặc danh sách người duyệt.</Text>
      <Button label="Tải lại danh mục" secondary onPress={reload} />
    </View>}
    {showEditor ? editor.row ? <View key={editor.row.id}>{renderForm(editor.type, editor.row)}</View> :
      cashTypes.map(kind => <View key={kind} style={editor.type !== kind && local.hidden}>
        {renderForm(kind)}
      </View>) : selected && selectedRow && !error ? <CashDetail
      key={selectedRow.id + ':' + (selectedRow.updatedAt || '')} row={selectedRow} access={access}
      approvers={approvers} project={projectName(selectedRow.projectId)} backLabel={backLabel} onBack={back}
      onEdit={() => { setEditor({ type: selectedRow.type, row: selectedRow }); onScrollTop(); }} /> : selected && !error ? <View style={styles.panel}>
      {!rows || awaiting === selected ? <ActivityIndicator accessibilityLabel="Đang tải giao dịch" color={colors.accent} />
        : <Text style={styles.muted}>Khoản thu chi này không còn trong phạm vi bạn được xem.</Text>}
      <Button label={backLabel} secondary onPress={back} />
    </View> : <>
      <View style={styles.stack}>
        <Text style={styles.muted}>{canReadCash ? 'Theo dõi dòng tiền và các khoản đang chờ xử lý.'
          : 'Bạn thấy khoản mình lập và khoản được giao duyệt.'}</Text>
        <CashTabs isAdmin={isAdmin} onSelect={openForm} />
      </View>
      {error ? <View style={styles.panel}>
        <Text accessibilityRole="alert" style={styles.error}>Không tải được sổ thu chi. Kiểm tra quyền truy cập hoặc thử lại.</Text>
        {onBackToReview && <Button label={backLabel} secondary onPress={back} />}
        <Button label="Thử lại" secondary onPress={reload} />
        <Button label="Mở Thu chi trên web" secondary onPress={onWeb} />
      </View> : !rows ? <ActivityIndicator accessibilityLabel="Đang tải sổ thu chi" color={colors.accent} /> : <>
        <View style={styles.panel}>
          <View style={local.pair}>
            <Picker label="Tháng" value={month} choices={[blank('Tất cả các tháng'), ...months]} style={local.half}
              onChange={value => { setMonth(value); setLimit(pageSize); }} />
            <Picker label="Dự án" value={project} choices={[blank('Tất cả dự án'), ...projects]} style={local.half}
              onChange={value => { setProject(value); setLimit(pageSize); }} />
          </View>
          <View style={local.metrics}>
            {([
              ['Đã thu', totals.income], ['Đã chi', totals.expense], ['Chênh lệch', totals.income - totals.expense],
              ['Chi chờ duyệt / chờ chi', totals.pending],
            ] as const).map(([label, value]) => <View key={label} style={local.metric}>
              <Text style={styles.muted}>{label}</Text><Text style={value < 0 ? styles.error : styles.cardTitle}>{vnd.format(value)}</Text>
            </View>)}
          </View>
        </View>
        <View style={styles.panel}>
          <Text accessibilityRole="header" style={styles.cardTitle}>Sổ thu chi · {visible.length} khoản</Text>
          <View style={local.pair}>
            <Picker label="Loại" value={type} choices={[blank('Thu và chi'), { id: 'thu', name: 'Chỉ khoản thu' }, { id: 'chi', name: 'Chỉ khoản chi' }]}
              onChange={value => { setType(value); setLimit(pageSize); }} style={local.half} />
            <Picker label="Trạng thái" value={status} choices={[blank('Mọi trạng thái'), ...options(cashStatuses)]}
              onChange={value => { setStatus(value); setLimit(pageSize); }} style={local.half} />
          </View>
          {isAdmin && <Button label={exporting ? 'Đang xuất…' : 'Xuất CSV theo tháng và dự án'}
            secondary onPress={() => void download()} disabled={exporting || !base.length} />}
          {!visible.length && <Text style={styles.muted}>Chưa có khoản nào khớp bộ lọc.</Text>}
          {visible.slice(0, limit).map(row => <Pressable key={row.id} accessibilityRole="button"
            onPress={() => { setSelected(row.id); onScrollTop(); }}
            style={({ pressed }) => [local.entry, pressed && styles.dimmed]}>
            <Text style={styles.badge}>{cashStatus(row)}</Text>
            <Text style={styles.label}>{row.note || row.category || 'Khoản ' + row.type}</Text>
            <Text style={row.type === 'chi' ? styles.error : styles.cardTitle}>{row.type === 'chi' ? '−' : '+'}{vnd.format(row.amount)}</Text>
            <Text style={styles.muted}>{[displayDate(row.date), row.category, row.partyName, projectName(row.projectId)].filter(Boolean).join(' · ')}</Text>
          </Pressable>)}
          {visible.length > limit && <Button label="Xem thêm" secondary onPress={() => setLimit(n => n + pageSize)} />}
        </View>
        <View style={styles.panel}>
          <Text accessibilityRole="header" style={styles.cardTitle}>Đã chi theo hạng mục</Text>
          {!totals.categories.length && <Text style={styles.muted}>Chưa có khoản đã chi trong kỳ.</Text>}
          {totals.categories.map(([category, value]) => <View key={category} style={{ gap: 5 }}>
            <Text style={styles.label}>{category} · {vnd.format(value)}</Text>
            <View style={local.barTrack}><View style={[local.bar, { width: `${value / totals.categories[0][1] * 100}%` }]} /></View>
          </View>)}
          <Text style={styles.muted}>Không chi tiền mặt. Khoản chi trên 2.000.000 đ cần duyệt bằng văn bản trước khi chi.</Text>
        </View>
        <Button label="Mở Thu chi trên web" secondary onPress={onWeb} />
      </>}
    </>}
  </View>;
}

const useLocalStyles = createThemedStyles(colors => StyleSheet.create({
  pair: { flexDirection: 'row', gap: 8 },
  half: { flex: 1, minWidth: 0 },
  activeTab: { backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accent },
  hidden: { display: 'none' },
  field: { gap: 6 },
  dateButton: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  calendarOverlay: { flex: 1, padding: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  calendarPanel: { flexGrow: 0, width: '100%', maxWidth: 440, maxHeight: '90%', backgroundColor: colors.paper, borderRadius: 12 },
  calendarContent: { padding: 12, gap: 10 },
  filePicker: { padding: 16, alignItems: 'center', gap: 6, borderRadius: 9, borderWidth: 1, borderStyle: 'dashed',
    borderColor: colors.accent, backgroundColor: colors.accentSoft },
  fileAction: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  fileHint: { color: colors.muted, fontSize: 12, textAlign: 'center' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { flexBasis: '46%', flexGrow: 1, padding: 10, borderRadius: 9, backgroundColor: colors.accentSoft, gap: 4 },
  entry: { borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: 12, gap: 6 },
  barTrack: { borderRadius: 5, backgroundColor: colors.accentSoft, height: 7 },
  bar: { borderRadius: 5, backgroundColor: colors.accent, height: 7 },
}));
