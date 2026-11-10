const vietnamDateTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export function formatVietnamDateTime(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? vietnamDateTime.format(timestamp).replace(',', '') : '';
}
