import { shiftDay } from '../tasks/taskDates';
import type { Task } from '../tasks/tasks';

export const weeklyPlanTextLimit = 2000;
export type WeekCommitment = { priorities: string; blockers: string };

export function planContent(plan?: WeekCommitment) {
  if (!plan) return '';
  return [plan.priorities, plan.blockers && `Cần hỗ trợ · ${plan.blockers}`].filter(Boolean).join('\n\n');
}

export function mondayOf(day: string) {
  const weekday = new Date(day + 'T00:00:00Z').getUTCDay();
  return shiftDay(day, -((weekday + 6) % 7));
}

export function suggestWeekTasks(tasks: Task[], email: string, from: string, to: string) {
  const weight = (priority?: string) => {
    if (priority === 'Cao') return 3;
    return priority === 'Thấp' ? 1 : 2;
  };
  return tasks.filter(task =>
    task.assigneeEmail === email && task.status !== 'Xong' && task.status !== 'Chờ duyệt' &&
    task.due && task.due >= from && task.due <= to,
  ).sort((a, b) => Number(b.status === 'Vướng') - Number(a.status === 'Vướng') ||
    (a.due ?? '').localeCompare(b.due ?? '') ||
    weight(b.priority) - weight(a.priority));
}
