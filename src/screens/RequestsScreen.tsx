import { PaginatedList } from '../components/PaginatedList';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import type { TextInputProps } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ClickableCardHeader } from '../components/CardChevron';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/Button';
import { FieldLabel } from '../components/FieldLabel';
import { Dropdown } from '../components/Dropdown';
import { SearchableChoiceDropdown, SearchableChoiceList } from '../components/SearchableChoiceList';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DeleteIconButton } from '../components/DeleteIconButton';
import { PopupCloseButton } from '../components/PopupCloseButton';
import { useToast } from '../components/Toast';
import { displayDate, vnd } from '../features/cash/cash';
import {
  canActOnRequest, changeRequest, createRequest, loadRequestMembers, overtimeTaskLimit, overtimeTasks,
  pendingRequest, requestTypes, watchRequests,
} from '../features/requests/requests';
import type { RequestAccess, RequestAction, RequestFields, StaffRequest } from '../features/requests/requests';
import { CalendarDialog, DateCalendarButton } from '../features/tasks/CalendarDialog';
import { shiftDay, todayInVietnam } from '../features/tasks/taskDates';
import type { Task } from '../features/tasks/tasks';
import { useScreenStyles } from '../theme/screenStyles';
import { createThemedStyles, useTheme } from '../theme/theme';

