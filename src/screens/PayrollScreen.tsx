import { EmptyState } from '../components/EmptyState';
import { PaginatedList } from '../components/PaginatedList';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/Button';
import { PopupAction, PopupBody } from '../components/PopupBody';
import { Dropdown } from '../components/Dropdown';
import { SegmentedButtons } from '../components/SegmentedButtons';
import { useToast } from '../components/Toast';
import { EmployeeForm, PayBreakdown, PayEditor, PayrollModal } from '../features/payroll/PayrollForms';
import { EmployeeTable, PayrollTable } from '../features/payroll/PayrollTable';
import { exportPayroll, exportPayslip } from '../features/payroll/exportPayroll';
import { amount, calculatePay, locked, money, monthLabel, recordedAdvanceRequests } from '../features/payroll/payroll';
import type { PayrollRow } from '../features/payroll/payrollColumns';
import { approvedAdvanceRequests, confirmOwnPayslip, createPayrollExpenses, saveEmployee, watchPayroll, writePayroll } from '../features/payroll/payrollStore';
import type { Payslip } from '../features/payroll/payroll';
import type { PayrollData } from '../features/payroll/payrollStore';
import { todayInVietnam } from '../features/tasks/taskDates';
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

export function PayrollScreen({ email, isAdmin, initialMonth, onOpenAdvance }: {
  email: string; isAdmin: boolean; initialMonth?: string;
  onOpenAdvance: (requestId: string, month: string) => void;
}) {
  const styles = useScreenStyles();
  const { colors } = useTheme();
  const showToast = useToast();
  const [data, setData] = useState<PayrollData>();
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const currentMonth = todayInVietnam().slice(0, 7);
  const [selectedPeriod, setMonth] = useState(initialMonth);
  const month = selectedPeriod ?? currentMonth;
  const [historyMonth, setHistoryMonth] = useState(initialMonth);
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
    <PopupBody inset={false} contentContainerStyle={styles.stack}
      footer={<PopupAction label={busy ? 'Đang xử lý…' : confirmation.confirmLabel ?? 'Xác nhận'}
        disabled={busy} onPress={confirmation.submit} />}>
      <Text style={styles.body}>{confirmation.message}</Text>
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    </PopupBody>
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
      {!data.slips.length && <View style={styles.panel}><EmptyState icon="wallet" message="Chưa có phiếu lương nào được chốt." /></View>}
      {selectedMonth && <Dropdown label="Chọn tháng" value={selectedMonth} onChange={setHistoryMonth}
        choices={months.map(value => ({ value, label: monthLabel(value) }))} />}
      <PaginatedList items={data.slips.filter(slip => slip.month === selectedMonth)} resetKey={selectedMonth}>
        {pageItems => pageItems.map(slip => <View key={slip.id} style={styles.stack}>
          <View style={styles.listHeader}>
            <Text style={styles.cardTitle}>Tháng {monthLabel(slip.month)}</Text>
            <Text style={styles.badge}>{slip.status}</Text>
          </View>
          <PayBreakdown pay={slip} employeeName={slip.name} advances={recordedAdvanceRequests(slip)}
            onOpenAdvance={id => onOpenAdvance(id, slip.month)} />
          {slip.status === 'Đã chốt' && (slip.employeeConfirmedAt
            ? <Text style={styles.badge}>Bạn đã xác nhận</Text>
            : <Button label="Xác nhận phiếu lương" disabled={busy} onPress={() => reviewSlip(slip)} />)}
          <Button label="Xuất phiếu lương" secondary disabled={busy}
            onPress={() => downloadSlip(slip.month, { name: slip.name, pay: slip, status: slip.status })} />
        </View>)}
      </PaginatedList>
      {confirmationDialog}
    </View>;
  }

  const { employees, slips, rates, requests } = data;
  const active = employees.filter(employee => employee.status !== 'Đã nghỉ');
  const monthly = slips.filter(slip => slip.month === month);
  const byEmployee = new Map(monthly.map(slip => [slip.empId, slip]));
  const rows = active.map(employee => {
    const slip = byEmployee.get(employee.id);
    if (slip && locked(slip)) {
      return { employee, slip, pay: slip, advances: recordedAdvanceRequests(slip), name: employee.name, status: slip.status };
    }
    const advances = approvedAdvanceRequests(requests, employee.email, month);
    const pay = calculatePay(employee, slip ?? {}, month, rates, advances.reduce((sum, entry) => sum + entry.amount, 0));
    return { employee, slip, pay, advances, name: employee.name, status: 'Nháp' };
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
      {employees.length ? <>
        <Text style={styles.muted}>Vuốt ngang để xem đủ các cột. Chạm vào họ tên để sửa hồ sơ.</Text>
        <EmployeeTable employees={employees} onEdit={id => { setError(''); setEditor({ kind: 'employee', id }); }} />
      </> : <View style={styles.panel}><EmptyState icon="people" message="Chưa có hồ sơ nhân sự." /></View>}
    </> : <>
      <View style={styles.panel}>
        <View style={styles.listHeader}>
          <Dropdown label="Chọn tháng" hideLabel highlightSelection={false} value={monthNumber} choices={monthsOfYear}
            disabled={busy} style={{ flex: 1 }} onChange={value => setMonth(year + '-' + value)} />
          <Dropdown label="Chọn năm" hideLabel highlightSelection={false} value={year} choices={years}
            disabled={busy} style={{ flex: 1 }} onChange={value => setMonth(value + '-' + monthNumber)} />
        </View>
        {!!displayRows.length && <>
          <Text style={styles.cardTitle}>
            <Text style={styles.metadataLabel}>Tổng thực nhận: </Text>
            <Text style={[styles.metadataValue, { fontSize: 24 }]}>{total('net')}</Text>
          </Text>
          <Text style={[styles.body, styles.metadataValue]}>
            <Text style={styles.metadataLabel}>Tổng thu nhập: </Text>
            <Text style={{ color: colors.success }}>{total('gross')}</Text>
          </Text>
          <Text style={[styles.body, styles.metadataValue]}>
            <Text style={styles.metadataLabel}>Tổng chi phí: </Text>
            <Text style={{ color: colors.danger }}>{total('companyCost')}</Text>
          </Text>
        </>}
        {hasDraft &&
          <Button label="Chốt bảng lương" disabled={busy} onPress={() => {
            setError('');
            setConfirmation({ title: 'Chốt bảng lương tháng ' + label,
              message: 'Tôi xác nhận thông tin lương tháng ' + label + ' đã được đối chiếu và chính xác. Sau khi chốt, nhân viên có thể xem và xuất phiếu lương.',
              confirmLabel: 'Xác nhận chốt',
              submit: () => void run(async () => 'Đã chốt ' + await writePayroll(email, month, active, data, 'lock') + ' dòng lương.') });
          }} />
        }
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
        {!displayRows.length && <EmptyState icon="wallet" message="Chưa có dòng lương trong kỳ này." />}
      </View>
      {!!displayRows.length && <>
        <Text style={styles.muted}>Vuốt ngang để xem đủ các cột. Chạm vào họ tên để mở dòng lương.</Text>
        <PayrollTable month={month} rows={displayRows} />
        <Button label="Xuất Excel" secondary disabled={busy} onPress={() =>
          void run(async () => {
            if (await exportPayroll(month, displayRows)) return 'Đã mở tệp xuất bảng lương.';
          })} />
      </>}
    </>}
    {!!error && !editor && !confirmation && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {editor && (editor.kind === 'employee' || selected) && <PayrollModal busy={busy} onClose={() => setEditor(undefined)}
      title={editor.kind === 'employee' ? (editor.id ? 'Sửa hồ sơ nhân sự' : 'Thêm nhân sự') : 'Lương tháng ' + label + ': ' + selected?.name}>
      {editor.kind === 'employee' ? <EmployeeForm employee={employee} busy={busy} saveError={error} onSave={fields =>
        void run(async () => { await saveEmployee(email, fields, editor.id); return 'Đã lưu hồ sơ nhân sự.'; }, true)} />
      : selected && <PayEditor employee={selected.employee} pay={selected.pay} rates={rates} month={month} advances={selected.advances}
        saveError={error}
        onOpenAdvance={id => onOpenAdvance(id, month)}
        slip={selected.slip} busy={busy} onSave={input => void run(async () => {
          await writePayroll(email, month, [selected.employee], data, 'save', new Map([[selected.employee.id, input]]));
          return 'Đã lưu dòng lương.';
        }, true)} onReopen={() => void run(async () => {
          await writePayroll(email, month, [selected.employee], data, 'reopen');
          return 'Đã mở lại dòng lương.';
        }, true)} actions={<>
        {locked(selected.slip) && <PopupAction label="Xuất phiếu lương" secondary disabled={busy}
          onPress={() => downloadSlip(month, selected)} />}
        {selected.slip?.status === 'Đã chốt' && selected.slip.email === email && !selected.slip.employeeConfirmedAt &&
          <PopupAction label="Xác nhận phiếu lương" disabled={busy} onPress={() => reviewSlip(selected.slip!)} />}
        </>} />}
    </PayrollModal>}
    {confirmationDialog}
  </View>;
}
