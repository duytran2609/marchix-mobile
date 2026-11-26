import { useMemo } from 'react';
import type { ReminderWindow } from '../settings/reminderSettings';
import { useStoredPreference } from '../settings/usePreference';
import { formatTaskDate, shiftDay } from '../tasks/taskDates';
import { editableStatuses, taskStatus } from '../tasks/taskStatuses';
import type { Task } from '../tasks/tasks';
import { useVietnamToday } from '../tasks/useVietnamToday';
import type { WorkspaceNotification } from './notifications';

const emptyReadIds = new Set<string>();
const dayMs = 86_400_000;

function parseReadIds(stored: string | null) {
  const ids: unknown = stored ? JSON.parse(stored) : [];
  return new Set(Array.isArray(ids) ? ids.filter(id => typeof id === 'string') : []);
}

function serializeReadIds(ids: Set<string>) {
  return JSON.stringify([...ids]);
}

export function useTaskDeadlineReminders(projectId: string | undefined, email: string, tasks: Task[] | null, window: ReminderWindow) {
  const today = useVietnamToday(window !== 'off');
  const { value: readIds, ready, save } = useStoredPreference(
    `marchix:read-task-deadline-reminders:${projectId}:${email}`, emptyReadIds, parseReadIds, serializeReadIds,
  );

  const notes = useMemo(() => {
    if (window === 'off' || !tasks || !ready) return [];
    const todayTimestamp = Date.parse(today);
    const reminders: WorkspaceNotification[] = [];
    for (const task of tasks) {
      const { due } = task;
      if (task.assigneeEmail !== email || !editableStatuses.some(status => status === taskStatus(task)) ||
        typeof due !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(due)) continue;

      const date = new Date(due);
      if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== due) continue;
      const days = (date.getTime() - todayTimestamp) / dayMs;
      if (days > window) continue;

      const overdue = days < 0;
      // The two phases have separate read states and a rescheduled deadline gets a new reminder.
      const id = `deadline:${JSON.stringify([task.id, due, overdue])}`;
      const day = shiftDay(due, overdue ? 1 : -window);
      reminders.push({
        id, taskId: task.id, deadlineReminder: true, read: readIds.has(id),
        link: '#cong-viec', createdAt: new Date(`${day}T00:00:00+07:00`).toISOString(),
        title: `${overdue ? 'Quá hạn' : days === 0 ? 'Đến hạn hôm nay' : 'Sắp đến hạn'}: ${task.title}`,
        body: `Hạn ${formatTaskDate(due)}${overdue ? ` · Đã quá ${-days} ngày` : days > 0 ? ` · Còn ${days} ngày` : ''}`,
      });
    }
    return reminders;
  }, [email, readIds, ready, tasks, today, window]);

  function markRead(items: WorkspaceNotification[]) {
    const unreadIds = items.filter(note => note.deadlineReminder && !note.read).map(note => note.id);
    if (unreadIds.length) return save(new Set([...readIds, ...unreadIds]));
  }

  return { notes, markRead };
}
