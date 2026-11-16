import { todayInVietnam } from '../tasks/taskDates';

export const contracts = ['HĐLĐ không xác định thời hạn', 'HĐLĐ xác định thời hạn', 'Thử việc', 'Cộng tác viên / khoán việc'];
export const employeeStatuses = ['Đang làm', 'Đã nghỉ'];

export const emptyEmployee = {
  name: '', email: '', position: '', contract: contracts[1], startDate: '', status: employeeStatuses[0],
  salary: 0, insSalary: 0, allowTaxable: 0, allowFree: 0, dependents: 0, taxCode: '',
};
export type EmployeeFields = typeof emptyEmployee;
export type Employee = EmployeeFields & { id: string };

export const defaultRates = {
  luongCoSo: 2340000, lttVung: 5310000, giamTruBanThan: 15500000, giamTruPhuThuoc: 6200000,
  nldBHXH: 8, nldBHYT: 1.5, nldBHTN: 1, dnBHXH: 17, dnTNLD: 0.5, dnBHYT: 3, dnBHTN: 1, dnKPCD: 2, ngayCongChuan: 26,
};
export type Rates = typeof defaultRates;
export type PayInputs = { standardDays: number; workDays: number; bonus: number; deduction: number };
export type PayAmounts = PayInputs & {
  salary: number; gross: number; insEmp: number; insCo: number; kpcd: number;
  taxable: number; pit: number; advance: number; net: number; companyCost: number;
};
export type PayrollAdvance = { requestId: string; amount: number; reason: string };
export type Payslip = PayAmounts & {
  id: string; month: string; empId: string; name: string; email: string; status: string;
  employeeConfirmedAt?: string; lockedAt?: string;
  advanceDetails?: { lockedAt: string; requests: PayrollAdvance[] };
};

export function recordedAdvanceRequests(slip: Payslip) {
  const details = slip.advanceDetails;
  if (!slip.lockedAt || details?.lockedAt !== slip.lockedAt || !Array.isArray(details.requests)) return undefined;
  const requests = details.requests;
  if (!requests.every(row => row && typeof row.requestId === 'string' && row.requestId && !row.requestId.includes('/') &&
      Number.isSafeInteger(row.amount) && row.amount > 0 && typeof row.reason === 'string') ||
      requests.reduce((total, row) => total + row.amount, 0) !== slip.advance) return undefined;
  return requests;
}

export const monthLabel = (month: string) => month.slice(5) + '/' + month.slice(0, 4);
export const validMonth = (month: unknown): month is string => typeof month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
export const amount = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const formatter = new Intl.NumberFormat('vi-VN');
export const money = (value: number) => formatter.format(Math.round(amount(value))) + ' đ';
export const locked = (slip?: Partial<Payslip>) => Boolean(slip?.status && slip.status !== 'Nháp');

const oldBrackets = [[5e6, 5], [10e6, 10], [18e6, 15], [32e6, 20], [52e6, 25], [80e6, 30], [Infinity, 35]];
const newBrackets = [[10e6, 5], [30e6, 10], [60e6, 20], [100e6, 30], [Infinity, 35]];

export function calculatePay(employee: EmployeeFields, inputs: Partial<PayInputs>, month: string, rates: Rates, advance: number): PayAmounts {
  const standardDays = amount(inputs.standardDays) || amount(rates.ngayCongChuan) || 26;
  const workDays = inputs.workDays == null || String(inputs.workDays) === '' ? standardDays : amount(inputs.workDays);
  const bonus = amount(inputs.bonus);
  const deduction = amount(inputs.deduction);
  const salary = Math.round(amount(employee.salary) * workDays / standardDays);
  const gross = salary + amount(employee.allowTaxable) + amount(employee.allowFree) + bonus;
  const insurance = amount(employee.insSalary);
  const base = Math.min(insurance, 20 * rates.luongCoSo);
  const unemploymentBase = Math.min(insurance, 20 * rates.lttVung);
  const insEmp = Math.round(base * (amount(rates.nldBHXH) + amount(rates.nldBHYT)) / 100 + unemploymentBase * rates.nldBHTN / 100);
  const insCo = Math.round(base * (amount(rates.dnBHXH) + amount(rates.dnTNLD) + amount(rates.dnBHYT)) / 100 + unemploymentBase * rates.dnBHTN / 100);
  const kpcd = Math.round(base * rates.dnKPCD / 100);
  const taxable = Math.max(0, gross - amount(employee.allowFree) - insEmp - rates.giamTruBanThan -
    amount(employee.dependents) * rates.giamTruPhuThuoc);
  let tax = 0;
  let lower = 0;
  for (const [upper, rate] of month >= '2026-07' ? newBrackets : oldBrackets) {
    if (taxable <= lower) break;
    tax += (Math.min(taxable, upper) - lower) * rate / 100;
    lower = upper;
  }
  const pit = Math.round(tax);
  return { standardDays, workDays, bonus, deduction, salary, gross, insEmp, insCo, kpcd, taxable, pit, advance,
    net: gross - insEmp - pit - deduction - advance, companyCost: gross + insCo + kpcd };
}

export function payrollExpenses(month: string, rows: Payslip[]) {
  const label = monthLabel(month);
  const totals = rows.reduce((sum, row) => ({
    insurance: sum.insurance + amount(row.insEmp) + amount(row.insCo),
    union: sum.union + amount(row.kpcd), tax: sum.tax + amount(row.pit),
  }), { insurance: 0, union: 0, tax: 0 });
  const expenses = [
    ...rows.map(row => ({ id: 'luong_' + row.id, amount: row.net, category: 'Lương',
      note: 'Lương tháng ' + label + ' – ' + row.name, partyType: 'Nhân viên', partyName: row.name, partyEmail: row.email || '' })),
    { id: 'bhxh_' + month, amount: totals.insurance, category: 'BHXH, BHYT, BHTN',
      note: 'BHXH, BHYT, BHTN tháng ' + label + ' (phần người LĐ + công ty)', partyType: 'Cơ quan nhà nước', partyName: 'Bảo hiểm xã hội' },
    { id: 'kpcd_' + month, amount: totals.union, category: 'Kinh phí công đoàn',
      note: 'Kinh phí công đoàn tháng ' + label, partyType: 'Cơ quan nhà nước', partyName: 'Công đoàn' },
    { id: 'tncn_' + month, amount: totals.tax, category: 'Thuế TNCN nộp thay',
      note: 'Thuế TNCN khấu trừ tháng ' + label, partyType: 'Cơ quan nhà nước', partyName: 'Cơ quan thuế' },
  ];
  return expenses.filter(expense => expense.amount > 0).map(expense => ({
    ...expense, date: todayInVietnam(), type: 'chi', method: 'Chuyển khoản', projectId: '', status: 'Chờ chi',
  }));
}
