// Keep the detail action aligned with the existing assigner-only write policy.
export function taskEditBlockReason(task: { status: string; assignedBy?: string }, email: string, enabled: boolean): string | undefined {
  if (task.status === 'Xong') return 'Công việc đã xong, chỉ có thể xem chi tiết.';
  if (!enabled) return 'Bản ứng dụng này chưa bật chỉnh sửa công việc.';
  if (!email || task.assignedBy !== email) return 'Chỉ người giao việc mới được chỉnh sửa công việc này.';
  return undefined;
}
