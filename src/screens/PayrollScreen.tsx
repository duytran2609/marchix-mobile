import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/Button';
import { Dropdown } from '../components/Dropdown';
import { SegmentedButtons } from '../components/SegmentedButtons';
import { useToast } from '../components/Toast';
import { EmployeeForm, PayBreakdown, PayEditor, PayrollModal } from '../features/payroll/PayrollForms';
import { PayrollTable } from '../features/payroll/PayrollTable';
import { exportPayroll, exportPayslip } from '../features/payroll/exportPayroll';
import { amount, calculatePay, locked, money, monthLabel } from '../features/payroll/payroll';
import type { PayrollRow } from '../features/payroll/payrollColumns';
import { approvedAdvance, confirmOwnPayslip, createPayrollExpenses, importAttendance, saveEmployee, watchPayroll, writePayroll } from '../features/payroll/payrollStore';
import type { Payslip } from '../features/payroll/payroll';
import type { PayrollData } from '../features/payroll/payrollStore';
import { formatTaskDate, todayInVietnam } from '../features/tasks/taskDates';
import { useScreenStyles } from '../theme/screenStyles';
import { useTheme } from '../theme/theme';

type Editor = { kind: 'employee'; id?: string } | { kind: 'pay'; id: string };
type Confirmation = { title: string; message: string; confirmLabel?: string; submit: () => void };

const sections = [
  { value: 'payroll', label: 'Bảng lương' },
  { value: 'employees', label: 'Hồ sơ nhân sự' },
] as const;
const monthsOfYear = Array.from({ length: 12 }, (_, index) => {
  const value = String(index + 1).padStart(2, '0');
  return { value, label: 'Tháng ' + value };
});

