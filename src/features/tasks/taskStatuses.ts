export const editableStatuses = ['Chưa làm', 'Đang làm', 'Vướng'] as const;
export const taskStatuses = [...editableStatuses, 'Chờ duyệt', 'Xong'] as const;
export type TaskStatus = typeof taskStatuses[number];

export function taskStatus(task: { status: string }) {
  return task.status || 'Chưa làm';
}
