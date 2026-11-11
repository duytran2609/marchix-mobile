import { useEffect, useState } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import type { ReminderWindow } from '../settings/reminderSettings';
import { useScreenStyles } from '../../theme/screenStyles';
import { formatDue, shiftDay, todayInVietnam } from './taskDates';
import type { Task } from './tasks';

export function DueTaskReminders({ tasks, email, window, onOpen }: {
  tasks: Task[];
  email: string;
  window: ReminderWindow;
  onOpen: (task: Task) => void;
}) {
  const styles = useScreenStyles();
  const [today, setToday] = useState(todayInVietnam);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (window === 'off') return;
    const refresh = () => setToday(todayInVietnam());
    refresh();
    const timer = setInterval(refresh, 30_000);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') refresh();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [window]);

  if (window === 'off') return null;
  const days = new Set(Array.from({ length: Number(window) + 1 }, (_, index) => shiftDay(today, index)));
  const dueTasks = tasks.filter((task): task is Task & { due: string } =>
    task.assigneeEmail === email && task.status !== 'Xong' && task.status !== 'Chờ duyệt' &&
    Boolean(task.due && days.has(task.due)))
    .sort((a, b) => a.due.localeCompare(b.due));
  if (!dueTasks.length) return null;

  return (
    <View style={styles.panel}>
      <Pressable accessibilityRole="button" aria-expanded={expanded} style={styles.listHeader}
        onPress={() => setExpanded(current => !current)}>
        <Text style={[styles.cardTitle, styles.listHeading]}>{dueTasks.length} công việc đến hạn</Text>
        <Text style={styles.muted}>{expanded ? 'Thu gọn' : 'Xem'}</Text>
      </Pressable>
      {expanded && dueTasks.map(task => (
        <Pressable key={task.id} accessibilityRole="button" style={styles.detailRow} onPress={() => onOpen(task)}>
          <Text style={styles.label}>{task.title}</Text>
          <Text style={styles.muted}>{task.due === today ? 'Hạn hôm nay' : formatDue(task.due)}</Text>
        </Pressable>
      ))}
    </View>
  );
}