export function PayrollScreen({ email, isAdmin }: { email: string; isAdmin: boolean }) {
  const styles = useScreenStyles();
  const { colors } = useTheme();
  const showToast = useToast();
  const [data, setData] = useState<PayrollData>();
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const currentMonth = todayInVietnam().slice(0, 7);
  const [selectedPeriod, setMonth] = useState<string>();
  const month = selectedPeriod ?? currentMonth;
  const [historyMonth, setHistoryMonth] = useState<string>();
  const [section, setSection] = useState<'payroll' | 'employees'>('payroll');
  const [editor, setEditor] = useState<Editor>();
  const [confirmation, setConfirmation] = useState<Confirmation>();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState('');

  useEffect(() => watchPayroll(email, isAdmin, setData, () => setLoadError(true)), [email, isAdmin, retry]);

  async function run(action: () => Promise<string | undefined>, closeEditor = false) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const message = await action();
      if (message) showToast(message, 'success');
      setConfirmation(undefined);
      if (closeEditor) setEditor(undefined);
    } catch (cause) {
      const known = cause instanceof Error && !('code' in cause);
      setError(known ? cause.message : 'Không thực hiện được thao tác. Vui lòng kiểm tra quyền truy cập và thử lại.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  function downloadSlip(slipMonth: string, row: PayrollRow) {
    void run(async () => {
      if (await exportPayslip(slipMonth, row)) return 'Đã mở tệp Excel phiếu lương.';
    });
  }

  function reviewSlip(slip: Payslip) {
    setEditor(undefined);
    setError('');
    setConfirmation({
      title: 'Xác nhận phiếu lương',
      message: 'Tôi đã đối chiếu và xác nhận thông tin phiếu lương tháng ' + monthLabel(slip.month) + ' là chính xác.',
      submit: () => void run(async () => {
        await confirmOwnPayslip(email, slip);
        return 'Đã xác nhận phiếu lương.';
      }),
    });
  }

  const confirmationDialog = confirmation && <PayrollModal title={confirmation.title} busy={busy} onClose={() => setConfirmation(undefined)}>
    <Text style={styles.body}>{confirmation.message}</Text>
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    <Button label={busy ? 'Đang xử lý…' : confirmation.confirmLabel ?? 'Xác nhận'} disabled={busy} onPress={confirmation.submit} />
  </PayrollModal>;

  if (loadError || !data) return <View style={styles.stack}>
    <PageHeader title={isAdmin ? 'Nhân sự & lương' : 'Phiếu lương của bạn'} />
    <View style={styles.panel}>
      {loadError ? <>
        <Text accessibilityRole="alert" style={styles.error}>Không tải được dữ liệu lương.</Text>
        <Button label="Thử lại" onPress={() => { setData(undefined); setLoadError(false); setRetry(value => value + 1); }} />
      </> : <ActivityIndicator accessibilityLabel="Đang tải phiếu lương" color={colors.accent} />}
    </View>
  </View>;

  if (!isAdmin) {
    const months = [...new Set(data.slips.map(slip => slip.month))].sort().reverse();
    const selectedMonth = historyMonth && months.includes(historyMonth) ? historyMonth : months[0];
    return <View style={styles.stack}>
      <PageHeader title="Phiếu lương của bạn" />
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {!data.slips.length && <View style={styles.panel}><Text style={styles.muted}>Chưa có phiếu lương nào được chốt.</Text></View>}
      {selectedMonth && <Dropdown label="Chọn tháng" value={selectedMonth} onChange={setHistoryMonth}
        choices={months.map(value => ({ value, label: monthLabel(value) }))} />}
      {data.slips.filter(slip => slip.month === selectedMonth).map(slip => <View key={slip.id} style={styles.panel}>
        <View style={styles.listHeader}>
          <Text style={styles.cardTitle}>Tháng {monthLabel(slip.month)}</Text>
          <Text style={styles.badge}>{slip.status}</Text>
        </View>
        <Text style={styles.label}>{slip.name}</Text>
        <PayBreakdown pay={slip} />
        {slip.status === 'Đã chốt' && (slip.employeeConfirmedAt
          ? <Text style={styles.badge}>Bạn đã xác nhận</Text>
          : <Button label="Xác nhận phiếu lương" disabled={busy} onPress={() => reviewSlip(slip)} />)}
        <Button label="Xuất phiếu lương" secondary disabled={busy}
          onPress={() => downloadSlip(slip.month, { name: slip.name, pay: slip, status: slip.status })} />
      </View>)}
      {confirmationDialog}
    </View>;
  }

  const { employees, slips, rates, requests } = data;
  const active = employees.filter(employee => employee.status !== 'Đã nghỉ');
  const monthly = slips.filter(slip => slip.month === month);
  const byEmployee = new Map(monthly.map(slip => [slip.empId, slip]));
  const rows = active.map(employee => {
    const slip = byEmployee.get(employee.id);
    const advance = approvedAdvance(requests, employee.email, month);
    const pay = slip && locked(slip) ? slip : calculatePay(employee, slip ?? {}, month, rates, advance);
    return { employee, slip, pay, advance, name: employee.name, status: slip?.status || 'Nháp' };
  });
  const employee = employees.find(item => item.id === editor?.id);
  const selected = rows.find(row => row.employee.id === editor?.id);
  const historical = monthly.filter(slip => !active.some(item => item.id === slip.empId));
  const displayRows = [
    ...rows.map(row => ({
      ...row, id: row.employee.id, onOpen: () => { setError(''); setEditor({ kind: 'pay', id: row.employee.id }); },
    })),
    ...historical.map(slip => ({ id: slip.id, name: slip.name, pay: slip, status: slip.status })),
  ];
  const recordedRows = displayRows.filter(row => 'slip' in row ? Boolean(row.slip) : true);
  const unpaid = monthly.filter(slip => slip.status !== 'Đã trả');
  const canRequestPayment = unpaid.length > 0 && unpaid.every(slip => slip.status === 'Đã chốt' && slip.employeeConfirmedAt);
  const total = (key: 'gross' | 'net' | 'companyCost') => money(displayRows.reduce((sum, row) => sum + amount(row.pay[key]), 0));
  const label = monthLabel(month);
  const hasDraft = rows.some(row => !locked(row.slip));
  const [year, monthNumber] = month.split('-');
  const currentYear = Number(currentMonth.slice(0, 4));
  const years = [...new Set([
    ...Array.from({ length: 11 }, (_, index) => String(currentYear + 5 - index)),
    ...slips.map(slip => slip.month.slice(0, 4)),
    year,
  ])].sort().reverse().map(value => ({ value, label: value }));

  return <View style={styles.stack}>
    <PageHeader title="Nhân sự & lương" />
    <SegmentedButtons label="Nhân sự & lương" value={section} choices={sections}
      onChange={value => { setError(''); setSection(value); }} />
    {section === 'employees' ? <>
      <Button label="+ Thêm nhân sự" onPress={() => { setError(''); setEditor({ kind: 'employee' }); }} />
      {!employees.length && <View style={styles.panel}><Text style={styles.muted}>Chưa có hồ sơ nhân sự.</Text></View>}
      {employees.map(item => <View key={item.id} style={styles.panel}>
        <View style={styles.listHeader}>
          <Text style={[styles.cardTitle, styles.listHeading]}>{item.name}</Text>
          <Text style={styles.badge}>{item.status || 'Đang làm'}</Text>
        </View>
        <View style={{ gap: 4 }}>
          {[
            ['Email', item.email],
            ['Chức danh', item.position],
            ['Loại hợp đồng', item.contract],
            ['Ngày vào làm', item.startDate && formatTaskDate(item.startDate)],
            ['Mã số thuế cá nhân', item.taxCode],
            ['Lương thỏa thuận', money(item.salary)],
            ['Mức lương đóng BHXH', money(item.insSalary)],
            ['Phụ cấp chịu thuế', money(item.allowTaxable)],
            ['Phụ cấp miễn thuế', money(item.allowFree)],
            ['Người phụ thuộc', amount(item.dependents)],
          ].map(([field, value]) => <Text key={field} style={[styles.muted, { lineHeight: 23 }]}>
            <Text style={[styles.metadataLabel, { fontSize: 16, fontWeight: '700' }]}>{field}: </Text>{value === '' || value == null ? '—' : value}
          </Text>)}
        </View>
        <Button label={'Sửa hồ sơ ' + item.name} secondary onPress={() => { setError(''); setEditor({ kind: 'employee', id: item.id }); }} />
      </View>)}
    </> : <>
      <View style={styles.panel}>
        <View style={styles.listHeader}>
          <Dropdown label="Chọn tháng" hideLabel highlightSelection={false} value={monthNumber} choices={monthsOfYear}
            disabled={busy} style={{ flex: 1 }} onChange={value => setMonth(year + '-' + value)} />
          <Dropdown label="Chọn năm" hideLabel highlightSelection={false} value={year} choices={years}
            disabled={busy} style={{ flex: 1 }} onChange={value => setMonth(value + '-' + monthNumber)} />
        </View>
        {!!displayRows.length && <>
          <Text style={styles.body}><Text style={styles.metadataLabel}>Tổng thu nhập: </Text>{total('gross')}</Text>
          <Text style={styles.cardTitle}><Text style={styles.metadataLabel}>Tổng thực lĩnh: </Text>{total('net')}</Text>
          <Text style={styles.body}><Text style={styles.metadataLabel}>Tổng chi phí: </Text>{total('companyCost')}</Text>
        </>}
        {hasDraft && <>
          <Button label="Lấy ngày công từ Chấm công" secondary disabled={busy} onPress={() => {
            setError('');
            setConfirmation({ title: 'Lấy ngày công', message: 'Cập nhật ngày công cho các dòng nháp kỳ ' + label + ' từ chấm công, nghỉ phép và công tác đã duyệt.',
              submit: () => void run(async () => {
                const result = await importAttendance(email, month, active.filter(item => !locked(byEmployee.get(item.id))), data);
                return 'Đã cập nhật ' + result.count + ' dòng.' + (result.skipped.length ? ' Bỏ qua ' + result.skipped.join(', ') + '.' : '');
              }) });
          }} />
          <Button label="Chốt bảng lương" disabled={busy} onPress={() => {
            setError('');
            setConfirmation({ title: 'Chốt bảng lương tháng ' + label,
              message: 'Tôi xác nhận thông tin lương tháng ' + label + ' đã được đối chiếu và chính xác. Sau khi chốt, nhân viên có thể xem và xuất phiếu lương.',
              confirmLabel: 'Xác nhận chốt',
              submit: () => void run(async () => 'Đã chốt ' + await writePayroll(email, month, active, data, 'lock') + ' dòng lương.') });
          }} />
        </>}
        <Button label="Tạo đề nghị chi lương" secondary disabled={busy || !canRequestPayment}
          onPress={() => {
            setError('');
            setConfirmation({ title: 'Tạo đề nghị chi', message: 'Tạo các khoản chi lương, bảo hiểm, công đoàn và thuế TNCN kỳ ' + label + ' từ các dòng đã chốt.',
              submit: () => void run(async () => {
                const count = await createPayrollExpenses(email, month);
                return count ? 'Đã tạo ' + count + ' khoản trong mục Thu chi.' : 'Kỳ lương này không có khoản chi mới.';
              }) });
          }} />
        {!!unpaid.length && !canRequestPayment && <Text style={styles.muted}>
          Cần chốt bảng lương và đợi nhân viên xác nhận các phiếu chưa trả.
        </Text>}
        {!!recordedRows.length && <Button label="Xuất bảng lương" secondary disabled={busy} onPress={() =>
          void run(async () => {
            if (await exportPayroll(month, recordedRows)) return 'Đã mở tệp xuất bảng lương.';
          })} />}
        {!displayRows.length && <Text style={styles.muted}>Chưa có dòng lương trong kỳ này.</Text>}
      </View>
      {!!displayRows.length && <>
        <Text style={styles.muted}>Vuốt ngang để xem đủ các cột. Chạm vào họ tên để mở dòng lương.</Text>
        <PayrollTable rows={displayRows} />
      </>}
    </>}
    {!!error && !editor && !confirmation && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {editor && (editor.kind === 'employee' || selected) && <PayrollModal busy={busy} onClose={() => setEditor(undefined)}
      title={editor.kind === 'employee' ? (editor.id ? 'Sửa hồ sơ nhân sự' : 'Thêm nhân sự') : 'Lương tháng ' + label + ': ' + selected?.name}>
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {editor.kind === 'employee' ? <EmployeeForm employee={employee} busy={busy} onSave={fields =>
        void run(async () => { await saveEmployee(email, fields, editor.id); return 'Đã lưu hồ sơ nhân sự.'; }, true)} />
      : selected && <><PayEditor employee={selected.employee} pay={selected.pay} rates={rates} month={month} advance={selected.advance}
        slip={selected.slip} busy={busy} onSave={input => void run(async () => {
          await writePayroll(email, month, [selected.employee], data, 'save', new Map([[selected.employee.id, input]]));
          return 'Đã lưu dòng lương.';
        }, true)} onReopen={() => void run(async () => {
          await writePayroll(email, month, [selected.employee], data, 'reopen');
          return 'Đã mở lại dòng lương.';
        }, true)} />
        {locked(selected.slip) && <Button label="Xuất phiếu lương" secondary disabled={busy}
          onPress={() => downloadSlip(month, selected)} />}
        {selected.slip?.status === 'Đã chốt' && selected.slip.email === email && !selected.slip.employeeConfirmedAt &&
          <Button label="Xác nhận phiếu lương" disabled={busy} onPress={() => reviewSlip(selected.slip!)} />}
      </>}
    </PayrollModal>}
    {confirmationDialog}
  </View>;
}
