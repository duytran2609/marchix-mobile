import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { PageHeader } from '../components/PageHeader';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Dropdown } from '../components/Dropdown';
import { Button } from '../components/Button';
import { FieldLabel } from '../components/FieldLabel';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DeleteIconButton } from '../components/DeleteIconButton';
import { PopupCloseButton } from '../components/PopupCloseButton';
import { ToastLayer, useToast } from '../components/Toast';
import { approvedOvertimeByDay, attendanceId, attendanceMonth, calculateAttendance, clock, dateKey, dayWeight, machineTime, offsetMonth } from '../features/attendance/attendance';
import { CompanyAttendanceTable, PersonalAttendanceTable } from '../features/attendance/AttendanceTable';
import { showAttendanceDate } from '../features/attendance/attendanceTableData';
import type { AttendanceEditTarget } from '../features/attendance/attendanceTableData';
import { exportAttendance } from '../features/attendance/exportAttendance';
import { punch, removeAttendance, saveAdjustment, saveAttendanceNote, watchAttendance, watchAttendanceNotes } from '../features/attendance/attendanceStore';
import type { AttendanceData, AttendanceMember } from '../features/attendance/attendanceStore';
import { useScreenStyles } from '../theme/screenStyles';
import { createThemedStyles, useTheme } from '../theme/theme';

const isTime = (value: string) => !value || /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

