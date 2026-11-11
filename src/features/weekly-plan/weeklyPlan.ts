import { dateInVietnam, shiftDay } from '../tasks/taskDates';
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

export function summarizeWeek(tasks: Task[], email: string, from: string, to: string) {
  const previous = shiftDay(from, -7);
  const assigned = tasks.filter(task => task.assigneeEmail === email);
  const weight = (priority?: string) => {
    if (priority === 'Cao') return 3;
    return priority === 'Thấp' ? 1 : 2;
  };
  const suggested = assigned.filter(task =>
    task.status !== 'Xong' && task.status !== 'Chờ duyệt' &&
    task.due && task.due >= from && task.due <= to,
  ).sort((a, b) => Number(b.status === 'Vướng') - Number(a.status === 'Vướng') ||
    (a.due ?? '').localeCompare(b.due ?? '') ||
    weight(b.priority) - weight(a.priority));
  const completed = assigned.filter(task => {
    if (task.status !== 'Xong') return false;
    // Approval follows submission, while a review from an earlier attempt may predate doneAt.
    const done = Date.parse(task.doneAt ?? '');
    const reviewed = Date.parse(task.reviewedAt ?? '');
    const completion = Math.max(Number.isFinite(done) ? done : -Infinity, Number.isFinite(reviewed) ? reviewed : -Infinity);
    if (!Number.isFinite(completion)) return false;
    const day = dateInVietnam(new Date(completion));
    return day >= previous && day < from;
  }).length;
  return { suggested, completed };
}
