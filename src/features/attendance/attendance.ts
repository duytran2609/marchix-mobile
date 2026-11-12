export type Attendance = {
  id: string;
  email: string;
  date: string;
  inTs?: unknown;
  outTs?: unknown;
  manualIn?: string;
  manualOut?: string;
  manualWork?: number | '';
  note?: string;
};

export type AttendanceRequest = {
  createdBy: string;
  from: string;
  to?: string;
  status: string;
  type: string;
  overtime?: { hours?: number };
};

export const defaultSchedule = {
  shiftIn: '08:00', shiftOut: '17:30', lunchFrom: '12:00', lunchTo: '13:00',
  grace: 10, days: { 0: 0, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 0.5 } as Record<number, number>,
  attStart: '', gpsOn: false, gpsLat: 0, gpsLng: 0, gpsRadius: 300,
};

export type Schedule = typeof defaultSchedule;
export const attendanceVerificationFlag = 'Cần xác minh giờ vào/ra';

export const attendanceId = (email: string, date: string) => email + '_' + date;

export function dateKey(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function offsetMonth(month: string, offset: number) {
  const [year, index] = month.split('-').map(Number);
  return dateKey(new Date(year, index - 1 + offset, 1)).slice(0, 7);
}

export function monthDays(month: string) {
  const [year, index] = month.split('-').map(Number);
  return Array.from({ length: new Date(year, index, 0).getDate() }, (_, day) =>
    month + '-' + String(day + 1).padStart(2, '0'));
}

export const weekdays = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
export const weekday = (date: string) => new Date(date + 'T00:00:00').getDay();
export const dayWeight = (date: string, schedule: Schedule) => Number(schedule.days[weekday(date)] ?? 0);

export function clock(minutes: number | null) {
  if (minutes === null) return '–';
  return String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0');
}

const minutes = (time: string) => {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
};

function asDate(value: unknown): Date | null {
  const date = typeof value === 'object' && value && 'toDate' in value && typeof value.toDate === 'function'
    ? value.toDate() : typeof value === 'string' || typeof value === 'number' ? new Date(value) : null;
  return date instanceof Date && Number.isFinite(date.getTime()) ? date : null;
}

export function machineTime(value: unknown) {
  const date = asDate(value);
  return date ? date.getHours() * 60 + date.getMinutes() : null;
}

export function calculateAttendance(row: Attendance, schedule: Schedule, today: string) {
  const weight = dayWeight(row.date, schedule);
  const inDate = asDate(row.inTs);
  const outDate = asDate(row.outTs);
  const entered = row.manualIn ? minutes(row.manualIn) : machineTime(row.inTs);
  const exited = row.manualOut ? minutes(row.manualOut) : machineTime(row.outTs);
  const start = minutes(schedule.shiftIn);
  const shiftEnd = minutes(schedule.shiftOut);
  const lunchStart = minutes(schedule.lunchFrom);
  const lunchEnd = minutes(schedule.lunchTo);
  const end = weight === 0.5
    ? (Number.isFinite(lunchStart) ? lunchStart : start + Math.floor((shiftEnd - start) / 2))
    : shiftEnd;
  const hasLunchBreak = Number.isFinite(lunchStart) && lunchEnd > lunchStart;
  const netMinutes = (from: number, to: number) =>
    Math.max(0, to - from - (hasLunchBreak ? Math.max(0, Math.min(to, lunchEnd) - Math.max(from, lunchStart)) : 0));
  const worked = entered !== null && exited !== null ? netMinutes(entered, exited) : 0;
  const ratio = worked / Math.max(1, netMinutes(start, end));
  const adjusted = row.manualWork !== undefined && row.manualWork !== '';
  const work = adjusted ? Number(row.manualWork) : (ratio >= 0.9 ? weight : ratio >= 0.45 ? weight / 2 : 0);
  const arrivalOffset = entered === null || !Number.isFinite(start) ? null : entered - start;
  const departureOffset = exited === null || !Number.isFinite(end) ? null : exited - end;
  const late = arrivalOffset !== null && weight > 0 && arrivalOffset > schedule.grace ? arrivalOffset : 0;
  const early = departureOffset !== null && weight > 0 && -departureOffset > schedule.grace ? -departureOffset : 0;
  let flag = '';
  if (!adjusted && entered !== null && exited === null) flag = row.date === today ? 'Đang làm' : 'Quên chấm ra';
  else if (!adjusted && !weight && worked) flag = 'Làm ngày nghỉ ' + clock(worked);
  if (inDate && dateKey(inDate) !== row.date && !row.manualIn) flag = 'Sai ngày';
  if (!adjusted && entered !== null && exited !== null && (exited <= entered ||
    (!row.manualIn && !row.manualOut && inDate && outDate && outDate.getTime() - inDate.getTime() < 120000))) {
    flag = attendanceVerificationFlag;
  }
  return { entered, exited, worked, work, late, early, flag };
}

export function approvedOvertimeByDay(email: string, requests: readonly AttendanceRequest[]) {
  const hoursByDay = new Map<string, number>();
  for (const request of requests) {
    if (request.createdBy !== email || request.status !== 'Đã duyệt' || request.type !== 'Làm thêm giờ') continue;
    const hours = request.overtime?.hours;
    if (typeof hours !== 'number' || !Number.isFinite(hours) || hours <= 0 || hours > 24) continue;
    hoursByDay.set(request.from, (hoursByDay.get(request.from) ?? 0) + hours);
  }
  for (const [date, hours] of hoursByDay) hoursByDay.set(date, Math.round(hours * 60));
  return hoursByDay;
}

export function attendanceMonth(email: string, month: string, today: string, schedule: Schedule,
  records: ReadonlyMap<string, Attendance>, requests: readonly AttendanceRequest[], trackingStart: string) {
  const summary = { work: 0, standard: 0, leave: 0, late: 0, lateMinutes: 0, forgottenIn: 0, forgottenOut: 0, absent: 0 };
  const approved = requests.filter(request => request.createdBy === email && request.status === 'Đã duyệt' &&
    (request.type === 'Nghỉ phép' || request.type === 'Công tác'));
  const overtimeByDay = approvedOvertimeByDay(email, requests);
  const days = monthDays(month).map(date => {
    const weight = dayWeight(date, schedule);
    const record = records.get(attendanceId(email, date));
    const result = record ? calculateAttendance(record, schedule, today) : null;
    const workedMinutes = (result?.worked ?? 0) + (overtimeByDay.get(date) ?? 0);
    const leave = approved.find(request => request.from <= date && (request.to || request.from) >= date);
    const absent = !record && !leave && weight > 0 && date < today && date >= trackingStart;
    summary.standard += Number(weight > 0);
    if (result) {
      summary.work += result.work;
      summary.late += Number(result.late > 0);
      summary.lateMinutes += result.late;
      if (weight > 0 && !leave && date >= trackingStart && date <= today) {
        summary.forgottenIn += Number(result.entered === null && result.exited !== null);
        summary.forgottenOut += Number(date < today && result.entered !== null && result.exited === null);
      }
    } else if (leave) {
      summary.leave += weight;
    } else if (absent) {
      summary.absent += weight;
    }
    return { date, weight, record, result, workedMinutes, leave, absent };
  });
  return { summary, days };
}
