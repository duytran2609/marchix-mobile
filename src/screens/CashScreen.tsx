import { PaginatedList } from '../components/PaginatedList';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ClickableCardHeader } from '../components/CardChevron';
import { PageHeader } from '../components/PageHeader';
import { Dropdown } from '../components/Dropdown';
import { Button } from '../components/Button';
import { FieldLabel } from '../components/FieldLabel';
import { FilePickerButton } from '../components/FilePickerButton';
import { PopupCloseButton } from '../components/PopupCloseButton';
import { SearchableChoiceDropdown } from '../components/SearchableChoiceList';
import { useToast } from '../components/Toast';
import { canAct, cashStatus, cashStatuses, cashTotals, categories, changeCash, createCash, displayDate,
  expenseLimit, parties, verifiedCash, vnd, watchCash, watchCashApprovers } from '../features/cash/cash';
import type { Cash, CashAccess, CashAction, CashType } from '../features/cash/cash';
import { exportCash } from '../features/cash/exportCash';
import { cashFileLimit, cashFileList, prepareCashFiles } from '../features/cash/cashAttachments';
import { CashProofs } from '../features/cash/CashProofs';
import type { ProjectExpenseSeed } from '../features/projects/financeStore';
import { projectExpenseCategories } from '../features/projects/projectExpenseCategories';
import { watchProjects, type Project } from '../features/projects/projects';
import { formatFileSize, pickTaskAttachments, type PickedAttachment } from '../features/tasks/taskAttachments';
import { DateCalendarField } from '../features/tasks/CalendarDialog';
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

function Picker({ label, value, choices, onChange, disabled, style, placeholder = 'Chọn', highlightSelection = false, required }: {
  label: string; value: string; choices: Option[]; onChange: (value: string) => void; disabled?: boolean;
  style?: StyleProp<ViewStyle>; placeholder?: string; highlightSelection?: boolean; required?: boolean;
}) {
  return <Dropdown label={label} required={required} value={value} choices={choices.map(({ id, name }) => ({ value: id, label: name }))}
    fallbackLabel={value || placeholder} onChange={onChange} disabled={disabled} style={style} highlightSelection={highlightSelection} />;
}

function Field({ label, value, onChange, limit = 250, numeric = false, placeholder, required, requiredFor }: {
  label: string; value: string; onChange: (value: string) => void; limit?: number; numeric?: boolean; placeholder?: string; required?: boolean;
  requiredFor?: string;
}) {
  const styles = useScreenStyles();
  const { colors } = useTheme();
  return <View style={{ gap: 6 }}>
    <FieldLabel style={styles.label} required={required || !!requiredFor}>
      {requiredFor ? `${label} (${requiredFor})` : label}
    </FieldLabel>
    <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} style={styles.input}
      placeholder={placeholder} placeholderTextColor={colors.muted} maxLength={limit}
      keyboardType={numeric ? 'number-pad' : 'default'} autoCapitalize="none" />
  </View>;
}

