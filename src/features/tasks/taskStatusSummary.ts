import { daysOverdue } from './taskDates';
import { overdueTaskLabel } from './taskLabels';
import { taskStatus, taskStatuses } from './taskStatuses';

/** Summarize already-authorized tasks using the same statuses as the task board. */
export function taskStatusSummary<T extends { id: string; status: string }>(
  tasks: readonly T[], configuredStatuses: readonly string[] = taskStatuses,
) {
  const buckets = new Map([...new Set(configuredStatuses)].map(status => [status, [] as T[]]));
  // Received/sent subscriptions can contain the same task. Count each ID once.
  for (const task of new Map(tasks.map(task => [task.id, task])).values()) {
    const status = taskStatus(task);
    const key = buckets.has(status) ? status : 'Khác';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(task);
  }
  return Array.from(buckets, ([status, tasks]) => ({ status, tasks }));
}

export function overdueTaskBucket<T extends { status: string; due?: string }>(
  summary: readonly { tasks: readonly T[] }[], today: string,
) {
  return {
    status: overdueTaskLabel,
    tasks: summary.flatMap(bucket => bucket.tasks.filter(task => daysOverdue(task, today) > 0)),
  };
}
