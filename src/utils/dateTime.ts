const vietnamWeekday = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh', weekday: 'short',
});

export function formatMonthLabel(month: string) {
  return `${month.slice(5)}/${month.slice(0, 4)}`;
}
const vietnamDate = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric',
});

export function formatVietnamDateWithWeekday(value: Date | string) {
  const date = typeof value === 'string' ? new Date(value) : value;
  const weekday = vietnamWeekday.format(date);
  return `${weekday === 'CN' ? 'Chủ nhật' : weekday}, ${vietnamDate.format(date)}`;
}

const vietnamDateTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export function formatVietnamDateTime(value?: string | Date | null) {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value.split('-').reverse().join('/');
  const timestamp = typeof value === 'string' ? Date.parse(value) : value.getTime();
  if (!Number.isFinite(timestamp)) return '';
  const parts = Object.fromEntries(vietnamDateTime.formatToParts(timestamp).map(({ type, value }) => [type, value]));
  return `${parts.hour}:${parts.minute} ${parts.day}/${parts.month}/${parts.year}`;
}
