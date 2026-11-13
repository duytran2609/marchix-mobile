import { utils, write } from 'xlsx-js-style';
import type { CellStyle, WorkSheet } from 'xlsx-js-style';
import { saveExcel } from '../../utils/saveExcel';
import { monthDays, weekday, weekdays } from './attendance';
import { attendanceLegend, attendanceMarker, personalAttendanceCells, personalColumns } from './attendanceTableData';
import type { AttendanceDay, CompanyAttendanceRow } from './attendanceTableData';

type ExportRow = { name: string; days: AttendanceDay[] };
type AttendanceExport = { company: CompanyAttendanceRow[] }
  | { personal: AttendanceDay[]; name: string; dailyNotes?: ReadonlyMap<string, string> };

const firstDayColumn = 3;
const dayColumnCount = 31;
const firstTotalColumn = firstDayColumn + dayColumnCount;
const lastColumn = firstTotalColumn + 4;
const firstEmployeeRow = 9;
const font = { name: 'Times New Roman', sz: 11 };
const centered = { horizontal: 'center', vertical: 'center', wrapText: true } as const;
const line = { style: 'thin', color: { rgb: '808080' } } as const;
const grid = { top: line, bottom: line, left: line, right: line };
const shade = { patternType: 'solid', fgColor: { rgb: 'E7E6E6' } } as const;
const bold = { ...font, bold: true };

function monthlySheet(month: string, rows: ExportRow[]) {
  const [year, monthNumber] = month.split('-');
  const dates = monthDays(month);
  let totalWork = 0;
  let totalLeave = 0;
  const values: (string | number | undefined)[][] = [
    ['MARCHIX'],
    ['BỘ PHẬN:'],
    [],
    ['BẢNG CHẤM CÔNG'],
    [`Tháng ${monthNumber} năm ${year}`],
    [],
    ['TT', 'Họ và tên', 'Cấp bậc, Chức vụ',
      ...Array.from({ length: dayColumnCount }, (_, index) => dates[index] ? index + 1 : ''),
      'SP', 'P', 'L', 'Ô', 'CĐ'],
    ['', '', '', ...dates.map(date => weekdays[weekday(date)])],
    Array.from({ length: lastColumn + 1 }, (_, index) => index + 1),
  ];

  rows.forEach(({ name, days }, index) => {
    const work = days.reduce((total, day) => total + (day.result?.work ?? 0), 0);
    const leave = days.reduce((total, day) => total + (attendanceMarker(day) === 'P' ? day.weight : 0), 0);
    totalWork += work;
    totalLeave += leave;
    const markers = Array.from({ length: dayColumnCount }, (_, day) => days[day] ? attendanceMarker(days[day]) : '');
    values.push([index + 1, name, '', ...markers, work, leave]);
  });

  const totalRow = values.length;
  const total: (string | number | undefined)[] = ['', 'Tổng cộng'];
  total[firstTotalColumn] = totalWork;
  total[firstTotalColumn + 1] = totalLeave;
  values.push(total);
  const noteRow = values.length;
  values.push(['', 'Ghi chú:']);
  const dateRow = values.length;
  values.push([]);
  const signatureRow = values.length;
  values.push([]);
  const legendRow = signatureRow + 4;
  values[legendRow] = ['', 'Ký hiệu chấm công:'];
  const legends = [
    ['SP: Tổng công làm việc', 'TS: Thai sản'],
    ['P: Nghỉ phép', 'TN: Tai nạn'],
    ['L: Nghỉ lễ', 'H: Hội nghị, học tập'],
    ['NB: Nghỉ bù', 'KL: Nghỉ không lương'],
    ['Ô: Ốm', 'N: Ngừng việc'],
    ['CĐ: Chế độ', 'LĐ: Lao động nghĩa vụ'],
  ];
  legends.forEach(([left, right], index) => {
    const row = values[legendRow + 1 + index] = ['', left];
    row[8] = right;
  });
  const instructionsRow = legendRow + legends.length + 2;
  values[instructionsRow] = ['', 'Hướng dẫn điền Bảng chấm công:'];
  values[instructionsRow + 1] = ['', 'Đối chiếu ký hiệu theo từng ngày. Cột SP và P lấy từ dữ liệu chấm công và phép đã duyệt.'];
  values[instructionsRow + 2] = ['', 'Điền thông tin bộ phận, chức vụ và các loại công chưa có dữ liệu trước khi ký xác nhận.'];
  const sheet = utils.aoa_to_sheet(values);
  sheet['!ref'] = utils.encode_range({ r: 0, c: 0 }, { r: instructionsRow + 2, c: lastColumn });
  sheet['!cols'] = [5, 26, 21, ...Array.from({ length: dayColumnCount }, () => 3.6), 7, 7, 5, 5, 6].map(wch => ({ wch }));
  sheet['!rows'] = [];
  sheet['!rows'][3] = { hpt: 25 };
  sheet['!rows'][6] = { hpt: 22 };
  sheet['!rows'][noteRow] = { hpt: 23 };
  sheet['!merges'] = [];

  function cell(row: number, column: number, style: CellStyle, value?: string) {
    const address = utils.encode_cell({ r: row, c: column });
    if (value !== undefined) sheet[address] = { t: 's', v: value };
    sheet[address] ??= { t: 's', v: '' };
    sheet[address].s = style;
  }
  function merge(range: string) {
    sheet['!merges']!.push(utils.decode_range(range));
  }

  ['A1:J1', 'A2:J2', 'A4:AM4', 'A5:AM5', 'A7:A8', 'B7:B8', 'C7:C8',
    'AI7:AI8', 'AJ7:AJ8', 'AK7:AK8', 'AL7:AL8', 'AM7:AM8',
  ].forEach(merge);
  cell(0, 0, { font: bold });
  cell(1, 0, { font: bold });
  cell(3, 0, { font: { ...bold, sz: 16 }, alignment: centered });
  cell(4, 0, { font: { ...font, italic: true }, alignment: centered });

  for (let row = 6; row <= totalRow; row++) {
    for (let column = 0; column <= lastColumn; column++) {
      const date = dates[column - firstDayColumn];
      const off = column >= firstDayColumn && column < firstTotalColumn &&
        (!date || (rows[0]?.days[column - firstDayColumn]?.weight ?? 1) === 0);
      cell(row, column, {
        font: row < firstEmployeeRow || row === totalRow ? bold : font,
        alignment: column === 1 && row >= firstEmployeeRow ? { ...centered, horizontal: 'left' } : centered,
        border: grid,
        fill: off ? shade : undefined,
      });
    }
  }
  merge(`B${totalRow + 1}:C${totalRow + 1}`);
  merge(`C${noteRow + 1}:AM${noteRow + 1}`);
  cell(noteRow, 1, { font: bold });
  cell(noteRow, 2, { font, alignment: { vertical: 'center', wrapText: true } }, attendanceLegend);
  merge(`Z${dateRow + 1}:AM${dateRow + 1}`);
  cell(dateRow, 25, { font: { ...font, italic: true }, alignment: centered }, '………, ngày……tháng……năm……');
  for (const [start, end, label] of [
    ['B', 'J', 'Giám đốc/Tổng Giám đốc'],
    ['N', 'Y', 'Phụ trách bộ phận'],
    ['AC', 'AJ', 'Người chấm công'],
  ]) {
    merge(`${start}${signatureRow + 1}:${end}${signatureRow + 1}`);
    cell(signatureRow, utils.decode_col(start), { font: bold, alignment: centered }, label);
  }
  for (let row = legendRow; row < instructionsRow; row++) {
    cell(row, 1, { font: row === legendRow ? bold : font });
    if (row > legendRow && row <= legendRow + legends.length) cell(row, 8, { font });
  }
  for (let row = instructionsRow; row <= instructionsRow + 2; row++) {
    merge(`B${row + 1}:AM${row + 1}`);
    cell(row, 1, { font: row === instructionsRow ? bold : font });
  }
  return sheet;
}

