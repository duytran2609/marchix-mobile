import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/Button';
import { PopupCloseButton } from '../components/PopupCloseButton';
import { useToast } from '../components/Toast';
import { displayDate, vnd } from '../features/cash/cash';
import {
  canActOnRequest, changeRequest, createRequest, loadRequestMembers, pendingRequest, requestTypes, watchRequests,
} from '../features/requests/requests';
import type { RequestAccess, RequestAction, RequestFields, StaffRequest } from '../features/requests/requests';
import { AssignmentCalendar } from '../features/tasks/AssignmentCalendar';
import { todayInVietnam } from '../features/tasks/taskDates';
import { useScreenStyles } from '../theme/screenStyles';
import { createThemedStyles, useTheme } from '../theme/theme';

type Member = Awaited<ReturnType<typeof loadRequestMembers>>[number];
const getMemberName = (email: string | undefined, members: Member[]) =>
  members.find(member => member.email === email)?.name || email || 'Chưa chỉ định';

function requestPeriod(row: StaffRequest) {
  if (row.type === 'Tạm ứng lương') return vnd.format(row.amount || 0);
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

export function RequestsScreen({ name, ...access }: RequestAccess & { name: string }) {
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
  const [selected, setSelected] = useState<StaffRequest | 'new' | null>(null);
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

  const today = todayInVietnam();
  const year = today.slice(0, 4);
  const leave = (rows ?? []).filter(row => row.type === 'Nghỉ phép' && row.status === 'Đã duyệt');
  const away = leave.filter(row => row.from && row.from <= today && (row.to || row.from) >= today);
  const daysUsed = leave.filter(row => row.createdBy === email && row.from?.startsWith(year))
    .reduce((total, row) => total + (Number(row.days) || 0), 0);
  const memberName = (id: string) => id === email ? name : getMemberName(id, members);

  return <>
    <PageHeader title="Đơn từ">
      <Button label="+ Tạo đơn" onPress={() => setSelected('new')} />
    </PageHeader>
    <View style={shared.panel}>
      {error ? <>
        <Text accessibilityRole="alert" style={shared.error}>Không tải được danh sách đơn.</Text>
        <Button label="Tải lại" secondary onPress={() => { setError(false); setRetry(value => value + 1); }} />
      </> : rows === null ? <ActivityIndicator accessibilityLabel="Đang tải đơn từ" color={colors.accent} /> : <>
        <View style={shared.choices}>
          <View style={styles.metric}>
            <Text style={shared.muted}>Đơn chờ duyệt</Text>
            <Text style={shared.cardTitle}>{rows.filter(row => row.status === pendingRequest).length}</Text>
          </View>
          <View style={styles.metric}>
            <Text style={shared.muted}>Hôm nay nghỉ</Text>
            <Text style={shared.cardTitle}>{away.length}</Text>
            {away.length > 0 && <Text style={shared.muted}>{away.map(row => memberName(row.createdBy)).join(', ')}</Text>}
          </View>
          {!isAdmin && <View style={styles.metric}>
            <Text style={shared.muted}>Đã nghỉ phép năm {year}</Text>
            <Text style={shared.cardTitle}>{daysUsed} ngày</Text>
          </View>}
        </View>
        <Text style={shared.muted}>Đơn tạm ứng được duyệt sẽ tạo đề nghị chi trong Thu chi.</Text>
      </>}
    </View>
    {!error && rows !== null && <View style={shared.stack}>
      {!rows.length && <Text style={shared.muted}>Chưa có đơn nào.</Text>}
      {rows.map(row => <Pressable key={row.id} accessibilityRole="button"
        onPress={() => setSelected(row)} style={({ pressed }) => [shared.panel, pressed && shared.dimmed]}>
        <View style={shared.listHeader}>
          <Text style={[shared.cardTitle, shared.listHeading]}>{row.type}</Text>
          <RequestStatus status={row.status} />
        </View>
        <Text style={shared.muted}>{memberName(row.createdBy)} · {displayDate(row.createdAt)}</Text>
        <Text style={shared.body} numberOfLines={3}>{row.reason}</Text>
        <Text style={shared.label}>{requestPeriod(row)}</Text>
      </Pressable>)}
    </View>}
    {selected && <RequestDialog row={selected === 'new' ? null : selected} access={access}
      members={members} memberName={memberName} directoryState={directoryState}
      retryDirectory={() => { setDirectoryState('loading'); setDirectoryRetry(value => value + 1); }}
      onClose={() => setSelected(null)} />}
  </>;
}

function RequestDialog({ row, access, members, memberName, directoryState, retryDirectory, onClose }: {
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
  const [days, setDays] = useState(String(row?.days ?? 1));
  const [amount, setAmount] = useState(row?.amount ? String(row.amount) : '');
  const [month, setMonth] = useState(row?.month || today.slice(0, 7));
  const [reason, setReason] = useState(row?.reason || '');
  const [approver, setApprover] = useState(row?.approverEmail || '');
  const [reply, setReply] = useState('');
  const [calendar, setCalendar] = useState<'from' | 'to' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const editable = !row || canActOnRequest(row, 'edit', access);
  const canRoute = !!row && canActOnRequest(row, 'route', access);
  const canDecide = !!row && canActOnRequest(row, 'approve', access);
  const advance = type === 'Tạm ứng lương';
  const approvers = members.filter(member => member.canReview && member.email !== (row?.createdBy || access.email));

  function fields(): RequestFields {
    if (!reason.trim()) throw new Error('Nhập lý do / nội dung đơn.');
    const duration = Number(days.replace(',', '.'));
    const money = Number(amount);
    if (!advance && (!Number.isFinite(duration) || duration < 0 || duration > 366 || duration % 0.5 !== 0 ||
        (type === 'Nghỉ phép' && duration === 0))) {
      throw new Error('Nhập số ngày hợp lệ theo bước 0,5 ngày.');
    }
    if (advance && (!Number.isSafeInteger(money) || money <= 0)) throw new Error('Nhập số tiền tạm ứng lớn hơn 0.');
    if (advance && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Nhập tháng lương theo dạng YYYY-MM.');
    return { type, reason: reason.trim(), from, to, days: advance ? 0 : duration, amount: advance ? money : 0, month };
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
    options: { keyboardType?: 'numeric' | 'number-pad'; multiline?: boolean; maxLength: number; placeholder?: string }) {
    return <View style={styles.field}>
      <Text style={shared.label}>{label}</Text>
      <TextInput accessibilityLabel={label} style={[shared.input, options.multiline && shared.messageInput]}
        placeholderTextColor={colors.muted} editable={!busy} value={value} onChangeText={onChangeText} {...options} />
    </View>;
  }

  return <Modal visible animationType="fade" onRequestClose={() => { if (!busy) onClose(); }}>
    <SafeAreaView style={styles.modal}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={shared.scroll}>
        <View style={shared.page}>
          <View style={shared.panel}>
            <View style={shared.listHeader}>
              <Text accessibilityRole="header" style={[shared.heading, shared.listHeading]}>{row ? 'Chi tiết đơn' : 'Tạo đơn'}</Text>
              <PopupCloseButton label="Đóng đơn" onPress={onClose} disabled={busy} />
            </View>
            {row && <>
              <RequestStatus status={row.status} />
              <Text style={shared.muted}>Người tạo · {memberName(row.createdBy)} · {displayDate(row.createdAt)}</Text>
              {!!row.decidedBy && <Text style={shared.muted}>Người xử lý · {memberName(row.decidedBy)} · {displayDate(row.decidedAt)}</Text>}
            </>}
            {editable ? <>
              <Text style={shared.label}>Loại đơn</Text>
              <View style={shared.choices}>
                {requestTypes.map(item => <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: item === type }}
                  disabled={busy} style={[shared.choice, item === type && shared.selected]}
                  onPress={() => { setType(item); setCalendar(null); }}><Text style={shared.label}>{item}</Text></Pressable>)}
              </View>
              {advance ? <>
                {input('Số tiền tạm ứng (VND)', amount, value => setAmount(value.replace(/\D/g, '')),
                  { keyboardType: 'number-pad', maxLength: 15 })}
                {input('Trừ vào lương tháng', month, setMonth, { maxLength: 7, placeholder: 'YYYY-MM' })}
              </> : <>
                <View style={shared.choices}>
                  <Button label={`Từ ngày ${displayDate(from)}`} secondary disabled={busy} onPress={() => setCalendar(calendar === 'from' ? null : 'from')} />
                  <Button label={`Đến ngày ${displayDate(to)}`} secondary disabled={busy} onPress={() => setCalendar(calendar === 'to' ? null : 'to')} />
                </View>
                {calendar && <AssignmentCalendar key={calendar} initialDay={calendar === 'from' ? from : to}
                  value={calendar === 'from' ? from : to} min={calendar === 'to' ? from : undefined} disabled={busy}
                  onSelect={day => {
                    if (calendar === 'from') { setFrom(day); if (day > to) setTo(day); }
                    else setTo(day);
                    setCalendar(null);
                  }} />}
                {input('Số ngày', days, setDays, { keyboardType: 'numeric', maxLength: 6 })}
              </>}
              {input('Lý do / nội dung', reason, setReason, { multiline: true, maxLength: 2000 })}
            </> : row && <>
              <Text style={shared.cardTitle}>{row.type}</Text>
              <Text style={shared.body}>{row.reason}</Text>
              <Text style={shared.label}>{requestPeriod(row)}</Text>
              {advance && !!row.month && <Text style={shared.muted}>Trừ vào lương tháng {row.month}</Text>}
            </>}
            <View style={shared.detailRow}>
              <Text style={shared.label}>Người duyệt</Text>
              <Text style={shared.muted}>{getMemberName(row?.approverEmail || approver, members)}</Text>
            </View>
            {(!row || canRoute) && <>
              {directoryState === 'loading' && <ActivityIndicator accessibilityLabel="Đang tải người duyệt" color={colors.accent} />}
              {directoryState === 'error' && <Button label="Tải lại danh sách người duyệt" secondary disabled={busy} onPress={retryDirectory} />}
              {directoryState === 'ready' && approvers.length === 0 && <Text style={shared.muted}>Chưa có người duyệt phù hợp.</Text>}
              <View style={shared.choices}>
                {!row && !!approver && <Button label="Bỏ chọn người duyệt" secondary disabled={busy} onPress={() => setApprover('')} />}
                {approvers.map(member => <Pressable key={member.email} accessibilityRole="button"
                  accessibilityState={{ selected: approver === member.email }} disabled={busy}
                  style={[shared.choice, approver === member.email && shared.selected]} onPress={() => setApprover(member.email)}>
                  <Text style={shared.label}>{member.name}</Text>
                </Pressable>)}
              </View>
              {canRoute && <Button label="Lưu người duyệt" secondary disabled={busy || !approver || approver === row?.approverEmail}
                onPress={() => void submit('route')} />}
            </>}
            {row?.reply ? <Text style={shared.body}>Ý kiến người duyệt · {row.reply}</Text> : null}
            {error && <Text accessibilityRole="alert" style={shared.error}>{error}</Text>}
            {canDecide && <>
              {input('Ý kiến xử lý', reply, setReply, { maxLength: 500, multiline: true })}
              <View style={shared.choices}>
                <Button label="Duyệt" disabled={busy} onPress={() => void submit('approve')} />
                <Button label="Từ chối" secondary disabled={busy} onPress={() => void submit('reject')} />
              </View>
            </>}
            {editable && <Button label={row ? 'Lưu đơn' : 'Gửi đơn'} disabled={busy} onPress={() => void submit('edit')} />}
            {row && canActOnRequest(row, 'delete', access) && (confirmDelete ? <>
              <Text style={shared.body}>Xóa vĩnh viễn đơn này?</Text>
              <View style={shared.choices}>
                <Button label="Xác nhận xóa" disabled={busy} onPress={() => void submit('delete')} />
                <Button label="Hủy" secondary disabled={busy} onPress={() => setConfirmDelete(false)} />
              </View>
            </> : <Button label="Xóa đơn" secondary disabled={busy} onPress={() => setConfirmDelete(true)} />)}
            {busy && <ActivityIndicator accessibilityLabel="Đang lưu đơn" color={colors.accent} />}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  modal: { flex: 1, backgroundColor: colors.background },
  field: { gap: 6 },
  metric: { flexGrow: 1, flexBasis: 130, gap: 4, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12 },
  pending: { color: colors.warning, backgroundColor: colors.warningSoft },
  approved: { color: colors.success, backgroundColor: colors.successSoft },
  rejected: { color: colors.danger, backgroundColor: colors.dangerSoft },
}));