export function AttendanceScreen({ email, name, isAdmin }: AttendanceMember & { isAdmin: boolean }) {
  const ui = useScreenStyles();
  const styles = useStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const [now, setNow] = useState(() => new Date());
  const [month, setMonth] = useState('');
  const [data, setData] = useState<AttendanceData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [punching, setPunching] = useState(false);
  const [punchError, setPunchError] = useState('');
  const [edit, setEdit] = useState<AttendanceEditTarget | null>(null);
  const [exporting, setExporting] = useState(false);
  const [noteData, setNoteData] = useState<{ email: string; notes?: ReadonlyMap<string, string> }>();
  const punchLock = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => watchAttendance(email, isAdmin, setData, () => setLoadError(true)), [email, isAdmin, retry]);
  useEffect(() => {
    if (isAdmin) return;
    return watchAttendanceNotes(email, notes => setNoteData({ email, notes }), () => setNoteData({ email }));
  }, [email, isAdmin, retry]);

  const today = dateKey(now);
  const currentMonth = today.slice(0, 7);
  const selectedMonth = month || currentMonth;
  const records = useMemo(() => new Map(data?.records.map(row => [row.id, row])), [data?.records]);

  if (loadError || !data) return <>
    <PageHeader title="Chấm công" />
    {loadError ? <View style={ui.panel}>
      <Text accessibilityRole="alert" style={ui.error}>Không tải được dữ liệu chấm công. Kiểm tra kết nối hoặc quyền truy cập.</Text>
      <Button label="Thử lại" onPress={() => { setData(null); setLoadError(false); setRetry(value => value + 1); }} />
    </View> : <ActivityIndicator color={colors.accent} accessibilityLabel="Đang tải chấm công" />}
  </>;

  const { schedule, people, requests } = data;
  const todayRecord = records.get(attendanceId(email, today));
  const todayResult = todayRecord ? calculateAttendance(todayRecord, schedule, today) : null;
  const todayWorked = (todayResult?.worked ?? 0) + (approvedOvertimeByDay(email, requests).get(today) ?? 0);
  const completedToday = todayResult && todayResult.entered !== null && todayResult.exited !== null;
  const weight = dayWeight(today, schedule);
  const trackingStart = schedule.attStart || data.records.reduce((first, row) =>
    row.date && row.date < first ? row.date : first, today);
  const firstMonth = [offsetMonth(currentMonth, -1), trackingStart.slice(0, 7)].sort()[0];
  const monthFor = (employee: string) => attendanceMonth(employee, selectedMonth, today, schedule, records, requests, trackingStart);
  const detail = isAdmin ? null : monthFor(email);
  const companyRows = isAdmin ? people.map(member => ({ member, month: monthFor(member.email) })) : [];
  const personalDays = detail?.days ?? [];
  const dailyNotes = noteData?.email === email ? noteData.notes : undefined;

  async function downloadAttendance() {
    setExporting(true);
    try {
      await exportAttendance(selectedMonth, isAdmin ? { company: companyRows } : { personal: personalDays, name, dailyNotes });
    } catch {
      toast('Không xuất được bảng công. Vui lòng thử lại.', 'error');
    } finally {
      setExporting(false);
    }
  }

  async function handlePunch() {
    if (punchLock.current || completedToday) return;
    if (dateKey(new Date()) !== today) {
      setNow(new Date());
      setPunchError('Ngày đã thay đổi. Hãy kiểm tra ca mới rồi chấm công.');
      return;
    }
    punchLock.current = true;
    setPunching(true);
    setPunchError('');
    try {
      await punch({ email, name }, today, !!todayRecord, schedule, isAdmin);
      toast(todayRecord ? 'Đã ghi nhận giờ ra.' : 'Đã ghi nhận giờ vào.');
    } catch (error) {
      setPunchError(error instanceof Error && error.name === 'Error' ? error.message :
        'Không chấm công được. Kiểm tra kết nối hoặc quyền truy cập rồi thử lại.');
    } finally {
      punchLock.current = false;
      setPunching(false);
    }
  }

  return <>
    <PageHeader title="Chấm công" />
    <View style={ui.panel}>
      <AttendanceClock />
      <View style={styles.scheduleDetails}>
        <Text style={styles.scheduleText}>
          <Text style={styles.scheduleLabel}>Ngày: </Text>{showAttendanceDate(today)}/{today.slice(0, 4)}
        </Text>
        <Text style={styles.scheduleText}>
          <Text style={styles.scheduleLabel}>Ca làm việc: </Text>
          {weight === 0 ? 'Ngày nghỉ' : `${schedule.shiftIn}–${weight === 0.5 ? schedule.lunchFrom + ' (Nửa ngày)' : schedule.shiftOut}`}
        </Text>
      </View>
      {schedule.gpsOn && <Text style={styles.scheduleText}>Chấm công theo vị trí văn phòng</Text>}
      {(todayResult || todayWorked > 0) && <>
        <View style={styles.metrics}>
          {todayResult && <>
            <Metric label="Vào" value={clock(todayResult.entered)} alertDetail detail={todayResult.late ? 'Muộn ' + todayResult.late + ' phút' : undefined} />
            <Metric label="Ra" value={clock(todayResult.exited)} alertDetail detail={todayResult.early ? 'Sớm ' + todayResult.early + ' phút' : undefined} />
          </>}
          <Metric label="Giờ làm" value={todayWorked ? `${Math.floor(todayWorked / 60)} tiếng ${todayWorked % 60} phút` : '–'} />
          {todayResult && <Metric label="Công" value={todayResult.flag === 'Đang làm' ? '…' : String(todayResult.work)} />}
        </View>
        {!completedToday && !!todayResult?.flag && <Text style={ui.muted}>{todayResult.flag}</Text>}
      </>}
      {completedToday && !punching && <View style={styles.completedNotice}>
        <Text accessibilityLiveRegion="polite" style={styles.completedText}>Đã chấm công cho ngày hôm nay.</Text>
      </View>}
      {punchError !== '' && <Text accessibilityRole="alert" style={ui.error}>{punchError}</Text>}
      {!completedToday && <Button disabled={punching} onPress={() => void handlePunch()}
        label={punching ? 'Đang chấm công…' : !todayRecord ? 'Chấm công vào' : 'Chấm công ra'} />}
      {!isAdmin && dailyNotes && <DailyNoteEditor key={attendanceId(email, today)}
        email={email} date={today} savedNote={dailyNotes.get(today) ?? ''} />}
      {!isAdmin && noteData?.email === email && !dailyNotes && <>
        <Text style={ui.error}>Không tải được ghi chú chấm công.</Text>
        <TableAction label="Tải lại ghi chú" onPress={() => setRetry(value => value + 1)} />
      </>}
    </View>
    <View style={[ui.panel, isAdmin && styles.companyPanel]}>
      <View style={styles.tableHeader}>
        <Text accessibilityRole="header" style={ui.cardTitle}>{isAdmin ? 'Bảng chấm công toàn công ty' : 'Bảng công của bạn'}</Text>
        <View style={styles.monthActions}>
          <AttendanceMonthPicker first={firstMonth} current={currentMonth} selected={selectedMonth} onSelect={setMonth} />
          <TableAction label={exporting ? 'Đang xuất…' : 'Xuất Excel'} disabled={exporting || (isAdmin ? !companyRows.length : !personalDays.length)}
            onPress={() => void downloadAttendance()} />
        </View>
      </View>
      {isAdmin && <CompanyAttendanceTable rows={companyRows} onEdit={setEdit} />}
      {detail && <>
        <View style={styles.metrics}>
          <Metric label="Công thực tế" value={String(detail.summary.work)} inlineDetail={' / ' + detail.summary.standard + ' công chuẩn'} />
          <Metric label="Phép / công tác" value={String(detail.summary.leave)} />
          <Metric label="Đi muộn" value={detail.summary.late + ' lần'} alertDetail={detail.summary.late > 0} detail={detail.summary.lateMinutes + ' phút'} />
          <View style={[styles.metric, styles.missedPunches]}>
            <Text style={ui.muted}>Quên chấm vào <Text style={ui.cardTitle}>{detail.summary.forgottenIn}</Text></Text>
            <Text style={ui.muted}>Quên chấm ra <Text style={ui.cardTitle}>{detail.summary.forgottenOut}</Text></Text>
          </View>
        </View>
        <PersonalAttendanceTable days={personalDays} dailyNotes={dailyNotes} />
      </>}
    </View>
    {isAdmin && edit && <AdjustmentEditor target={edit} email={email} onClose={() => setEdit(null)} />}
  </>;
}

