import { saveExcel } from '../../utils/saveExcel';
import { utils, write } from 'xlsx';
import { attendanceLegend, attendanceMarker, companyTotals, personalAttendanceCells, personalColumns, showAttendanceDate } from './attendanceTableData';
import type { AttendanceDay, CompanyAttendanceRow } from './attendanceTableData';

export async function exportAttendance(month: string, table:
  { company: CompanyAttendanceRow[] } | { personal: AttendanceDay[]; dailyNotes?: ReadonlyMap<string, string> }) {
  const company = 'company' in table;
  let values: (string | number)[][];
  let widths: number[];
  if (company) {
    const days = table.company[0]?.month.days ?? [];
    const header = ['HỌ TÊN', ...days.map(day => showAttendanceDate(day.date)), ...companyTotals];
    values = [header, ...table.company.map(({ member, month: row }) => [
      member.name, ...row.days.map(attendanceMarker), row.summary.work + '/' + row.summary.standard,
      row.summary.leave, row.summary.late ? `${row.summary.late} (${row.summary.lateMinutes}′)` : 0,
      row.summary.forgottenIn + row.summary.forgottenOut,
    ]), [], [attendanceLegend]];
    widths = [28, ...days.map(() => 14), 11, 10, 15, 10];
  } else {
    values = [personalColumns, ...table.personal.map(day => {
      const { date, entered, exited, worked, work, notes } = personalAttendanceCells(day, table.dailyNotes?.get(day.date));
      return [date, entered, exited, worked, work, notes];
    })];
    widths = [16, 10, 10, 12, 10, 52];
  }
  const worksheet = utils.aoa_to_sheet(values);
  worksheet['!cols'] = widths.map(wch => ({ wch }));
  if (company) worksheet['!merges'] = [{
    s: { r: values.length - 1, c: 0 }, e: { r: values.length - 1, c: widths.length - 1 },
  }];
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, worksheet, 'Chấm công ' + month);
  const bytes: ArrayBuffer = write(workbook, { type: 'array', bookType: 'xlsx' });
  const filename = (company ? 'Bang-cong-cong-ty-' : 'Bang-cong-ca-nhan-') + month + '.xlsx';

  await saveExcel(bytes, filename, 'Lưu bảng công');
}
