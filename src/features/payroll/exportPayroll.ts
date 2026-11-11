import { utils, write } from 'xlsx';
import { saveExcel } from '../../utils/saveExcel';
import { amount } from './payroll';
import type { PayAmounts } from './payroll';

export const payrollMetrics: { label: string; get: (pay: PayAmounts) => number }[] = [
  { label: 'Lương theo công', get: pay => amount(pay.salary) },
  { label: 'Phụ cấp + thưởng', get: pay => amount(pay.gross) - amount(pay.salary) },
  { label: 'Tổng thu nhập', get: pay => amount(pay.gross) },
  { label: 'BHXH, BHYT, BHTN', get: pay => amount(pay.insEmp) },
  { label: 'Thuế TNCN', get: pay => amount(pay.pit) },
  { label: 'Tạm ứng + khấu trừ', get: pay => amount(pay.advance) + amount(pay.deduction) },
  { label: 'Thực lĩnh', get: pay => amount(pay.net) },
  { label: 'BH + KPCĐ công ty', get: pay => amount(pay.insCo) + amount(pay.kpcd) },
  { label: 'Tổng chi phí', get: pay => amount(pay.companyCost) },
];

export async function exportPayroll(month: string, rows: { name: string; status: string; pay: PayAmounts }[]) {
  const sheet = utils.aoa_to_sheet([
    ['Họ tên', 'Công thực tế', 'Công chuẩn', ...payrollMetrics.map(metric => metric.label), 'Trạng thái'],
    ...rows.map(({ name, pay, status }) => [name, pay.workDays, pay.standardDays, ...payrollMetrics.map(metric => metric.get(pay)), status]),
    ['Tổng', '', '', ...payrollMetrics.map(metric => rows.reduce((sum, row) => sum + metric.get(row.pay), 0))],
  ]);
  sheet['!cols'] = [{ wch: 26 }, ...Array.from({ length: 12 }, () => ({ wch: 23 }))];
  const book = utils.book_new();
  utils.book_append_sheet(book, sheet, 'Bảng lương ' + month);
  const bytes: ArrayBuffer = write(book, { type: 'array', bookType: 'xlsx' });
  await saveExcel(bytes, 'Bang-luong-' + month + '.xlsx', 'Lưu bảng lương');
}
