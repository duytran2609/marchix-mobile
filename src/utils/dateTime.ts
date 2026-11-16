const vietnamDateTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export function formatVietnamDateTime(value: string, order: 'date-first' | 'time-first' = 'date-first') {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '';
  if (order === 'date-first') return vietnamDateTime.format(timestamp).replace(',', '');

  const parts = Object.fromEntries(vietnamDateTime.formatToParts(timestamp).map(({ type, value }) => [type, value]));
  return `${parts.hour}:${parts.minute} ${parts.day}/${parts.month}/${parts.year}`;
}
