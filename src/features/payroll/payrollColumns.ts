import { amount, money } from './payroll';
import type { PayAmounts } from './payroll';

export type PayrollRow = { name: string; pay: PayAmounts; status: string };

function recorded(value: number | undefined) {
  return value == null || !Number.isFinite(Number(value)) ? undefined : Number(value);
}

export const payrollMetrics = [
  { label: 'Lương theo công', get: (pay: PayAmounts) => recorded(pay.salary) },
  { label: 'Phụ cấp + thưởng', get: (pay: PayAmounts) => {
    const gross = recorded(pay.gross);
    const salary = recorded(pay.salary);
    if (gross !== undefined && salary !== undefined) return gross - salary;
  } },
  { label: 'Tổng thu nhập', get: (pay: PayAmounts) => recorded(pay.gross) },
  { label: 'BH người LĐ', get: (pay: PayAmounts) => recorded(pay.insEmp) },
  { label: 'Thuế TNCN', get: (pay: PayAmounts) => recorded(pay.pit) },
  { label: 'Tạm ứng + khấu trừ', get: (pay: PayAmounts) => amount(pay.advance) + amount(pay.deduction) },
  { label: 'Thực lĩnh', get: (pay: PayAmounts) => recorded(pay.net) },
  { label: 'BH + KPCĐ công ty', get: (pay: PayAmounts) => {
    const insurance = recorded(pay.insCo);
    const union = recorded(pay.kpcd);
    if (insurance !== undefined && union !== undefined) return insurance + union;
  } },
  { label: 'Tổng chi phí', get: (pay: PayAmounts) => recorded(pay.companyCost) },
];

export const payrollHeaders = ['Họ tên', 'Công', ...payrollMetrics.map(metric => metric.label), 'Trạng thái'];
export const payrollWork = (pay: PayAmounts) => (pay.workDays ?? '–') + ' / ' + (pay.standardDays ?? '–');
export const payrollMoney = (value: number | undefined) => value === undefined ? '–' : money(value);

export function payrollCells(row: PayrollRow, formatMoney = false) {
  return [row.name, payrollWork(row.pay), ...payrollMetrics.map(metric => {
    const value = metric.get(row.pay);
    return formatMoney ? payrollMoney(value) : value ?? '';
  }), row.status];
}
