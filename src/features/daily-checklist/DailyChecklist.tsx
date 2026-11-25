import { useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { CardChevron } from '../../components/CardChevron';
import type { WorkspaceRoute } from '../../navigation/workspaceRoutes';
import { useScreenStyles } from '../../theme/screenStyles';
import { createThemedStyles } from '../../theme/theme';
import { calculateAttendance, dayWeight } from '../attendance/attendance';
import { watchAttendance, type AttendanceData } from '../attendance/attendanceStore';
import { canAct, type Cash, type CashAccess } from '../cash/cash';
import { watchNotifications, type WorkspaceNotification } from '../notifications/notifications';
import { canActOnRequest, type StaffRequest } from '../requests/requests';
import { shiftDay, todayInVietnam } from '../tasks/taskDates';

type Load<T> = T | 'error' | null;
type Item = { title: string; done: boolean | null; detail?: string; route?: WorkspaceRoute };
// Cash can belong to a project, and notification links do not carry that scope.
const operationalLinks = /^#(cham-cong|don-tu|luong|van-thu)(\/|$)/;

function queueItem(title: string, count: number | undefined, pending: (count: number) => string,
  empty: string, route?: WorkspaceRoute): Item {
  return {
    title, route,
    done: count === undefined ? null : count === 0,
    detail: count === undefined ? undefined : count > 0 ? pending(count) : empty,
  };
}

export function DailyChecklist({ email, isAdmin, canReadCash, canReviewCash, canReviewRequests, cash, requests, onNavigate, onRetry }:
  CashAccess & {
    canReviewRequests: boolean;
    cash: Load<Cash[]>;
    requests: Load<StaffRequest[]>;
    onNavigate: (route: WorkspaceRoute) => void;
    onRetry: () => void;
  }) {
  const screen = useScreenStyles();
  const styles = useStyles();
  const [today, setToday] = useState(todayInVietnam);
  const [attendance, setAttendance] = useState<{ day: string; value: Load<AttendanceData> }>();
  const [notes, setNotes] = useState<Load<WorkspaceNotification[]>>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function refresh() {
      clearTimeout(timer);
      const day = todayInVietnam();
      setToday(day);
      const midnight = Date.parse(`${shiftDay(day, 1)}T00:00:00+07:00`);
      timer = setTimeout(refresh, Math.max(1, midnight - Date.now()));
    }
    refresh();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') refresh();
    });
    return () => { clearTimeout(timer); subscription.remove(); };
  }, []);

  useEffect(() => watchAttendance(email, false,
    value => setAttendance({ day: today, value }),
    () => setAttendance({ day: today, value: 'error' }), today), [email, today, retry]);
  useEffect(() => watchNotifications(email, setNotes, () => setNotes('error'), true), [email, retry]);

  const attendanceToday = attendance?.day === today ? attendance.value : null;
  const items: Item[] = [];
  if (attendanceToday && attendanceToday !== 'error') {
    const { schedule, records, requests } = attendanceToday;
    const exempt = requests.some(row => row.createdBy === email && row.status === 'Đã duyệt' &&
      row.from <= today && (row.to || row.from) >= today &&
      ((row.type === 'Nghỉ phép' && !row.leaveTime) || (row.type === 'Công tác' && !row.trip?.time)));
    if (dayWeight(today, schedule) > 0 && !exempt) {
      const record = records.find(row => row.email === email && row.date === today);
      const result = record && calculateAttendance(record, schedule, today);
      const route = { screen: 'cham-cong' } as const;
      items.push(
        { title: 'Chấm công vào', done: Number.isFinite(result?.entered), route },
        { title: 'Chấm công ra', done: Number.isFinite(result?.exited), route },
      );
    }
  }

  const unread = Array.isArray(notes) ? notes.filter(note =>
    !note.read && !note.taskId && !note.projectId && operationalLinks.test(note.link)).length : undefined;
  items.push(queueItem('Đọc thông báo vận hành', unread,
    count => `Còn ${count} thông báo chưa đọc ở chuông Thông báo`, 'Không còn thông báo vận hành chưa đọc'));

  if (isAdmin || canReviewRequests) {
    const access = { email, isAdmin, canReviewRequests };
    const pending = Array.isArray(requests) ? requests.filter(row =>
      canActOnRequest(row, 'approve', access) || (!row.approverEmail && canActOnRequest(row, 'route', access)),
    ).length : undefined;
    items.push(queueItem('Xử lý đơn từ chờ duyệt', pending,
      count => `Còn ${count} đơn cần xử lý`, 'Không còn đơn cần xử lý', { screen: 'don-tu' }));
  }

  if (isAdmin || canReviewCash || canReadCash) {
    const access = { email, isAdmin, canReviewCash, canReadCash };
    const pending = Array.isArray(cash) ? cash.filter(row => !row.projectId && (
      canAct('approve', row, access) || (!row.approverEmail && canAct('route', row, access)) ||
      (Boolean(row.dueDate) && row.dueDate <= today && canAct('record', row, access))
    )).length : undefined;
    items.push(queueItem('Xử lý thu chi cần duyệt hoặc đến hạn', pending,
      count => `Còn ${count} khoản cần xử lý`, 'Không còn khoản cần xử lý', { screen: 'thu-chi' }));
  }

  const failed = [attendanceToday, notes, requests, cash].includes('error');
  const complete = attendanceToday && !failed && items.every(item => item.done !== null);
  return <View style={screen.panel}>
    <Text accessibilityRole="header" style={screen.cardTitle}>Công việc hàng ngày</Text>
    {complete && <Text accessibilityLiveRegion="polite" style={screen.muted}>
      Hôm nay đã hoàn thành {items.filter(item => item.done).length}/{items.length} việc
    </Text>}
    {attendanceToday === null && <Text style={screen.muted}>Đang kiểm tra ca chấm công hôm nay…</Text>}
    {failed && <View style={screen.choices}>
      <Text accessibilityRole="alert" style={screen.error}>Chưa xác nhận được một phần checklist.</Text>
      <Button secondary label="Tải lại checklist" onPress={() => {
        setAttendance(undefined);
        setNotes(null);
        setRetry(value => value + 1);
        onRetry();
      }} />
    </View>}
    {items.map(({ title, done, detail, route }) => {
      const status = done === null ? (failed ? 'Chưa xác nhận' : 'Đang kiểm tra…') : done ? 'Đã hoàn thành' : 'Chưa hoàn thành';
      const label = [title, status, detail].filter(Boolean).join('. ');
      const content = <>
        <View aria-hidden style={[styles.circle, done && styles.checkedCircle, done === null && styles.pendingCircle]}>
          {done && <Text style={styles.tick}>✓</Text>}
        </View>
        <View style={styles.text}>
          <Text style={screen.body}>{title}</Text>
          {(detail || done === null) && <Text style={screen.muted}>{detail ?? status}</Text>}
        </View>
      </>;
      return route
        ? <Pressable key={title} accessibilityRole="button" accessibilityLabel={label}
          style={styles.row} onPress={() => onNavigate(route)}>{content}<CardChevron /></Pressable>
        : <View key={title} accessible accessibilityLabel={label} style={styles.row}>{content}</View>;
    })}
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: colors.line,
    minHeight: 44, paddingVertical: 8 },
  text: { flex: 1, minWidth: 0 },
  circle: { width: 23, height: 23, borderRadius: 12, borderWidth: 2, borderColor: colors.muted,
    alignItems: 'center', justifyContent: 'center' },
  pendingCircle: { opacity: 0.5 },
  checkedCircle: { borderColor: colors.success, backgroundColor: colors.successSoft },
  tick: { color: colors.success, fontSize: 15, lineHeight: 17, fontWeight: '800' },
}));