function CashForm({ type, row, seed, projects, ledger, approvers, access, operationLock, inPopup, onBack, onSaved }: {
  type: CashType; row?: Cash; projects: Project[]; ledger: Cash[] | null; approvers: Option[]; access: CashAccess;
  seed?: ProjectExpenseSeed;
  operationLock?: { current: boolean };
  inPopup?: boolean;
  onBack: () => void; onSaved: (id: string, date: string) => void;
}) {
  const styles = useScreenStyles();
  const local = useLocalStyles();
  const [values, setValues] = useState(() => ({
    date: row?.date || todayInVietnam(), amount: row ? String(row.amount) : seed?.amount ? String(seed.amount) : '', dueDate: row?.dueDate || '',
    projectId: row?.projectId || seed?.projectId || '', note: row?.note || seed?.name || '', category: row?.category || seed?.category || '',
    method: row?.method || 'Chuyển khoản', partyType: row?.partyType || (seed ? 'Nhà cung cấp' : 'Khác'),
    partyName: row?.partyName || '', invoiceRef: row?.invoiceRef || '', approver: '', budgetCode: seed?.code || '',
  }));
  const expenseProfile = seed?.expenseProfile ?? projects.find(project => project.id === values.projectId)?.expenseProfile;
  const categoryGroups: Record<string, string[]> = type === 'chi' && (seed || row?.projectLinkLocked)
    ? projectExpenseCategories(expenseProfile, row?.category || seed?.category) : categories[type];
  const refund = seed?.refund || (row?.budgetFlow === 'depositReturn' || row?.budgetFlow === 'expenseRefund' ? row.budgetFlow : undefined);
  const [group, setGroup] = useState(() => Object.entries(categoryGroups).find(([, list]) => list.includes(values.category))?.[0] || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<PickedAttachment[]>([]);
  const [picking, setPicking] = useState(false);
  const formLock = useRef(false);
  const lock = operationLock ?? formLock;
  const set = (key: keyof typeof values) => (value: string) => setValues(prev => ({ ...prev, [key]: value }));
  const amount = Number(values.amount);
  const cap = Number(projects.find(project => project.id === values.projectId)?.budget) || 0;
  const committed = type === 'chi' && access.canReadCash && cap > 0 ? (ledger || []).reduce((total, item) => {
    if (item.id === row?.id || item.type !== 'chi' || item.projectId !== values.projectId) return total;
    const state = cashStatus(item);
    return state === 'Đã chi' || (state === 'Chờ chi' && verifiedCash(item)) ? total + (Number(item.amount) || 0) : total;
  }, 0) : 0;
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
    const { approver, budgetCode, ...draft } = values;
    const code = budgetCode.trim().toUpperCase();
    if (code && !/^[A-Z0-9][A-Z0-9._-]{0,79}$/.test(code)) return setError('Mã khoản dự toán không hợp lệ.');
    if (seed?.refund && !code) return setError('Khoản hoàn cần mã khoản dự toán gốc.');
    const fields = { ...draft, type, amount, note: draft.note.trim(), partyName: draft.partyName.trim(), invoiceRef: draft.invoiceRef.trim(),
      ...(seed && { budgetCode: code, budgetFlow: seed.refund ?? 'out' }),
      ...(seed?.refund && { category: 'Thu khác' }) };
    lock.current = true;
    setBusy(true);
    try {
      const attachments = await prepareCashFiles(picked);
      if (row) await changeCash(row, 'edit', access, '', fields, attachments);
      onSaved(row?.id ?? await createCash(fields, approver, access.email, attachments,
        seed && !seed.refund ? { expenseProfile: expenseProfile === 'fnb' ? 'fnb' : 'project' } : undefined), fields.date);
    } catch (cause) {
      setError(writeError(cause));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const projectPicker = <Picker label="Dự án" value={values.projectId} choices={[blank('Không gắn dự án'), ...projects]}
    onChange={set('projectId')} disabled={!!seed || !!refund || row?.projectLinkLocked} style={type === 'thu' ? local.half : undefined} />;
  const fields = <>
      <Text style={styles.muted}>{row ? 'Chỉ sửa được khi khoản còn chờ duyệt.'
        : 'Khoản mới sẽ ở trạng thái Chờ duyệt.'}</Text>
      <Field required label="Nội dung" value={values.note} onChange={set('note')} limit={1000} />
      <Field required label="Số tiền (VNĐ)" value={formatAmount(values.amount)}
        onChange={value => set('amount')(amountDigits(value))} numeric limit={32} />
      {type === 'chi' && amount > expenseLimit && <Text style={styles.error}>Khoản chi trên 2.000.000 đ cần duyệt bằng văn bản trước khi chi.</Text>}
      <DateCalendarField required label="Ngày giao dịch" value={validDate(values.date) ? values.date : ''}
        onChange={set('date')} disabled={busy} />
      <View style={local.pair}>
        {type === 'chi' && <Picker required label="Nhóm hạng mục" value={group} choices={options(Object.keys(categoryGroups))} style={local.half}
          onChange={value => { setGroup(value); set('category')(''); }} />}
        <Picker required label="Hạng mục" value={values.category}
          choices={options(type === 'thu' ? categories.thu.Thu : categoryGroups[group] || [])} style={local.half}
          placeholder={type === 'thu' ? 'Chọn hạng mục' : undefined} onChange={set('category')} disabled={!!refund || (type === 'chi' && !group)} />
        {type === 'thu' && projectPicker}
      </View>
      {type === 'chi' && projectPicker}
      {seed && <Field label="Mã khoản dự toán" value={values.budgetCode} onChange={set('budgetCode')} limit={80} />}
      {type === 'chi' && access.canReadCash && ledger && cap > 0 && committed + amount > cap &&
        <Text style={styles.error}>Khoản này sẽ vượt trần vốn dự án ({vnd.format(cap)}) nếu được duyệt.</Text>}
      <View style={local.pair}>
        <Picker required label="Hình thức" value={values.method} choices={options(type === 'chi' ? ['Chuyển khoản'] : ['Chuyển khoản', 'Tiền mặt'])}
          onChange={set('method')} style={local.half} />
        <Picker label="Loại đối tượng" value={values.partyType} choices={options(parties)} onChange={set('partyType')} style={local.half} />
      </View>
      <Field label="Tên đối tượng" value={values.partyName} onChange={set('partyName')} />
      <DateCalendarField label="Hạn thanh toán" value={validDate(values.dueDate) ? values.dueDate : ''}
        onChange={set('dueDate')} clearLabel="Bỏ ngày" disabled={busy} />
      <Field label="Số hóa đơn / báo giá" value={values.invoiceRef} onChange={set('invoiceRef')} limit={150} />
      {!row && <View style={local.field}>
        <Text style={styles.label}>Người duyệt</Text>
        {access.isAdmin ? <SearchableChoiceDropdown title="Người duyệt" items={approvers} selected={values.approver ? [values.approver] : []}
          disabled={busy || picking} label="Tìm người duyệt" emptyMessage="Không có người duyệt phù hợp."
          onToggle={id => set('approver')(values.approver === id ? '' : id)} />
          : <Text style={styles.muted}>Quản trị viên sẽ gán người duyệt.</Text>}
      </View>}
      {row && cashFileList(row.files).length > 0 && <CashProofs cashId={row.id} files={cashFileList(row.files)} />}
      <View style={local.field}>
        <Text style={styles.label}>Đính kèm chứng từ</Text>
        <FilePickerButton accessibilityLabel="Đính kèm chứng từ" disabled={busy} picking={picking}
          onPress={() => void pick()} hint="Tối đa 5 tệp mỗi lượt, 5 MB mỗi tệp và 8 MB tổng cộng." />
      </View>
      {picked.map((file, index) => <View key={index} style={styles.detailRow}>
        <Text style={styles.body}>{file.name} · {formatFileSize(file.size)}</Text>
        <Button label={`Bỏ ${file.name}`} secondary disabled={busy || picking}
          onPress={() => setPicked(current => current.filter((_, i) => i !== index))} />
      </View>)}
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <Button label={busy ? 'Đang lưu…' : row ? 'Lưu thay đổi' : 'Gửi khoản ' + type} onPress={() => void save()} disabled={busy || picking} />
      <Button label={row ? 'Quay lại' : 'Hủy'} secondary onPress={onBack} disabled={busy || picking} />
  </>;
  if (row) return <View style={[styles.panel, inPopup && local.popupContent]}>
    <Text accessibilityRole="header" style={styles.heading}>Sửa khoản {type}</Text>
    {fields}
  </View>;

  const close = () => { if (!lock.current) onBack(); };
  return <Modal transparent animationType="fade" statusBarTranslucent onRequestClose={close}>
    <SafeAreaView style={local.formOverlay}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={local.formKeyboard}>
        <View style={[styles.panel, local.formPanel]}>
          <View style={local.formHeader}>
            <Text accessibilityRole="header" style={styles.heading}>{seed
              ? refund ? 'Đề nghị thu hoàn dự án' : 'Đề nghị chi dự án'
              : 'Tạo đề nghị ' + type}</Text>
            <PopupCloseButton label="Đóng đề nghị" onPress={close} disabled={busy || picking} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={local.formBody}>
            {fields}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </Modal>;
}

function writeError(cause: unknown) {
  if (cause && typeof cause === 'object' && 'code' in cause) {
    if (cause.code === 'permission-denied') return 'Không thể lưu với quyền hiện tại. Kiểm tra quyền hoặc mở lại hồ sơ.';
    return 'Không lưu được khoản thu chi. Kiểm tra kết nối và thử lại.';
  }
  return cause instanceof Error ? cause.message : 'Không lưu được khoản thu chi.';
}

function CashDetail({ row, access, approvers, project, operationLock, onEdit }: {
  row: Cash; access: CashAccess; approvers: Option[]; project: string;
  operationLock: { current: boolean };
  onEdit: () => void;
}) {
  const styles = useScreenStyles();
  const local = useLocalStyles();
  const toast = useToast();
  const [assignee, setAssignee] = useState(row.approverEmail || '');
  const [note, setNote] = useState('');
  const [proof, setProof] = useState(row.ref || '');
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = operationLock;
  const can = (action: CashAction) => canAct(action, row, access);
  const eligibleApprovers = approvers.filter(option => option.id !== row.createdBy);
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
  return <View style={[styles.panel, local.popupContent]}>
    <View style={local.detailActions}>
      <Text style={styles.badge}>{cashStatus(row)}</Text>
      {can('edit') && <Button label="Sửa khoản này" secondary onPress={onEdit} disabled={busy} />}
    </View>
    <Text accessibilityRole="header" style={styles.heading}>{row.note || (row.type === 'chi' ? 'Khoản chi' : 'Khoản thu')}</Text>
    <Text style={[styles.cardTitle, row.type === 'chi' ? local.negative : local.positive]}>
      {row.type === 'chi' ? '−' : '+'}{vnd.format(row.amount)}
    </Text>
    {fields.filter(([, value]) => !!value).map(([label, value]) => <View key={label} style={styles.detailRow}>
      <Text style={[styles.label, styles.metadataLabel]}>{label}</Text><Text selectable style={styles.body}>{value}</Text>
    </View>)}
    {files.length > 0 && <CashProofs cashId={row.id} files={files} />}
    {can('route') && <View style={local.field}>
      <FieldLabel style={styles.label} required>Người duyệt</FieldLabel>
      <SearchableChoiceDropdown title="Người duyệt" items={eligibleApprovers} selected={assignee ? [assignee] : []}
        disabled={busy} label="Tìm người duyệt" emptyMessage="Không có người duyệt phù hợp."
        onToggle={id => setAssignee(current => current === id ? '' : id)} />
      <Button label="Lưu người duyệt" onPress={() => void handle('route', assignee)}
        disabled={busy || !assignee || assignee === row.approverEmail || !eligibleApprovers.some(option => option.id === assignee)} />
    </View>}
    {can('approve') && <>
      <Field label="Ý kiến xử lý" value={note} onChange={setNote} limit={500} requiredFor="khi từ chối" />
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
      <Field required label="Mã chứng từ hoặc tham chiếu giao dịch" value={proof}
        onChange={value => { setProof(value); setConfirm(false); }} limit={150} />
      {confirm && <Text style={styles.muted}>Chỉ xác nhận khi giao dịch {vnd.format(row.amount)} đã thực sự hoàn tất.</Text>}
      <Button label={confirm ? 'Xác nhận giao dịch đã hoàn tất' : row.type === 'chi' ? 'Xác nhận đã chi' : 'Xác nhận đã thu'}
        onPress={() => void handle('record', proof)} disabled={busy} />
      {confirm && <Button label="Hủy xác nhận" secondary onPress={() => setConfirm(false)} disabled={busy} />}
    </>}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
  </View>;
}

export function CashScreen({ access, initialCashId, projectExpense, onBackToReview, backLabel = 'Về Phê duyệt' }: {
  access: CashAccess; initialCashId?: string; projectExpense?: ProjectExpenseSeed; onBackToReview?: () => void;
  backLabel?: string;
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
  const [selected, setSelected] = useState(initialCashId ?? '');
  const [awaiting, setAwaiting] = useState('');
  const [editor, setEditor] = useState<{ type: CashType; row?: Cash; seed?: ProjectExpenseSeed } | undefined>(
    () => projectExpense ? { type: projectExpense.refund ? 'thu' : 'chi', seed: projectExpense } : undefined);
  const detailLock = useRef(false);
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
  const balance = totals.income - totals.expense;
  const balanceStyle = balance === 0 ? undefined : balance > 0 ? local.positive : local.negative;
  function back() {
    if (detailLock.current) return;
    if (onBackToReview) return onBackToReview();
    setEditor(undefined); setSelected(''); setAwaiting('');
  }
  function reload() { setRows(null); setError(false); setLookupError(false); setRetry(n => n + 1); }
  async function download() {
    setExporting(true);
    try { await exportCash(month, base, projectName); }
    catch (cause) { toast(cause instanceof Error ? cause.message : 'Không xuất được sổ thu chi.', 'error'); }
    finally { setExporting(false); }
  }
  const editRow = editor?.row && selectedRow && canAct('edit', selectedRow, access) ? editor.row : undefined;
  function renderForm(kind: CashType, row?: Cash) {
    return <CashForm type={kind} row={row} seed={row ? undefined : editor?.seed} access={access} projects={projects} ledger={rows}
      approvers={approvers.filter(option => option.id !== email)}
      operationLock={row ? detailLock : undefined}
      inPopup={!!row}
      onBack={() => {
        if (!row && projectExpense && onBackToReview) return onBackToReview();
        setEditor(undefined);
      }}
      onSaved={(id, date) => {
        if (!row) {
          setAwaiting(id); setMonth(date.slice(0, 7)); setType(''); setStatus(''); setProject('');
        }
        setSelected(id); setEditor(undefined); toast('Đã lưu khoản thu chi.', 'success');
      }} />;
  }
  const showDetail = !!selected && (!error || !!onBackToReview);
  const detail = editRow ? renderForm(editRow.type, editRow) : selectedRow ? <CashDetail
      key={selectedRow.id + ':' + (selectedRow.updatedAt || '')} row={selectedRow} access={access}
      approvers={approvers} project={projectName(selectedRow.projectId)}
      operationLock={detailLock}
      onEdit={() => setEditor({ type: selectedRow.type, row: selectedRow })} /> : <View style={[styles.panel, local.popupContent]}>
      {error ? <>
        <Text accessibilityRole="alert" style={styles.error}>Không tải được khoản thu chi.</Text>
        <Button label="Thử lại" secondary onPress={reload} />
      </> : !rows || awaiting === selected ? <ActivityIndicator accessibilityLabel="Đang tải giao dịch" color={colors.accent} />
        : <Text style={styles.muted}>Khoản thu chi này không còn trong phạm vi bạn được xem.</Text>}
    </View>;
  if (projectExpense && editor && !editor.row) return renderForm(editor.type);
  return <>
    {!onBackToReview && <View style={styles.stack}>
      <PageHeader title="Thu chi" />
      {!!lookupError && <View style={styles.panel}>
        <Text style={styles.muted}>Chưa tải được đầy đủ dự án hoặc danh sách người duyệt.</Text>
        <Button label="Tải lại danh mục" secondary onPress={reload} />
      </View>}
        <View style={styles.stack}>
          <Text style={styles.muted}>{canReadCash ? 'Theo dõi dòng tiền và các khoản đang chờ xử lý.'
            : 'Bạn thấy khoản mình lập và khoản được giao duyệt.'}</Text>
          <View style={local.pair}>
            <Button label="+ Tạo đề nghị thu" style={local.half} onPress={() => setEditor({ type: 'thu' })} />
            <Button label="+ Tạo đề nghị chi" style={local.half} onPress={() => setEditor({ type: 'chi' })} />
          </View>
        </View>
        {error ? <View style={styles.panel}>
          <Text accessibilityRole="alert" style={styles.error}>Không tải được sổ thu chi. Kiểm tra quyền truy cập hoặc thử lại.</Text>
          <Button label="Thử lại" secondary onPress={reload} />
        </View> : !rows ? <ActivityIndicator accessibilityLabel="Đang tải sổ thu chi" color={colors.accent} /> : <>
          <View style={styles.panel}>
            <Text accessibilityRole="header" style={styles.cardTitle}>Tổng quan</Text>
            <View style={local.pair}>
              <Picker label="Tháng" value={month} choices={[blank('Tất cả các tháng'), ...months]} style={local.half} highlightSelection
                onChange={setMonth} />
              <Picker label="Dự án" value={project} choices={[blank('Tất cả dự án'), ...projects]} style={local.half} highlightSelection
                onChange={setProject} />
            </View>
            <View style={local.metrics}>
              {([
                ['Đã thu', totals.income, local.positive],
                ['Đã chi', totals.expense, local.negative],
                ['Chênh lệch', balance, balanceStyle],
                ['Chi chờ duyệt / chờ chi', totals.pending, local.pending],
              ] as const).map(([label, value, amountStyle]) => <View key={label} style={local.metric}>
                <Text style={styles.muted}>{label}</Text>
                <Text style={[styles.cardTitle, amountStyle]}>
                  {vnd.format(value)}
                </Text>
              </View>)}
            </View>
          </View>
          <View style={styles.panel}>
            <View style={local.ledgerTitle}>
              <Text accessibilityRole="header" style={styles.cardTitle}>Sổ thu chi</Text>
              <Text style={styles.muted}>{visible.length} khoản</Text>
            </View>
            <View style={local.pair}>
              <Picker label="Loại" value={type} choices={[blank('Thu và chi'), { id: 'thu', name: 'Chỉ khoản thu' }, { id: 'chi', name: 'Chỉ khoản chi' }]}
                onChange={setType} style={local.half} highlightSelection />
              <Picker label="Trạng thái" value={status} choices={[blank('Mọi trạng thái'), ...options(cashStatuses)]}
                onChange={setStatus} style={local.half} highlightSelection />
            </View>
            {isAdmin && <Button label={exporting ? 'Đang xuất…' : 'Xuất CSV theo tháng và dự án'}
              secondary onPress={() => void download()} disabled={exporting || !base.length} />}
            {!visible.length && <Text style={styles.muted}>Chưa có khoản nào khớp bộ lọc.</Text>}
            <PaginatedList items={visible} initialSize={25} resetKey={JSON.stringify([month, project, type, status])}>
            {pageItems => pageItems.map(row => <Pressable key={row.id} accessibilityRole="button"
              onPress={() => setSelected(row.id)}
              style={({ pressed }) => [local.entry, pressed && styles.dimmed]}>
              <ClickableCardHeader><Text style={styles.badge}>{cashStatus(row)}</Text></ClickableCardHeader>
              <Text style={styles.label}>{row.note || row.category || 'Khoản ' + row.type}</Text>
              <Text style={[styles.cardTitle, row.type === 'chi' ? local.negative : local.positive]}>
                {row.type === 'chi' ? '−' : '+'}{vnd.format(row.amount)}
              </Text>
              {([
                ['Ngày giao dịch', displayDate(row.date)], ['Hạng mục', row.category], ['Đối tượng', row.partyName],
              ] as const).filter(([, value]) => !!value).map(([label, value]) => (
                <Text key={label} style={styles.muted}><Text style={local.metaLabel}>{label}: </Text>{value}</Text>
              ))}
              {row.projectId ? <Text style={local.entryTag}><Text style={styles.metadataLabel}>Dự án: </Text>{projectName(row.projectId)}</Text> : null}
            </Pressable>)}
            </PaginatedList>
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
        </>}
        {editor && !editor.row && renderForm(editor.type)}
    </View>}
    {showDetail && <Modal transparent statusBarTranslucent animationType="fade" onRequestClose={back}>
        <SafeAreaView style={local.formOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={local.formKeyboard}>
            <View role="dialog" accessibilityViewIsModal accessibilityLabel="Chi tiết khoản thu chi"
              style={[local.formPanel, local.detailPopup]}>
              <View style={[local.formHeader, local.detailHeader]}>
                <Text style={styles.cardTitle}>Chi tiết khoản thu chi</Text>
                <PopupCloseButton label={onBackToReview ? backLabel : "Đóng chi tiết khoản thu chi"} onPress={back} />
              </View>
              <ScrollView key={editRow ? 'edit' : 'detail'} style={local.detailBody} keyboardShouldPersistTaps="handled">
                {onBackToReview && lookupError && <View style={styles.panel}>
                  <Text style={styles.muted}>Chưa tải được đầy đủ dự án hoặc danh sách người duyệt.</Text>
                  <Button label="Tải lại danh mục" secondary onPress={reload} />
                </View>}
                {detail}
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
    </Modal>}
  </>;
}

const useLocalStyles = createThemedStyles(colors => StyleSheet.create({
  pair: { flexDirection: 'row', gap: 8 },
  half: { flex: 1, minWidth: 0 },
  formOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  formKeyboard: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 12 },
  formPanel: { width: '100%', maxWidth: 560, maxHeight: '100%', flexShrink: 1 },
  formHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  formBody: { gap: 12, paddingBottom: 2 },
  detailPopup: { backgroundColor: colors.paper, borderRadius: 16, overflow: 'hidden' },
  detailHeader: { paddingLeft: 16, paddingRight: 8, paddingTop: 4 },
  detailBody: { flexGrow: 0 },
  detailActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  popupContent: { borderWidth: 0, borderRadius: 0 },
  metaLabel: { color: colors.metadataLabel, fontWeight: '700' },
  entryTag: { alignSelf: 'flex-start', maxWidth: '100%', overflow: 'hidden', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
    backgroundColor: colors.accentSoft, color: colors.accent, fontSize: 12, fontWeight: '700' },
  ledgerTitle: { gap: 2 },
  positive: { color: colors.success },
  negative: { color: colors.danger },
  pending: { color: colors.warning },
  field: { gap: 6 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { flexBasis: '46%', flexGrow: 1, padding: 10, borderRadius: 9, backgroundColor: colors.accentSoft, gap: 4 },
  entry: { borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: 12, gap: 6 },
  barTrack: { borderRadius: 5, backgroundColor: colors.accentSoft, height: 7 },
  bar: { borderRadius: 5, backgroundColor: colors.accent, height: 7 },
}));
