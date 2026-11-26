export function workflowWriteError(error: unknown, summary: string, record: string, nextStep: string) {
  if (error instanceof Error && !('code' in error) && error.message) return `${summary} ${error.message}`;

  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  if (code === 'unauthenticated') return `${summary} Đăng nhập lại rồi kiểm tra ${record}.`;
  if (code === 'permission-denied') {
    return `${summary} Mở lại ${record}. Nếu vẫn lỗi, nhờ quản trị viên kiểm tra quyền.`;
  }
  return `${summary} ${nextStep}`;
}