function personalDetails(days: AttendanceDay[], notes?: ReadonlyMap<string, string>): WorkSheet {
  const sheet = utils.aoa_to_sheet([personalColumns, ...days.map(day => {
    const { date, entered, exited, worked, work, notes: note } = personalAttendanceCells(day, notes?.get(day.date));
    return [date, entered, exited, worked, work, note];
  })]);
  sheet['!cols'] = [16, 10, 10, 12, 10, 52].map(wch => ({ wch }));
  for (let row = 0; row <= days.length; row++) {
    sheet[utils.encode_cell({ r: row, c: 5 })].s = { alignment: { wrapText: true } };
  }
  return sheet;
}

export async function exportAttendance(month: string, table: AttendanceExport) {
  const company = 'company' in table;
  const rows = company
    ? table.company.map(({ member, month: report }) => ({ name: member.name, days: report.days }))
    : [{ name: table.name, days: table.personal }];
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, monthlySheet(month, rows), 'Bảng chấm công');
  if (!company) utils.book_append_sheet(workbook, personalDetails(table.personal, table.dailyNotes), 'Chi tiết cá nhân');
  const bytes: ArrayBuffer = write(workbook, { type: 'array', bookType: 'xlsx', compression: true });
  const [year, monthNumber] = month.split('-');
  const filename = `Bang-cong-${company ? 'cong-ty' : 'ca-nhan'}-${monthNumber}-${year}.xlsx`;
  await saveExcel(bytes, filename, 'Lưu bảng công');
}
