import { collection, deleteField, doc, getDocFromServer, getDocsFromServer, onSnapshot, query, runTransaction, setDoc, where } from 'firebase/firestore';
import { db } from '../../services/firebase/firebase';
import { attendanceId, attendanceMonth, defaultSchedule, monthDays } from '../attendance/attendance';
import type { Attendance, AttendanceRequest } from '../attendance/attendance';
import { todayInVietnam } from '../tasks/taskDates';
import { amount, calculatePay, defaultRates, emptyEmployee, locked, payrollExpenses, validMonth } from './payroll';
import type { Employee, EmployeeFields, PayInputs, Payslip, Rates } from './payroll';

type PayrollRequest = AttendanceRequest & { month?: string; createdAt?: string; amount?: number };
export type PayrollData = { slips: Payslip[]; employees: Employee[]; rates: Rates; requests: PayrollRequest[] };

export function watchPayroll(email: string, admin: boolean, receive: (data: PayrollData) => void, fail: () => void) {
  const data: PayrollData = { slips: [], employees: [], rates: defaultRates, requests: [] };
  let pending = admin ? 4 : 1;
  const publish = (first: boolean) => {
    if (first) pending--;
    if (!pending) receive({ ...data });
  };
  const stops: (() => void)[] = [];
  const slips = collection(db, 'payroll');
  let firstSlip = true;
  stops.push(onSnapshot(admin ? slips : query(slips, where('email', '==', email), where('status', 'in', ['Đã chốt', 'Đã trả'])), snapshot => {
    data.slips = snapshot.docs.map(item => {
      const stored = item.data();
      return { ...stored, id: item.id, name: typeof stored.name === 'string' ? stored.name : '' } as Payslip;
    })
      .filter(item => validMonth(item.month)).sort((a, b) => b.month.localeCompare(a.month));
    publish(firstSlip);
    firstSlip = false;
  }, fail));
  if (admin) {
    let firstEmployee = true;
    let firstRates = true;
    let firstRequest = true;
    stops.push(onSnapshot(collection(db, 'employees'), snapshot => {
      data.employees = snapshot.docs.map(item => {
        const stored = item.data();
        const fields = Object.entries(emptyEmployee).map(([key, fallback]) => [
          key, typeof fallback === 'number' ? amount(stored[key]) : (typeof stored[key] === 'string' ? stored[key] : fallback),
        ]);
        return { ...Object.fromEntries(fields) as EmployeeFields, id: item.id };
      }).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
      publish(firstEmployee);
      firstEmployee = false;
    }, fail));
    stops.push(onSnapshot(doc(db, 'settings', 'payroll'), snapshot => {
      data.rates = { ...defaultRates, ...snapshot.data() };
      publish(firstRates);
      firstRates = false;
    }, fail));
    stops.push(onSnapshot(query(collection(db, 'requests'), where('status', '==', 'Đã duyệt')), snapshot => {
      data.requests = snapshot.docs.map(item => item.data() as PayrollRequest);
      publish(firstRequest);
      firstRequest = false;
    }, fail));
  }
  return () => stops.forEach(stop => stop());
}

export function approvedAdvance(requests: PayrollRequest[], email: string, month: string) {
  if (!email) return 0;
  return requests.filter(request => request.type === 'Tạm ứng lương' && request.createdBy === email &&
    (request.month || (typeof request.createdAt === 'string' ? request.createdAt.slice(0, 7) : undefined)) === month)
    .reduce((sum, request) => sum + amount(request.amount), 0);
}

export async function saveEmployee(email: string, fields: EmployeeFields, id?: string) {
  const ref = id ? doc(db, 'employees', id) : doc(collection(db, 'employees'));
  const now = new Date().toISOString();
  await setDoc(ref, { ...fields, updatedAt: now, updatedBy: email, ...(!id && { createdAt: now }) }, { merge: true });
}

export async function confirmOwnPayslip(email: string, reviewedSlip: Payslip) {
  const ref = doc(db, 'payroll', reviewedSlip.id);
  await runTransaction(db, async transaction => {
    const slip = (await transaction.get(ref)).data();
    if (slip?.email !== email || slip.status !== 'Đã chốt' || slip.lockedAt !== reviewedSlip.lockedAt) {
      throw new Error('Phiếu lương đã thay đổi. Hãy mở lại phiếu để kiểm tra.');
    }
    if (!slip.employeeConfirmedAt) transaction.update(ref, { employeeConfirmedAt: new Date().toISOString() });
  });
}

