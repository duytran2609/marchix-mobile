import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { createThemedStyles } from '../../theme/theme';
import { mondayOf } from '../weekly-plan/weeklyPlan';
import { formatTaskDate } from './taskDates';
import { taskProgressValue } from './TaskProgress';
import type { Task } from './tasks';

const dayMs = 86_400_000;
const tickWidth = 56;
const rowHeight = 76;
const headerHeight = 36;

export type GanttRange = 'month' | 'week';

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
    return { start, end: due, startDate: dateLabel(start), deadline: dateLabel(due) };
  }
  if (due !== undefined) return { start: due, deadline: dateLabel(due) };
  if (start !== undefined) return { start, startDate: dateLabel(start) };
  return {};
}

export function TaskGantt({ tasks, today, range, onOpen }: {
  tasks: Task[]; today: string; range: GanttRange;
  onOpen: (task: Task) => void;
}) {
  const styles = useStyles();
  const todayDay = Date.parse(today) / dayMs;
  const rows = tasks.map(task => {
    const dates = schedule(task);
    const progress = taskProgressValue(task);
    const labels = [];
    if (dates.startDate) labels.push(`Bắt đầu: ${dates.startDate}`);
    if (dates.deadline) labels.push(`Hạn chót: ${dates.deadline}`);
    if (!labels.length) labels.push('Chưa đặt lịch');
    return { task, progress, ...dates, hint: `${labels.join('. ')}. Tiến độ ${progress}%.` };
  });
  const start = Date.parse(range === 'week' ? mondayOf(today) : `${today.slice(0, 7)}-01`) / dayMs;
  const nextMonth = new Date(start * dayMs);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const tickCount = range === 'week' ? 7 : nextMonth.getTime() / dayMs - start;
  const timelineWidth = tickCount * tickWidth;
  const rangeEnd = start + tickCount;
  const todayTick = todayDay - start;

  return (
    <View style={styles.chart}>
      <View style={styles.names}>
        <View style={styles.nameHeader}><Text style={styles.heading}>Công việc</Text></View>
        {rows.map(({ task, startDate, deadline, hint, progress }) => (
          <Pressable key={task.id} accessibilityRole="button" accessibilityLabel={`Mở công việc: ${task.title}`}
            accessibilityHint={hint}
            onPress={() => onOpen(task)} style={({ pressed }) => [styles.nameRow, pressed && styles.pressed]}>
            <View style={styles.taskDetails}>
              <Text numberOfLines={2} style={styles.taskTitle}>{task.title}</Text>
              {startDate ? <Text style={styles.dateLabel}>Bắt đầu: {startDate}</Text> : null}
              {deadline ? <Text style={styles.dateLabel}>
                <Text style={styles.deadlineLabel}>Hạn chót: </Text>{deadline}
              </Text> : null}
              {!startDate && !deadline ? <Text style={styles.dateLabel}>Chưa đặt lịch</Text> : null}
            </View>
            <Text style={styles.progressValue}>{progress}%</Text>
          </Pressable>
        ))}
      </View>
      <ScrollView key={range} horizontal style={styles.timelineScroll} accessibilityLabel="Trục thời gian công việc">
        <View style={{ width: timelineWidth }}>
          <View style={styles.axis}>
            {Array.from({ length: tickCount }, (_, index) => {
              const day = start + index;
              return <View key={day} style={[styles.tick, index === todayTick && styles.todayTick]}>
                <Text style={styles.dateLabel}>{dateLabel(day).slice(0, 5)}</Text>
              </View>;
            })}
          </View>
          <View pointerEvents="none" style={StyleSheet.absoluteFill} aria-hidden>
            <View style={[styles.todayColumn, { left: todayTick * tickWidth }]} />
            {Array.from({ length: tickCount }, (_, index) => (
              <View key={index} style={[styles.gridLine, { left: index * tickWidth }]} />
            ))}
          </View>
          {rows.map(({ task, start: taskStart, end, hint, progress }) => {
            if (taskStart === undefined || (end ?? taskStart) < start || taskStart >= rangeEnd) {
              return <View key={task.id} style={styles.timelineRow} />;
            }
            const visibleStart = Math.max(taskStart, start);
            const dayOffset = visibleStart - start;
            const isMarker = end === undefined;
            const left = isMarker ? (dayOffset + 0.5) * tickWidth - 5 : dayOffset * tickWidth;
            const width = isMarker ? 10 : (Math.min(end + 1, rangeEnd) - visibleStart) * tickWidth;
            const completedThrough = isMarker ? taskStart : taskStart + (end - taskStart + 1) * progress / 100;
            const fillWidth = Math.min(width, Math.max(0, (completedThrough - visibleStart) * tickWidth));
            return (
              <View key={task.id} style={styles.timelineRow}>
                <Pressable accessibilityRole="button" accessibilityLabel={`Mở công việc trên biểu đồ: ${task.title}`}
                  accessibilityHint={hint} hitSlop={20}
                  onPress={() => onOpen(task)}
                  style={({ pressed }) => [isMarker ? styles.marker : styles.bar, { left, width }, pressed && styles.timelinePressed]}>
                  {!isMarker && (
                    <View pointerEvents="none" style={[styles.barFill, task.status === 'Xong' && styles.doneBar, { width: fillWidth }]} />
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
  taskDetails: { flex: 1, minWidth: 0, gap: 2 },
  taskTitle: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  progressValue: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  dateLabel: { color: colors.muted, fontSize: 11 },
  deadlineLabel: { fontWeight: '700' },
  timelineScroll: { flex: 1, minWidth: 0 },
  axis: { height: headerHeight, flexDirection: 'row', backgroundColor: colors.surfaceMuted,
    borderBottomWidth: 1, borderColor: colors.line },
  tick: { width: tickWidth, alignItems: 'center', justifyContent: 'center' },
  todayTick: { backgroundColor: colors.accentSoft },
  gridLine: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: colors.line },
  todayColumn: { position: 'absolute', top: headerHeight, bottom: 0, width: tickWidth,
    backgroundColor: colors.accentSoft, opacity: 0.65 },
  timelineRow: { height: rowHeight, justifyContent: 'center', borderBottomWidth: 1, borderColor: colors.line },
  bar: { position: 'absolute', height: 14, borderRadius: 5, overflow: 'hidden', backgroundColor: colors.accentSoft },
  barFill: { height: '100%', backgroundColor: colors.accent },
  doneBar: { backgroundColor: colors.success },
  marker: { position: 'absolute', height: 10, borderRadius: 5, backgroundColor: colors.accent },
  timelinePressed: { opacity: 0.7 },
}));
