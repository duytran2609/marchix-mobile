const localDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });

export const dateInVietnam = (date: Date) => localDate.format(date);
export const todayInVietnam = () => dateInVietnam(new Date());

export function shiftDay(day: string, amount: number) {
  const date = new Date(day + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function formatDue(due?: string) {
  return due ? `Hạn ${formatTaskDate(due)}` : 'Chưa đặt hạn';
}

export function formatTaskDate(day: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : day;
}
