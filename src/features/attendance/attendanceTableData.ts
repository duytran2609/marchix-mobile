import { attendanceVerificationFlag, clock, weekday, weekdays } from './attendance';
import type { Attendance, attendanceMonth } from './attendance';
import type { AttendanceMember } from './attendanceStore';

export type AttendanceMonth = ReturnType<typeof attendanceMonth>;
export type AttendanceDay = AttendanceMonth['days'][number];
export type AttendanceEditTarget = { member: AttendanceMember; date: string; record?: Attendance; calculatedWork: number };

export const showAttendanceDate = (date: string) =>
  weekdays[weekday(date)] + ' · ' + date.slice(8) + '/' + date.slice(5, 7);

export function attendanceMarker({ result, leave, weight, absent }: AttendanceDay) {
  if (result) {
    if (result.flag === 'Quên chấm ra') return '!';
    if (result.flag === 'Đang làm') return '•';
    if (result.flag) return '?';
    return result.work >= 1 ? 'x' : result.work > 0 ? '½' : '0';
  }
  if (leave && weight) return leave.type === 'Công tác' ? 'CT' : 'P';
  return absent ? '–' : '';
}

export type CompanyAttendanceRow = { member: AttendanceMember; month: AttendanceMonth };

export const companyTotals = ['CÔNG', 'PHÉP', 'MUỘN', 'QUÊN'];
export const personalColumns = ['NGÀY', 'VÀO', 'RA', 'GIỜ LÀM', 'CÔNG', 'GHI CHÚ'];
export const attendanceLegend = 'x đủ công · ½ nửa công · 0 không có công · P nghỉ phép đã duyệt · CT công tác · ! quên chấm ra · – vắng không đơn · ? cần xác minh · • đang làm.';

export function personalAttendanceCells(day: AttendanceDay, personalNote?: string) {
  const { date, weight, record, result, leave } = day;
  const flag = result?.flag;
  const showFlag = flag && flag !== 'Đang làm' && flag !== 'Quên chấm ra' &&
    flag !== attendanceVerificationFlag;
  return {
    date: showAttendanceDate(date),
    entered: clock(result?.entered ?? null),
    exited: clock(result?.exited ?? null),
    worked: clock(day.workedMinutes || null),
    work: attendanceMarker(day),
    notes: [!weight && 'Ngày nghỉ', !record && leave?.type, showFlag && flag, record?.note, personalNote].filter(Boolean).join('\n'),
  };
}
