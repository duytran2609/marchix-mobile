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
type Item = { title: string; shortTitle?: string; done: boolean | null; count?: number; route?: WorkspaceRoute };
// Cash can belong to a project, and notification links do not carry that scope.
const operationalLinks = /^#(cham-cong|don-tu|luong|van-thu)(\/|$)/;

function queueItem(title: string, shortTitle: string, count: number | undefined, route?: WorkspaceRoute): Item {
  return {
    title, shortTitle, count, route,
    done: count === undefined ? null : count === 0,
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
  items.push(queueItem('Đọc thông báo vận hành', 'Thông báo vận hành', unread));

  if (isAdmin || canReviewRequests) {
    const access = { email, isAdmin, canReviewRequests };
    const pending = Array.isArray(requests) ? requests.filter(row =>
      canActOnRequest(row, 'approve', access) || (!row.approverEmail && canActOnRequest(row, 'route', access)),
    ).length : undefined;
    items.push(queueItem('Xử lý đơn từ chờ duyệt', 'Đơn từ chờ duyệt', pending, { screen: 'don-tu' }));
  }

  if (isAdmin || canReviewCash || canReadCash) {
    const access = { email, isAdmin, canReviewCash, canReadCash };
    const pending = Array.isArray(cash) ? cash.filter(row => !row.projectId && (
      canAct('approve', row, access) || (!row.approverEmail && canAct('route', row, access)) ||
      (Boolean(row.dueDate) && row.dueDate <= today && canAct('record', row, access))
    )).length : undefined;
    items.push(queueItem('Xử lý thu chi cần duyệt hoặc đến hạn', 'Thu chi cần xử lý', pending, { screen: 'thu-chi' }));
  }

  const failed = [attendanceToday, notes, requests, cash].includes('error');
  const complete = attendanceToday && !failed && items.every(item => item.done !== null);
  const doneCount = items.filter(item => item.done).length;
  return <View style={screen.panel}>
    <Text accessibilityRole="header" style={screen.cardTitle}>Công việc hàng ngày</Text>
    {complete && <View style={styles.progress} accessibilityRole="progressbar"
      accessibilityLabel="Công việc hàng ngày đã hoàn thành" accessibilityLiveRegion="polite"
      aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={doneCount}
      aria-valuetext={`${doneCount}/${items.length} việc`}>
      <View aria-hidden style={styles.progressHeading}>
        <Text style={styles.progressCount}>{doneCount}/{items.length}</Text>
        <Text style={screen.muted}>Đã hoàn thành</Text>
      </View>
      <View aria-hidden style={styles.segments}>
        {items.map((item, index) => <View key={item.title}
          style={[styles.segment, index < doneCount && styles.segmentDone]} />)}
      </View>
    </View>}
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
    <View style={styles.tiles}>
      {items.map(({ title, shortTitle, done, count, route }) => {
        const status = done === null ? (failed ? 'Chưa xác nhận' : 'Đang kiểm tra…') :
          done ? 'Đã hoàn thành' : 'Chưa hoàn thành';
        const label = [title, status, count ? `${count} mục cần xử lý` : undefined].filter(Boolean).join('. ');
        const content = <>
          <View style={styles.tileHeading}>
            <View aria-hidden style={[styles.indicator, done && styles.checked, Boolean(count) && styles.waiting]}>
              <Text style={[styles.indicatorText, done && styles.tick, Boolean(count) && styles.pendingCount]}>
                {done ? '✓' : count ?? '–'}
              </Text>
            </View>
            {route && <CardChevron />}
          </View>
          <Text style={screen.label}>{shortTitle ?? title}</Text>
          {count === undefined && !done && <Text style={styles.status}>{done === false ? 'Chưa chấm' : status}</Text>}
        </>;
        return route
          ? <Pressable key={title} accessibilityRole="button" accessibilityLabel={label}
            style={styles.tile} onPress={() => onNavigate(route)}>{content}</Pressable>
          : <View key={title} accessible accessibilityLabel={label} style={styles.tile}>{content}</View>;
      })}
    </View>
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  progress: { gap: 8, padding: 12, borderRadius: 12, backgroundColor: colors.successSoft },
  progressHeading: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 },
  progressCount: { color: colors.success, fontSize: 24, fontWeight: '800', fontVariant: ['tabular-nums'] },
  segments: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 6, borderRadius: 4, backgroundColor: colors.line },
  segmentDone: { backgroundColor: colors.success },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { flexBasis: 108, flexGrow: 1, gap: 4, minHeight: 76, padding: 10,
    borderWidth: 1, borderColor: colors.line, borderRadius: 12, backgroundColor: colors.background },
  tileHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 4 },
  indicator: { minWidth: 27, minHeight: 27, paddingHorizontal: 5, borderRadius: 8,
    backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  checked: { backgroundColor: colors.successSoft },
  waiting: { backgroundColor: colors.warningSoft },
  indicatorText: { color: colors.muted, fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },
  tick: { color: colors.success },
  pendingCount: { color: colors.warning },
  status: { color: colors.muted, fontSize: 12 },
}));
