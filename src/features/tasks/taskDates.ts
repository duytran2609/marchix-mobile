export function formatDue(due?: string) {
  return due ? `Hạn ${formatTaskDate(due)}` : 'Chưa đặt hạn';
}

export function formatTaskDate(day: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : day;
}
