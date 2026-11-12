import { utils, write } from 'xlsx';
import { saveExcel } from '../../utils/saveExcel';
import { payrollCells, payrollHeaders, payrollMetrics } from './payrollColumns';
import type { PayrollRow } from './payrollColumns';

export function exportPayroll(month: string, rows: PayrollRow[]) {
  const totals = ['Tổng', '', ...payrollMetrics.map(metric => {
    let sum = 0;
    for (const row of rows) {
      const value = metric.get(row.pay);
      if (value === undefined) return '';
      sum += value;
    }
    return sum;
  })];
  return downloadPayroll('Bảng lương', 'Bang-luong', month, [...rows.map(row => payrollCells(row)), totals]);
}

export function exportPayslip(month: string, row: PayrollRow) {
  return downloadPayroll('Phiếu lương', 'Phieu-luong', month, [payrollCells(row)]);
}

function downloadPayroll(title: string, filePrefix: string, month: string, rows: (string | number)[][]) {
  const sheet = utils.aoa_to_sheet([payrollHeaders, ...rows]);
  sheet['!cols'] = payrollHeaders.map((header, index) => ({ wch: index === 0 ? 30 : Math.max(14, header.length + 3) }));
  const book = utils.book_new();
  utils.book_append_sheet(book, sheet, title + ' ' + month);
  const bytes: ArrayBuffer = write(book, { type: 'array', bookType: 'xlsx' });
  return saveExcel(bytes, filePrefix + '-' + month + '.xlsx', 'Lưu ' + title.toLowerCase());
}
