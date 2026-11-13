import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CardChevron } from '../../components/CardChevron';
import { createThemedStyles } from '../../theme/theme';
import { formatTaskDate } from './taskDates';
import { taskProgressValue } from './TaskProgress';
import type { Task } from './tasks';

const dayMs = 86_400_000;
const tickWidth = 56;
const rowHeight = 68;
const headerHeight = 36;

function calendarDay(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) return undefined;
  return time / dayMs;
}

const dateLabel = (day: number) => formatTaskDate(new Date(day * dayMs).toISOString().slice(0, 10));

function schedule(task: Task) {
  const start = calendarDay(task.startDate);
  const due = calendarDay(task.due);
  if (start !== undefined && due !== undefined && start <= due) {
    return { start, end: due, label: `${dateLabel(start)} – ${dateLabel(due)}` };
  }
  if (due !== undefined) return { start: due, label: `Hạn ${dateLabel(due)}` };
  if (start !== undefined) return { start, label: `Bắt đầu ${dateLabel(start)}` };
  return { label: 'Chưa đặt lịch' };
}

export function TaskGantt({ tasks, today, onOpen }: { tasks: Task[]; today: string; onOpen: (task: Task) => void }) {
  const styles = useStyles();
  const todayDay = Date.parse(today) / dayMs;
  const rows = tasks.map(task => ({ task, progress: taskProgressValue(task), ...schedule(task) }));
  const firstScheduled = rows.reduce((first, row) => Math.min(first, row.start ?? first), Infinity);
  const lastScheduled = rows.reduce((last, row) => Math.max(last, row.end ?? row.start ?? last), -Infinity);
  const first = Number.isFinite(firstScheduled) ? firstScheduled : todayDay;
  const last = Number.isFinite(lastScheduled) ? lastScheduled : todayDay;
  const start = todayDay >= first - 7 && todayDay <= last + 7 ? Math.min(first, todayDay) : first;
  const span = Math.max(7, last - start + 1, todayDay <= last + 7 ? todayDay - start + 1 : 0);
  const daysPerTick = span <= 21 ? 1 : 7 * Math.ceil(span / (28 * 7));
  const tickCount = Math.ceil(span / daysPerTick);
  const timelineWidth = tickCount * tickWidth;
  const dayWidth = tickWidth / daysPerTick;
  const todayOffset = (todayDay - start) * dayWidth;
  const showToday = todayOffset >= 0 && todayOffset < timelineWidth;

  return (
    <View style={styles.chart}>
      <View style={styles.names}>
        <View style={styles.nameHeader}><Text style={styles.heading}>Công việc</Text></View>
        {rows.map(({ task, label, progress }) => (
          <Pressable key={task.id} accessibilityRole="button" accessibilityLabel={`Mở công việc: ${task.title}`}
            accessibilityHint={`${label}. Tiến độ ${progress}%.`}
            onPress={() => onOpen(task)} style={({ pressed }) => [styles.nameRow, pressed && styles.pressed]}>
            <View style={styles.taskDetails}>
              <Text numberOfLines={2} style={styles.taskTitle}>{task.title}</Text>
              <Text numberOfLines={1} style={styles.dateLabel}>{label}</Text>
            </View>
            <Text style={styles.progressValue}>{progress}%</Text>
            <View style={styles.chevron}><CardChevron /></View>
          </Pressable>
        ))}
      </View>
      <ScrollView horizontal style={styles.timelineScroll} accessibilityLabel="Trục thời gian công việc">
        <View style={{ width: timelineWidth }}>
          <View style={styles.axis}>
            {Array.from({ length: tickCount }, (_, index) => {
              const day = start + index * daysPerTick;
              const date = new Date(day * dayMs);
              const year = date.getUTCFullYear();
              const previousYear = new Date((day - daysPerTick) * dayMs).getUTCFullYear();
              const containsToday = todayDay >= day && todayDay < day + daysPerTick;
              return <View key={day} style={[styles.tick, containsToday && styles.todayTick]}>
                <Text style={styles.dateLabel}>{dateLabel(day).slice(0, 5)}</Text>
                {index === 0 || year !== previousYear ? <Text style={styles.year}>{year}</Text>
                  : containsToday ? <Text style={styles.year}>Hôm nay</Text> : null}
              </View>;
            })}
          </View>
          <View pointerEvents="none" style={StyleSheet.absoluteFill} aria-hidden>
            {Array.from({ length: tickCount }, (_, index) => (
              <View key={index} style={[styles.gridLine, { left: index * tickWidth }]} />
            ))}
            {showToday && <View style={[styles.todayLine, { left: todayOffset + dayWidth / 2 }]} />}
          </View>
          {rows.map(({ task, start: taskStart, end, label, progress }) => {
            if (taskStart === undefined) return <View key={task.id} style={styles.timelineRow} />;
            const dayOffset = taskStart - start;
            const isMarker = end === undefined;
            const left = isMarker ? Math.min(timelineWidth - 10, Math.max(0, (dayOffset + 0.5) * dayWidth - 5))
              : dayOffset * dayWidth;
            const width = isMarker ? 10 : Math.max(2, (end - taskStart + 1) * dayWidth);
            return (
              <View key={task.id} style={styles.timelineRow}>
                <Pressable accessibilityRole="button" accessibilityLabel={`Mở công việc trên biểu đồ: ${task.title}`}
                  accessibilityHint={`${label}. Tiến độ ${progress}%.`} hitSlop={20}
                  onPress={() => onOpen(task)}
                  style={({ pressed }) => [isMarker ? styles.marker : styles.bar, { left, width }, pressed && styles.timelinePressed]}>
                  {!isMarker && (
                    <View pointerEvents="none" style={[styles.barFill, task.status === 'Xong' && styles.doneBar, { width: `${progress}%` }]} />
                  )}
                </Pressable>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  chart: { flexDirection: 'row', overflow: 'hidden', borderWidth: 1, borderColor: colors.line,
    borderRadius: 13, backgroundColor: colors.paper },
  names: { width: '45%', maxWidth: 270, zIndex: 1 },
  nameHeader: { height: headerHeight, justifyContent: 'center', paddingHorizontal: 10,
    backgroundColor: colors.surfaceMuted, borderBottomWidth: 1, borderColor: colors.line },
  heading: { color: colors.ink, fontWeight: '800', fontSize: 13 },
  nameRow: { height: rowHeight, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10,
    borderBottomWidth: 1, borderColor: colors.line },
  pressed: { backgroundColor: colors.accentSoft },
  taskDetails: { flex: 1, minWidth: 0, gap: 3 },
  taskTitle: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  chevron: { alignSelf: 'flex-start', paddingTop: 6 },
  progressValue: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  dateLabel: { color: colors.muted, fontSize: 11 },
  year: { color: colors.muted, fontSize: 10 },
  timelineScroll: { flex: 1, minWidth: 0 },
  axis: { height: headerHeight, flexDirection: 'row', backgroundColor: colors.surfaceMuted,
    borderBottomWidth: 1, borderColor: colors.line },
  tick: { width: tickWidth, paddingHorizontal: 5, justifyContent: 'center' },
  todayTick: { backgroundColor: colors.accentSoft },
  gridLine: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: colors.line },
  todayLine: { position: 'absolute', top: headerHeight, bottom: 0, width: 1, backgroundColor: colors.accent },
  timelineRow: { height: rowHeight, justifyContent: 'center', borderBottomWidth: 1, borderColor: colors.line },
  bar: { position: 'absolute', height: 14, borderRadius: 5, overflow: 'hidden', backgroundColor: colors.accentSoft },
  barFill: { height: '100%', backgroundColor: colors.accent },
  doneBar: { backgroundColor: colors.success },
  marker: { position: 'absolute', height: 10, borderRadius: 5, backgroundColor: colors.accent },
  timelinePressed: { opacity: 0.7 },
}));