function AttendanceClock() {
  const styles = useStyles();
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = String(time.getSeconds()).padStart(2, '0');
  return <Text style={styles.clock}>{clock(time.getHours() * 60 + time.getMinutes())}:{seconds}</Text>;
}

function DailyNoteEditor({ email, date, savedNote }: { email: string; date: string; savedNote: string }) {
  const ui = useScreenStyles();
  const styles = useStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const text = (draft ?? savedNote).trim();

  async function save() {
    if (saveLock.current || text === savedNote) return;
    saveLock.current = true;
    setSaving(true);
    try {
      await saveAttendanceNote(email, date, text);
      setDraft(null);
      toast(text ? 'Đã lưu ghi chú hôm nay.' : 'Đã xóa ghi chú hôm nay.');
    } catch (error) {
      toast(error instanceof Error && error.name === 'Error' ? error.message : 'Không lưu được ghi chú. Vui lòng thử lại.', 'error');
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  return <>
    <Text style={ui.label}>Ghi chú</Text>
    <TextInput accessibilityLabel="Ghi chú hôm nay" value={draft ?? savedNote} onChangeText={setDraft} editable={!saving}
      multiline numberOfLines={3} maxLength={1000} placeholder="Nhập ghi chú cho hôm nay"
      placeholderTextColor={colors.muted + 'C9'} style={[ui.input, styles.noteInput]} />
    <Button label={saving ? 'Đang lưu…' : 'Lưu ghi chú'} disabled={saving || text === savedNote}
      style={styles.saveNoteAction} onPress={() => void save()} />
  </>;
}

const formatMonth = (month: string) => 'Tháng ' + month.slice(5) + '/' + month.slice(0, 4);

function AttendanceMonthPicker({ first, current, selected, onSelect }: {
  first: string; current: string; selected: string; onSelect: (month: string) => void;
}) {
  const styles = useStyles();
  const options = useMemo(() => {
    const monthIndex = (value: string) => Number(value.slice(0, 4)) * 12 + Number(value.slice(5)) - 1;
    const last = monthIndex(current);
    const start = monthIndex(first);
    const count = Number.isInteger(start) && start >= 1200 ? Math.max(1, last - start + 1) : 1;
    return Array.from({ length: count }, (_, offset) => offsetMonth(current, -offset));
  }, [current, first]);

  return <Dropdown label="Chọn tháng" hideLabel singleLineValue highlightSelection={false} value={selected} style={styles.monthPicker}
    choices={options.map(value => ({ value, label: formatMonth(value) }))}
    fallbackLabel={formatMonth(selected)} onChange={onSelect} />;
}

function TableAction({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) {
  const styles = useStyles();
  const ui = useScreenStyles();
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled}
    onPress={onPress} style={({ pressed }) => [styles.tableAction, (pressed || disabled) && ui.dimmed]}>
    <Text style={ui.label}>{label}</Text>
  </Pressable>;
}

function Metric({ label, value, detail, inlineDetail, alertDetail }: {
  label: string; value: string; detail?: string; inlineDetail?: string; alertDetail?: boolean;
}) {
  const styles = useStyles();
  const ui = useScreenStyles();
  return <View style={styles.metric}>
    <Text style={ui.muted}>{label}</Text>
    <Text style={ui.cardTitle}>{value}{inlineDetail && <Text style={[ui.muted, styles.metricInlineDetail]}>{inlineDetail}</Text>}</Text>
    {detail && <Text style={alertDetail ? styles.alertDetail : ui.muted}>{detail}</Text>}
  </View>;
}

const timeOptions = (count: number) => Array.from({ length: count }, (_, index) => {
  const value = String(index).padStart(2, '0');
  return { value, label: value };
});
const hourOptions = [{ value: '', label: 'Chọn giờ' }, ...timeOptions(24)];
const minuteOptions = timeOptions(60);

function AdjustmentTimeField({ label, value, disabled, onChange }: {
  label: string; value: string; disabled: boolean; onChange: (value: string) => void;
}) {
  const ui = useScreenStyles();
  const styles = useStyles();
  const [hour = '', minute = ''] = value.split(':');
  return <View style={styles.scheduleDetails}>
    <Text style={ui.label}>{label}</Text>
    <View style={styles.timeFields}>
      <Dropdown label={label + ' · Giờ'} hideLabel value={hour} choices={hourOptions}
        style={styles.timeField} disabled={disabled}
        onChange={nextHour => onChange(nextHour ? nextHour + ':' + (minute || '00') : '')} />
      <Dropdown label={label + ' · Phút'} hideLabel value={minute} choices={minuteOptions}
        fallbackLabel="Chọn phút" style={styles.timeField} disabled={disabled || !hour}
        onChange={nextMinute => onChange(hour + ':' + nextMinute)} />
    </View>
  </View>;
}

function AdjustmentEditor({ target, email, onClose }: { target: AttendanceEditTarget; email: string; onClose: () => void }) {
  const ui = useScreenStyles();
  const styles = useStyles();
  const { member, date, record, calculatedWork } = target;
  const [manualIn, setIn] = useState(record?.manualIn ?? '');
  const [manualOut, setOut] = useState(record?.manualOut ?? '');
  const [manualWork, setWork] = useState(String(record?.manualWork ?? ''));
  const [note, setNote] = useState(record?.note ?? '');
  const [pending, setPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();
  const lock = useRef(false);

  async function submit(deleting: boolean) {
    if (lock.current) return;
    if (!deleting && (!isTime(manualIn.trim()) || !isTime(manualOut.trim()) || !note.trim())) {
      setError('Nhập lý do và dùng định dạng HH:mm cho giờ điều chỉnh.');
      return;
    }
    if (!deleting) {
      const recordedIn = machineTime(record?.inTs);
      const recordedOut = machineTime(record?.outTs);
      const effectiveIn = manualIn.trim() || (recordedIn === null ? '' : clock(recordedIn));
      const effectiveOut = manualOut.trim() || (recordedOut === null ? '' : clock(recordedOut));
      if (effectiveIn && effectiveOut && effectiveOut < effectiveIn) {
        setError('Giờ ra không được trước giờ vào.');
        return;
      }
    }
    lock.current = true;
    setPending(true);
    setError('');
    try {
      if (deleting) {
        await removeAttendance(member.email, date);
        toast('Đã xóa bản ghi chấm công.');
      } else {
        const notified = await saveAdjustment(member, date, email, {
          manualIn: manualIn.trim(), manualOut: manualOut.trim(), manualWork, note: note.trim(),
        });
        toast(notified ? 'Đã lưu điều chỉnh công.' : 'Đã lưu điều chỉnh công. Chưa gửi được thông báo.', notified ? 'success' : 'neutral');
      }
      onClose();
    } catch {
      setError('Không lưu được thay đổi. Kiểm tra quyền truy cập hoặc kết nối rồi thử lại.');
    } finally {
      lock.current = false;
      setPending(false);
    }
  }

  const cancelDelete = () => {
    if (lock.current) return;
    setError('');
    setConfirmDelete(false);
  };

  const details = [
    ['Nhân viên', member.name],
    ['Ngày', showAttendanceDate(date) + '/' + date.slice(0, 4)],
    ['Giờ vào ghi nhận', clock(machineTime(record?.inTs))],
    ['Giờ ra ghi nhận', clock(machineTime(record?.outTs))],
    ['Công hiện tại', calculatedWork],
  ] as const;

  return <Modal visible transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => {
    if (confirmDelete) cancelDelete();
    else if (!lock.current) onClose();
  }}>
    <SafeAreaView style={styles.editorOverlay}>
      <KeyboardAvoidingView style={styles.editorCenter} behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        aria-hidden={confirmDelete} importantForAccessibility={confirmDelete ? 'no-hide-descendants' : 'auto'}>
        <View role="dialog" accessibilityLabel="Sửa công" accessibilityViewIsModal style={[ui.panel, styles.editorPanel]}>
          <View style={ui.listHeader}>
            <Text accessibilityRole="header" style={[ui.cardTitle, ui.listHeading]}>Sửa công</Text>
            {record && <DeleteIconButton label="Xóa bản ghi chấm công" disabled={pending || confirmDelete}
              onPress={() => { setError(''); setConfirmDelete(true); }} />}
            <PopupCloseButton label="Đóng sửa công" onPress={onClose} disabled={pending || confirmDelete} />
          </View>
          <ScrollView style={styles.editorScroll} contentContainerStyle={ui.stack} keyboardShouldPersistTaps="handled">
            <View style={styles.scheduleDetails}>
              {details.map(([label, value]) => <Text key={label} style={styles.scheduleText}>
                <Text style={styles.scheduleLabel}>{label}: </Text>{value}
              </Text>)}
            </View>
            <AdjustmentTimeField label="Giờ vào điều chỉnh" value={manualIn} onChange={setIn} disabled={pending || confirmDelete} />
            <AdjustmentTimeField label="Giờ ra điều chỉnh" value={manualOut} onChange={setOut} disabled={pending || confirmDelete} />
            <Text style={ui.label}>Số công</Text>
            <View style={ui.choices}>
              {['', '1', '0.5', '0'].map(value => <Pressable key={value} accessibilityRole="radio"
                accessibilityState={{ checked: manualWork === value }} disabled={pending || confirmDelete}
                onPress={() => setWork(value)} style={[ui.choice, manualWork === value && ui.selected]}>
                <Text style={ui.label}>{value || 'Tự tính'}</Text>
              </Pressable>)}
            </View>
            <FieldLabel style={ui.label} required>Lý do điều chỉnh</FieldLabel>
            <TextInput accessibilityLabel="Lý do điều chỉnh" value={note} onChangeText={setNote} maxLength={1000}
              editable={!pending && !confirmDelete} style={ui.input} />
            {!!error && !confirmDelete && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
            <Button label={pending && !confirmDelete ? 'Đang lưu…' : 'Lưu điều chỉnh'}
              disabled={pending || confirmDelete} onPress={() => void submit(false)} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
      {confirmDelete && <ConfirmDialog label="Xác nhận xóa bản ghi chấm công" title="Xóa bản ghi chấm công?"
        message={`Bản ghi của ${member.name} ngày ${showAttendanceDate(date)}/${date.slice(0, 4)} sẽ bị xóa vĩnh viễn.`}
        action="Xác nhận xóa" pendingAction="Đang xóa…" pending={pending} error={error}
        onCancel={cancelDelete} onConfirm={() => void submit(true)} />}
      <ToastLayer />
    </SafeAreaView>
  </Modal>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  completedNotice: { backgroundColor: colors.successSoft, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 9 },
  completedText: { color: colors.success, fontSize: 14, fontWeight: '700' },
  companyPanel: { padding: 23, gap: 24 },
  tableHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  monthActions: { flexDirection: 'row', maxWidth: '100%', gap: 10 },
  tableAction: { minHeight: 44, paddingHorizontal: 14,
    justifyContent: 'center', borderWidth: 1, borderRadius: 8, borderColor: colors.line, backgroundColor: colors.paper },
  saveNoteAction: { alignSelf: 'flex-end' },
  noteInput: { minHeight: 76, paddingVertical: 10, textAlignVertical: 'top' },
  scheduleDetails: { gap: 5 },
  scheduleText: { color: colors.muted, fontSize: 15, lineHeight: 21 },
  scheduleLabel: { color: colors.metadataLabel, fontWeight: '700' },
  monthPicker: { width: 148, flexShrink: 1 },
  alertDetail: { color: colors.danger, fontSize: 14, fontWeight: '700' },
  clock: { alignSelf: 'center', color: colors.ink, fontSize: 42, fontWeight: '800', fontVariant: ['tabular-nums'] },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { flexGrow: 1, flexBasis: '45%', backgroundColor: colors.accentSoft, borderRadius: 10, padding: 10 },
  metricInlineDetail: { fontWeight: '400' },
  missedPunches: { gap: 4 },
  editorOverlay: { flex: 1, backgroundColor: 'rgba(33, 25, 53, 0.45)' },
  editorCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 },
  editorPanel: { width: '100%', maxWidth: 520, flexShrink: 1 },
  editorScroll: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  timeFields: { flexDirection: 'row', gap: 8 },
  timeField: { flex: 1, minWidth: 0 },
}));