type Member = Awaited<ReturnType<typeof loadRequestMembers>>[number];
type RequestTasks = { tasks: Task[] | null; tasksError: boolean; onRetryTasks: () => void };
const requestTypeChoices = requestTypes.map(value => ({ value, label: value }));
const months = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'));
const displayMonth = (value: string) => value.split('-').reverse().join('/');
const groupDigits = (value: string) => value.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const digitsOnly = (value: string) => value.replace(/\D/g, '').slice(0, 15);
const rangeDays = (from: string, to: string) =>
  1 + (Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000;
const validDuration = (value: number) => value > 0 && value <= 366 && value % 0.5 === 0;
const getMemberName = (email: string | undefined, members: Member[]) =>
  members.find(member => member.email === email)?.name || email || 'Chưa chỉ định';

function requestPeriod(row: StaffRequest) {
  if (row.type === 'Tạm ứng lương') return vnd.format(row.amount || 0);
  if (row.type === 'Làm thêm giờ' && row.overtime) {
    return displayDate(row.from) + ' · ' + row.overtime.hours.toLocaleString('vi-VN') + ' giờ';
  }
  return [displayDate(row.from) + (row.to && row.to !== row.from ? ' – ' + displayDate(row.to) : ''),
    row.days ? row.days + ' ngày' : ''].filter(Boolean).join(' · ');
}

function RequestStatus({ status }: { status: string }) {
  const shared = useScreenStyles();
  const styles = useStyles();
  const tone = status === pendingRequest ? styles.pending : status === 'Đã duyệt' ? styles.approved
    : status === 'Từ chối' ? styles.rejected : undefined;
  return <Text style={[shared.badge, tone]}>{status}</Text>;
}

const requestDeleteMessage = (row: StaffRequest) =>
  `Đơn “${row.type}” tạo ngày ${displayDate(row.createdAt)} sẽ bị xóa vĩnh viễn.`;

export function RequestsScreen({ name, tasks, tasksError, onRetryTasks, initialRequestId, onBackToReview,
  backLabel = 'Về Phê duyệt', ...access }:
  RequestAccess & RequestTasks & { name: string; initialRequestId?: string; onBackToReview?: () => void; backLabel?: string }) {
  const { email, isAdmin, canReviewRequests } = access;
  const shared = useScreenStyles();
  const styles = useStyles();
  const { colors } = useTheme();
  const [rows, setRows] = useState<StaffRequest[] | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [directoryState, setDirectoryState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [directoryRetry, setDirectoryRetry] = useState(0);
  const [selectedId, setSelected] = useState<string | null>(initialRequestId ?? null);
  const [deleteTarget, setDeleteTarget] = useState<StaffRequest | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const deleteLock = useRef(false);
  const toast = useToast();
  useEffect(() => watchRequests({ email, isAdmin, canReviewRequests }, setRows, () => setError(true)),
    [email, isAdmin, canReviewRequests, retry]);
  useEffect(() => {
    let active = true;
    loadRequestMembers(isAdmin).then(items => {
      if (active) {
        setMembers(items.sort((a, b) => a.name.localeCompare(b.name, 'vi')));
        setDirectoryState('ready');
      }
    }, () => { if (active) setDirectoryState('error'); });
    return () => { active = false; };
  }, [isAdmin, directoryRetry]);

  const memberName = (id: string) => id === email ? name : getMemberName(id, members);
  const selected = selectedId === 'new' ? 'new' : rows?.find(row => row.id === selectedId);

  const cancelDelete = () => { if (!deleteLock.current) setDeleteTarget(null); };
  async function confirmListDelete() {
    if (!deleteTarget || deleteLock.current) return;
    deleteLock.current = true;
    setDeleting(true);
    setDeleteError('');
    try {
      await changeRequest(deleteTarget, access, 'delete');
      setDeleteTarget(null);
      toast('Đã xóa đơn.');
    } catch (cause) {
      setDeleteError(cause instanceof Error && !('code' in cause) ? cause.message :
        'Không thể xóa đơn. Kiểm tra kết nối, quyền xử lý và thử lại.');
    } finally {
      deleteLock.current = false;
      setDeleting(false);
    }
  }

  return <>
    <PageHeader title="Đơn từ">
      {onBackToReview ? <Button label={backLabel} secondary onPress={onBackToReview} />
        : <Button label="+ Tạo đơn" onPress={() => setSelected('new')} />}
    </PageHeader>
    {(!initialRequestId || !selected) && <View style={shared.panel}>
      {error ? <>
        <Text accessibilityRole="alert" style={shared.error}>Không tải được danh sách đơn.</Text>
        <Button label="Tải lại" secondary onPress={() => { setError(false); setRetry(value => value + 1); }} />
      </> : rows === null ? <ActivityIndicator accessibilityLabel="Đang tải đơn từ" color={colors.accent} />
        : initialRequestId ? <Text style={shared.muted}>Không tìm thấy đơn hoặc bạn không còn quyền xem.</Text> : <>
        <View style={shared.choices}>
          <View style={styles.metric}>
            <Text style={shared.muted}>Đơn chờ duyệt</Text>
            <Text style={shared.cardTitle}>{rows.filter(row => row.status === pendingRequest).length}</Text>
          </View>
          <View style={styles.metric}>
            <Text style={shared.muted}>Đơn đã duyệt</Text>
            <Text style={shared.cardTitle}>{rows.filter(row => row.status === 'Đã duyệt').length}</Text>
          </View>
        </View>
        <Text style={shared.muted}>Đơn tạm ứng được duyệt sẽ tạo đề nghị chi trong Thu chi.</Text>
      </>}
    </View>}
    {!initialRequestId && !error && rows !== null && <View style={shared.stack}>
      {!rows.length && <Text style={shared.muted}>Chưa có đơn nào.</Text>}
      <PaginatedList items={rows}>
        {pageItems => pageItems.map(row => {
          const canDelete = canActOnRequest(row, 'delete', access);
          return <View key={row.id} style={shared.panel}>
            <Pressable testID={`request-${row.id}`} accessibilityRole="button"
              onPress={() => setSelected(row.id)} style={({ pressed }) => [styles.requestCard, canDelete && styles.deletable, pressed && shared.dimmed]}>
              <ClickableCardHeader trailing={<RequestStatus status={row.status} />}>
                <Text style={shared.cardTitle}>{row.type}</Text>
              </ClickableCardHeader>
              <Text style={[shared.muted, canDelete && styles.dateWithDelete]}><Text style={shared.metadataLabel}>Ngày tạo: </Text>{displayDate(row.createdAt)}</Text>
            </Pressable>
            {canDelete && <View style={styles.deleteRequest}>
              <DeleteIconButton label={`Xóa đơn ${row.type} ngày ${displayDate(row.createdAt)}`}
                onPress={() => { setDeleteError(''); setDeleteTarget(row); }} />
            </View>}
          </View>;
        })}
      </PaginatedList>
    </View>}
    {deleteTarget && <Modal visible transparent animationType="fade" onRequestClose={cancelDelete}>
      <ConfirmDialog label="Xác nhận xóa đơn" title="Xóa đơn?" message={requestDeleteMessage(deleteTarget)}
        action="Xác nhận xóa" pendingAction="Đang xóa…" pending={deleting} error={deleteError}
        onCancel={cancelDelete} onConfirm={() => void confirmListDelete()} />
    </Modal>}
    {selected && <RequestDialog row={selected === 'new' ? null : selected} access={access}
      tasks={tasks} tasksError={tasksError} onRetryTasks={onRetryTasks}
      members={members} memberName={memberName} directoryState={directoryState}
      retryDirectory={() => { setDirectoryState('loading'); setDirectoryRetry(value => value + 1); }}
      onClose={onBackToReview ?? (() => setSelected(null))} />}
  </>;
}

function RequestDialog({ row, access, members, memberName, directoryState, retryDirectory, onClose,
  tasks, tasksError, onRetryTasks }: RequestTasks & {
  row: StaffRequest | null; access: RequestAccess; members: Member[]; memberName: (email: string) => string;
  directoryState: 'loading' | 'ready' | 'error'; retryDirectory: () => void; onClose: () => void;
}) {
  const shared = useScreenStyles();
  const styles = useStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const today = todayInVietnam();
  const [type, setType] = useState(row?.type || requestTypes[0]);
  const [from, setFrom] = useState(row?.from || today);
  const [to, setTo] = useState(row?.to || row?.from || today);
  const [days, setDays] = useState(() => {
    if (row?.type === 'Đề xuất khác') return String(row.days ?? 1).replace('.', ',');
    const span = rangeDays(row?.from || today, row?.to || row?.from || today);
    return String(row?.days && Math.ceil(row.days) === span ? row.days : Math.max(1, span || 1)).replace('.', ',');
  });
  const [amount, setAmount] = useState(row?.amount ? String(row.amount) : '');
  const [month, setMonth] = useState(row?.month || today.slice(0, 7));
  const [monthPickerYear, setMonthPickerYear] = useState<number | null>(null);
  const [destination, setDestination] = useState(row?.trip?.destination ?? '');
  const [host, setHost] = useState(row?.trip?.host ?? '');
  const [cost, setCost] = useState(row?.trip?.estimatedCost ? String(row.trip.estimatedCost) : '');
  const [hours, setHours] = useState(row?.overtime?.hours.toString().replace('.', ',') ?? '');
  const [selectedTasks, setSelectedTasks] = useState(() => overtimeTasks(row?.overtime));
  const [reason, setReason] = useState(row?.reason || '');
  const [approver, setApprover] = useState(row?.approverEmail || '');
  const [reply, setReply] = useState('');
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const editable = !row || canActOnRequest(row, 'edit', access);
  const canRoute = !!row && canActOnRequest(row, 'route', access);
  const canDecide = !!row && canActOnRequest(row, 'approve', access);
  const advance = type === 'Tạm ứng lương';
  const trip = type === 'Công tác';
  const overtime = type === 'Làm thêm giờ';
  const range = type === 'Nghỉ phép' || trip;
  const eligibleTasks = (tasks ?? []).filter(item => item.assigneeEmail === access.email);
  const taskChoices = [
    ...eligibleTasks,
    ...selectedTasks.filter(item => !eligibleTasks.some(eligible => eligible.id === item.id)),
  ];
  const approvers = members.filter(member => member.canReview && member.email !== (row?.createdBy || access.email));

  function fields(): RequestFields {
    if (!reason.trim()) throw new Error(overtime ? 'Nhập lý do làm thêm giờ.' : 'Nhập lý do / nội dung đơn.');
    const duration = Number(days.replace(',', '.'));
    const money = Number(amount);
    if (!advance && !overtime && ((!validDuration(duration) && !(type === 'Đề xuất khác' && duration === 0)) ||
        (range && Math.ceil(duration) !== rangeDays(from, to)))) {
      throw new Error('Nhập số ngày hợp lệ theo bước 0,5 ngày.');
    }
    if (advance && (!Number.isSafeInteger(money) || money <= 0)) throw new Error('Nhập số tiền tạm ứng lớn hơn 0.');
    if (advance && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Nhập tháng lương theo dạng YYYY-MM.');
    const result: RequestFields = { type, reason: reason.trim(), from, to: overtime ? from : to,
      days: advance || overtime ? 0 : duration, amount: advance ? money : 0, month };
    if (trip) {
      if (!destination.trim()) throw new Error('Nhập địa điểm công tác.');
      result.trip = { destination: destination.trim(), host: host.trim(), estimatedCost: Number(cost) };
    }
    if (overtime) {
      const hoursText = hours.trim();
      const extraHours = Number(hoursText.replace(',', '.'));
      if (!/^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(hoursText) || extraHours <= 0 || extraHours > 24) {
        throw new Error('Nhập số giờ làm thêm lớn hơn 0 và tối đa 24 giờ.');
      }
      if (!selectedTasks.length) throw new Error('Chọn công việc phụ trách.');
      result.overtime = { hours: extraHours, tasks: selectedTasks };
    }
    return result;
  }

  function selectDate(field: 'from' | 'to', day: string) {
    const start = field === 'from' ? day : from;
    const end = overtime ? start : field === 'to' ? day : to < start ? start : to;
    setFrom(start);
    setTo(end);
    if (range) setDays(String(rangeDays(start, end)));
  }

  function changeDays(value: string) {
    if (!/^\d{0,3}([.,]\d?)?$/.test(value)) return;
    setDays(value);
    const duration = Number(value.replace(',', '.'));
    if (range && validDuration(duration)) setTo(shiftDay(from, Math.ceil(duration) - 1));
  }

  async function submit(action: RequestAction) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (action === 'reject' && !reply.trim()) throw new Error('Nhập lý do từ chối.');
      if (action === 'route' && !approvers.some(member => member.email === approver)) {
        throw new Error('Chọn người có quyền duyệt đơn.');
      }
      if (!row) await createRequest(fields(), approver, access.email);
      else await changeRequest(row, access, action, {
        fields: action === 'edit' ? fields() : undefined,
        value: action === 'route' ? approver : reply.trim(), creatorName: memberName(row.createdBy),
      });
      const messages = { edit: row ? 'Đã lưu đơn.' : 'Đã tạo đơn.', route: 'Đã lưu người duyệt.',
        approve: row?.type === 'Tạm ứng lương' ? 'Đã duyệt đơn và tạo đề nghị chi.' : 'Đã duyệt đơn.',
        reject: 'Đã từ chối đơn.', delete: 'Đã xóa đơn.' };
      toast(messages[action]);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error && !('code' in cause) ? cause.message :
        'Không thể lưu thay đổi. Kiểm tra kết nối, quyền xử lý và thử lại.');
    } finally {
      setBusy(false);
    }
  }

  function input(label: string, value: string, onChangeText: (value: string) => void,
    options: Pick<TextInputProps, 'keyboardType' | 'inputMode' | 'multiline' | 'maxLength' | 'placeholder'> &
      { required?: boolean; requiredFor?: string }) {
    const { required, requiredFor, ...inputOptions } = options;
    return <View style={styles.field}>
      <FieldLabel style={shared.label} required={required || !!requiredFor}>
        {requiredFor ? `${label} (${requiredFor})` : label}
      </FieldLabel>
      <TextInput accessibilityLabel={label} style={[shared.input, inputOptions.multiline && shared.messageInput]}
        placeholderTextColor={colors.muted} editable={!busy} value={value} onChangeText={onChangeText} {...inputOptions} />
    </View>;
  }

  function dateField(field: 'from' | 'to', label: string, value: string) {
    return <View style={styles.dateRow}>
      <FieldLabel style={[shared.label, styles.dateLabel]} required={range || overtime}>{label}</FieldLabel>
      <DateCalendarButton label={label} value={value} min={field === 'to' ? from : undefined}
        disabled={busy} style={styles.dropdown} onChange={day => selectDate(field, day)} />
    </View>;
  }

  const cancelDelete = () => {
    setError('');
    setConfirmDelete(false);
  };

  return <Modal visible transparent animationType="fade" onRequestClose={() => {
    if (confirmDelete && !busy) cancelDelete();
    else if (!busy) onClose();
  }}>
    <SafeAreaView style={styles.modal}>
      <View role="dialog" accessibilityLabel={row ? 'Chi tiết đơn' : 'Tạo đơn'} accessibilityViewIsModal={!confirmDelete}
        aria-hidden={confirmDelete} importantForAccessibility={confirmDelete ? 'no-hide-descendants' : 'auto'}
        style={[styles.popup, { width: Math.min(560, width - insets.left - insets.right - 32) }]}>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.popupContent}>
            <View style={shared.listHeader}>
              <Text accessibilityRole="header" style={[shared.heading, shared.listHeading]}>{row ? 'Chi tiết đơn' : 'Tạo đơn'}</Text>
              <PopupCloseButton label="Đóng đơn" onPress={onClose} disabled={busy} />
            </View>
            {row && <>
              <RequestStatus status={row.status} />
              {!!row.decidedBy && <Text style={shared.muted}>Người xử lý · {memberName(row.decidedBy)} · {displayDate(row.decidedAt)}</Text>}
            </>}
            {editable ? <>
              <View style={styles.dateRow}>
                <FieldLabel style={[shared.label, styles.dateLabel]} required>Loại đơn</FieldLabel>
                <Dropdown label="Loại đơn" hideLabel highlightSelection={false} style={styles.dropdown} value={type} choices={requestTypeChoices}
                  disabled={busy} onChange={item => {
                    if (item !== type && (item === 'Nghỉ phép' || item === 'Công tác')) setDays(String(rangeDays(from, to)));
                    setType(item);
                  }} />
              </View>
              {advance ? <>
                {input('Số tiền tạm ứng (VND)', groupDigits(amount), value => setAmount(digitsOnly(value)),
                  { keyboardType: 'number-pad', maxLength: 24, required: true })}
                <FieldLabel style={shared.label} required>Trừ vào lương tháng</FieldLabel>
                <Pressable accessibilityRole="button" accessibilityLabel={`Đổi tháng năm, ${displayMonth(month)}`}
                  aria-expanded={monthPickerYear !== null} disabled={busy} style={[shared.input, styles.picker]}
                  onPress={() => {
                    if (Keyboard.isVisible()) Keyboard.dismiss();
                    setMonthPickerYear(Number(month.slice(0, 4)));
                  }}>
                  <Text style={shared.label}>{displayMonth(month)}</Text><Text aria-hidden style={styles.pickerIcon}>▦</Text>
                </Pressable>
              </> : <>
                {dateField('from', overtime ? 'Ngày' : 'Từ ngày', from)}
                {overtime ? <>
                  {input('Số giờ làm thêm', hours, setHours, { inputMode: 'decimal', placeholder: 'Ví dụ: 2,5', maxLength: 12, required: true })}
                  <FieldLabel style={shared.label} required>Công việc phụ trách · Đã chọn {selectedTasks.length}</FieldLabel>
                  {tasksError ? <Button label="Tải lại công việc" secondary disabled={busy} onPress={onRetryTasks} />
                    : tasks === null && <ActivityIndicator accessibilityLabel="Đang tải công việc" color={colors.accent} />}
                  {(tasks !== null || taskChoices.length > 0) && <SearchableChoiceList
                    showAvatar={false}
                    label="Tìm công việc phụ trách" items={taskChoices.map(item => ({ id: item.id, name: item.title }))}
                    selected={selectedTasks.map(item => item.id)} disabled={busy} emptyMessage="Không có công việc phù hợp."
                    onToggle={id => {
                      if (selectedTasks.some(item => item.id === id)) {
                        setSelectedTasks(current => current.filter(item => item.id !== id));
                        return;
                      }
                      if (selectedTasks.length >= overtimeTaskLimit) {
                        setError(`Chọn tối đa ${overtimeTaskLimit} công việc cho một đơn.`);
                        return;
                      }
                      const item = eligibleTasks.find(task => task.id === id);
                      if (item) setSelectedTasks(current => [...current, { id: item.id, title: item.title }]);
                    }} />}
                </> : <>
                  {dateField('to', 'Đến ngày', to)}
                  {input('Số ngày', days, changeDays, { keyboardType: 'numeric', maxLength: 5, required: type !== 'Đề xuất khác' })}
                </>}
                {trip && <>
                  {input('Địa điểm công tác', destination, setDestination, { maxLength: 250, required: true })}
                  {input('Đơn vị làm việc', host, setHost, { maxLength: 250 })}
                  {input('Chi phí dự kiến (VND)', groupDigits(cost), value => setCost(digitsOnly(value)),
                    { keyboardType: 'number-pad', maxLength: 24 })}
                </>}
              </>}
              {input(overtime ? 'Lý do làm thêm giờ' : trip ? 'Mục đích / nội dung công tác' : 'Lý do / nội dung',
                reason, setReason, { multiline: true, maxLength: 2000, required: true })}
            </> : row && <>
              <Text style={shared.cardTitle}>{row.type}</Text>
              <Text style={shared.body}>{row.reason}</Text>
              <Text style={shared.label}>{requestPeriod(row)}</Text>
              {advance && !!row.month && <Text style={shared.muted}>Trừ vào lương tháng {displayMonth(row.month)}</Text>}
              {trip && row.trip && <>
                <Text style={shared.muted}>Địa điểm công tác · {row.trip.destination}</Text>
                {!!row.trip.host && <Text style={shared.muted}>Đơn vị làm việc · {row.trip.host}</Text>}
                {row.trip.estimatedCost > 0 && <Text style={shared.muted}>Chi phí dự kiến · {vnd.format(row.trip.estimatedCost)}</Text>}
              </>}
              {overtime && row.overtime && <View style={styles.field}>
                <Text style={shared.label}>Công việc phụ trách</Text>
                {overtimeTasks(row.overtime).map(item => <Text key={item.id} style={shared.muted}>{item.title}</Text>)}
              </View>}
            </>}
            <View style={shared.detailRow}>
              <FieldLabel style={shared.label} required={canRoute}>Người duyệt</FieldLabel>
              {!row || canRoute ? <>
                {!!approver && (directoryState !== 'ready' || !approvers.some(member => member.email === approver)) &&
                  <Text style={shared.muted}>{getMemberName(approver, members)}</Text>}
                {directoryState === 'loading' && <ActivityIndicator accessibilityLabel="Đang tải người duyệt" color={colors.accent} />}
                {directoryState === 'error' && <Button label="Tải lại danh sách người duyệt" secondary disabled={busy} onPress={retryDirectory} />}
                {directoryState === 'ready' && <SearchableChoiceDropdown title="Người duyệt" label="Tìm người duyệt"
                  items={approvers.map(member => ({ id: member.email, name: member.name }))}
                  selected={approver ? [approver] : []} onToggle={id => setApprover(id === approver ? '' : id)}
                  disabled={busy} emptyMessage="Không có người duyệt phù hợp." />}
                {canRoute && <Button label="Lưu người duyệt" secondary disabled={busy || !approver || approver === row?.approverEmail}
                  onPress={() => void submit('route')} />}
              </> : <Text style={shared.muted}>{getMemberName(approver, members)}</Text>}
            </View>
            {row?.reply ? <Text style={shared.body}>Ý kiến người duyệt · {row.reply}</Text> : null}
            {error && !confirmDelete && <Text accessibilityRole="alert" style={shared.error}>{error}</Text>}
            {canDecide && <>
              {input('Ý kiến xử lý', reply, setReply, { maxLength: 500, multiline: true, requiredFor: 'khi từ chối' })}
              <View style={shared.choices}>
                <Button label="Duyệt" disabled={busy} onPress={() => void submit('approve')} />
                <Button label="Từ chối" secondary disabled={busy} onPress={() => void submit('reject')} />
              </View>
            </>}
            {editable && <Button label={row ? 'Lưu đơn' : 'Gửi đơn'} disabled={busy} onPress={() => void submit('edit')} />}
            {row && canActOnRequest(row, 'delete', access) && <Button label="Xóa đơn" secondary disabled={busy}
              onPress={() => { setError(''); setConfirmDelete(true); }} />}
            {busy && !confirmDelete && <ActivityIndicator accessibilityLabel="Đang lưu đơn" color={colors.accent} />}
          </View>
        </ScrollView>
      </View>
      {monthPickerYear !== null && <CalendarDialog title="Trừ vào lương tháng" onClose={() => setMonthPickerYear(null)}>
        <View style={shared.listHeader}>
          <Button label="Năm trước" secondary disabled={busy || monthPickerYear <= 1} onPress={() => setMonthPickerYear(monthPickerYear - 1)} />
          <Text accessibilityLiveRegion="polite" style={shared.label}>{monthPickerYear}</Text>
          <Button label="Năm sau" secondary disabled={busy || monthPickerYear >= 9999} onPress={() => setMonthPickerYear(monthPickerYear + 1)} />
        </View>
        <View style={shared.choices}>
          {months.map(item => {
            const value = String(monthPickerYear).padStart(4, '0') + '-' + item;
            return <Pressable key={item} accessibilityRole="button" accessibilityLabel={`Tháng ${item}`}
              accessibilityState={{ selected: value === month }} style={[shared.choice, value === month && shared.selected]}
              disabled={busy} onPress={() => { setMonth(value); setMonthPickerYear(null); }}>
              <Text style={shared.label}>{item}</Text>
            </Pressable>;
          })}
        </View>
      </CalendarDialog>}
      {confirmDelete && row && <ConfirmDialog label="Xác nhận xóa đơn" title="Xóa đơn?"
        message={requestDeleteMessage(row)} action="Xác nhận xóa" pendingAction="Đang xóa…"
        pending={busy} error={error} onCancel={cancelDelete} onConfirm={() => void submit('delete')} />}
    </SafeAreaView>
  </Modal>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  modal: { flex: 1, backgroundColor: '#17102588', justifyContent: 'center', alignItems: 'center', padding: 16 },
  popup: { maxHeight: '92%', borderRadius: 18, overflow: 'hidden', backgroundColor: colors.paper,
    borderWidth: 1, borderColor: colors.line },
  popupContent: { gap: 14, padding: 20 },
  field: { gap: 6 },
  requestCard: { gap: 4 },
  deletable: { minHeight: 58 },
  dateWithDelete: { paddingRight: 48 },
  deleteRequest: { position: 'absolute', right: 4, bottom: 6 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dateLabel: { width: 76 },
  dropdown: { flex: 1 },
  picker: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  pickerIcon: { color: colors.accent, fontSize: 20 },
  metric: { flexGrow: 1, flexBasis: 130, gap: 4, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12 },
  pending: { color: colors.warning, backgroundColor: colors.warningSoft },
  approved: { color: colors.success, backgroundColor: colors.successSoft },
  rejected: { color: colors.danger, backgroundColor: colors.dangerSoft },
}));