export async function writePayroll(email: string, month: string, employees: Employee[], data: PayrollData,
  action: 'save' | 'lock' | 'reopen' | 'attendance', inputByEmployee = new Map<string, Partial<PayInputs>>()) {
  if (employees.length > 500) throw new Error('Bảng lương vượt giới hạn 500 dòng cho một lần cập nhật.');
  return runTransaction(db, async transaction => {
    const snapshots = await Promise.all(employees.map(employee =>
      transaction.get(doc(db, 'payroll', month + '_' + employee.id))));
    const now = new Date().toISOString();
    let count = 0;
    snapshots.forEach((snapshot, index) => {
      const employee = employees[index];
      const previous = snapshot.data() as Payslip | undefined;
      if (action === 'reopen') {
        if (previous?.status !== 'Đã chốt') throw new Error('Trạng thái dòng lương đã thay đổi.');
        transaction.update(snapshot.ref, { status: 'Nháp', employeeConfirmedAt: deleteField(), updatedAt: now, updatedBy: email });
      } else {
        if (locked(previous)) {
          if (action === 'save') throw new Error('Dòng lương đã được chốt.');
          return;
        }
        const pay = calculatePay(employee, { ...previous, ...inputByEmployee.get(employee.id) }, month,
          data.rates, approvedAdvance(data.requests, employee.email, month));
        transaction.set(snapshot.ref, {
          ...pay, month, empId: employee.id, name: employee.name, email: employee.email,
          status: action === 'lock' ? 'Đã chốt' : 'Nháp', updatedAt: now, updatedBy: email,
          ...(action === 'lock' && { lockedAt: now, lockedBy: email, employeeConfirmedAt: deleteField() }),
        }, { merge: true });
      }
      count++;
    });
    return count;
  });
}

export async function importAttendance(email: string, month: string, employees: Employee[], data: PayrollData) {
  const today = todayInVietnam();
  const dates = monthDays(month);
  const [snapshot, schedule] = await Promise.all([
    getDocsFromServer(query(collection(db, 'attendance'), where('date', '>=', dates[0]), where('date', '<=', dates[dates.length - 1]))),
    getDocFromServer(doc(db, 'settings', 'work')),
  ]);
  const rawSchedule = schedule.data();
  const work = { ...defaultSchedule, ...rawSchedule, days: { ...defaultSchedule.days, ...rawSchedule?.days } };
  const records = new Map(snapshot.docs.map(item => {
    const record = { ...item.data(), id: item.id } as Attendance;
    return [attendanceId(record.email, record.date), record];
  }));
  const inputs = new Map<string, Partial<PayInputs>>();
  const skipped: string[] = [];
  for (const employee of employees) {
    const { days, summary } = attendanceMonth(employee.email, month, today, work, records, data.requests, work.attStart);
    const standardDays = days.reduce((total, day) => total + day.weight, 0);
    if (!employee.email || !standardDays || days.some(day => day.result?.flag === 'Cần xác minh giờ vào/ra')) {
      skipped.push(employee.name);
      continue;
    }
    inputs.set(employee.id, { workDays: summary.work + summary.leave, standardDays });
  }
  const count = await writePayroll(email, month, employees.filter(employee => inputs.has(employee.id)), data, 'attendance', inputs);
  return { count, skipped };
}

export async function createPayrollExpenses(email: string, month: string) {
  const snapshot = await getDocsFromServer(query(collection(db, 'payroll'), where('month', '==', month)));
  const selected = snapshot.docs.filter(item => item.get('status') !== 'Đã trả');
  const needsConfirmation = 'Hãy chốt bảng lương và đợi nhân viên xác nhận phiếu trước khi tạo đề nghị chi.';
  if (!selected.length) throw new Error(needsConfirmation);
  if (selected.length > 497) throw new Error('Kỳ lương vượt giới hạn số khoản chi trong một lần tạo.');
  return runTransaction(db, async transaction => {
    const slips = await Promise.all(selected.map(row => transaction.get(row.ref)));
    const current = slips.map(item => ({ ...item.data(), id: item.id }) as Payslip);
    if (current.some(row => row.status !== 'Đã chốt' || row.month !== month || !row.employeeConfirmedAt)) {
      throw new Error(needsConfirmation);
    }
    if (current.some(row => row.net < 0)) throw new Error('Có dòng thực lĩnh âm. Hãy đối chiếu bảng lương trước khi tạo khoản chi.');
    const expenses = payrollExpenses(month, current);
    const existing = await Promise.all(expenses.map(row => transaction.get(doc(db, 'cash', row.id))));
    const now = new Date().toISOString();
    let count = 0;
    expenses.forEach(({ id, ...fields }, index) => {
      const previous = existing[index].data();
      if (previous) {
        if (amount(previous.amount) !== fields.amount) {
          throw new Error('Số tiền đã tạo ở mục Thu chi khác với bảng lương. Hãy đối chiếu các khoản chi của kỳ này.');
        }
        return;
      }
      transaction.set(existing[index].ref, { ...fields, createdBy: email, updatedBy: email, createdAt: now, updatedAt: now });
      count++;
    });
    return count;
  });
}
