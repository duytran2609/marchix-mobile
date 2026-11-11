import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/Button';
import { useToast } from '../components/Toast';
import { offsetMonth } from '../features/attendance/attendance';
import { EmployeeForm, PayBreakdown, PayEditor, PayrollModal } from '../features/payroll/PayrollForms';
import { exportPayroll } from '../features/payroll/exportPayroll';
import { amount, calculatePay, locked, money, monthLabel } from '../features/payroll/payroll';
import { approvedAdvance, createPayrollExpenses, importAttendance, saveEmployee, watchPayroll, writePayroll } from '../features/payroll/payrollStore';
import type { PayrollData } from '../features/payroll/payrollStore';
import { todayInVietnam } from '../features/tasks/taskDates';
import { useScreenStyles } from '../theme/screenStyles';
import { useTheme } from '../theme/theme';

type Editor = { kind: 'employee'; id?: string } | { kind: 'pay'; id: string };
type Confirmation = { title: string; message: string; submit: () => void };

export function PayrollScreen({ email, isAdmin }: { email: string; isAdmin: boolean }) {
  const styles = useScreenStyles();
  const { colors } = useTheme();
  const showToast = useToast();
  const [data, setData] = useState<PayrollData>();
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const currentMonth = todayInVietnam().slice(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const [section, setSection] = useState<'payroll' | 'employees'>('payroll');
  const [editor, setEditor] = useState<Editor>();
  const [confirmation, setConfirmation] = useState<Confirmation>();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState('');

  useEffect(() => watchPayroll(email, isAdmin, setData, () => setLoadError(true)), [email, isAdmin, retry]);

  async function run(action: () => Promise<string>, closeEditor = false) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      showToast(await action(), 'success');
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

  if (loadError || !data) return <View style={styles.stack}>
    <PageHeader title={isAdmin ? 'Nhân sự & lương' : 'Phiếu lương của bạn'} />
    <View style={styles.panel}>
      {loadError ? <>
        <Text accessibilityRole="alert" style={styles.error}>Không tải được dữ liệu lương.</Text>
        <Button label="Thử lại" onPress={() => { setData(undefined); setLoadError(false); setRetry(value => value + 1); }} />
      </> : <ActivityIndicator accessibilityLabel="Đang tải phiếu lương" color={colors.accent} />}
    </View>
  </View>;

  if (!isAdmin) return <View style={styles.stack}>
    <PageHeader title="Phiếu lương của bạn" />
    {!data.slips.length && <View style={styles.panel}><Text style={styles.muted}>Chưa có phiếu lương nào được chốt.</Text></View>}
    {data.slips.map(slip => <View key={slip.id} style={styles.panel}>
      <View style={styles.listHeader}>
        <Text style={styles.cardTitle}>Tháng {monthLabel(slip.month)}</Text>
        <Text style={styles.badge}>{slip.status}</Text>
      </View>
      <PayBreakdown pay={slip} />
    </View>)}
  </View>;

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
  const displayRows = [...rows, ...historical.map(slip => ({ name: slip.name, pay: slip, status: slip.status }))];
  const total = (key: 'gross' | 'net' | 'companyCost') => money(displayRows.reduce((sum, row) => sum + amount(row.pay[key]), 0));
  const label = monthLabel(month);
  const hasDraft = rows.some(row => !locked(row.slip));

  return <View style={styles.stack}>
    <PageHeader title="Nhân sự & lương" />
    <View style={styles.choices}>
      {([['payroll', 'Bảng lương'], ['employees', 'Hồ sơ nhân sự']] as const).map(([value, title]) =>
        <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: section === value }}
          style={[styles.choice, section === value && styles.selected]} onPress={() => { setError(''); setSection(value); }}>
          <Text style={styles.label}>{title}</Text>
        </Pressable>)}
    </View>
    {section === 'employees' ? <>
      <Button label="+ Thêm nhân sự" onPress={() => { setError(''); setEditor({ kind: 'employee' }); }} />
      {!employees.length && <View style={styles.panel}><Text style={styles.muted}>Chưa có hồ sơ nhân sự.</Text></View>}
      {employees.map(item => <View key={item.id} style={styles.panel}>
        <View style={styles.listHeader}>
          <Text style={[styles.cardTitle, styles.listHeading]}>{item.name}</Text>
          <Text style={styles.badge}>{item.status || 'Đang làm'}</Text>
        </View>
        <Text style={styles.muted}>{[item.email, item.position, item.contract].filter(Boolean).join(' · ')}</Text>
        <Text style={styles.body}>Lương thỏa thuận · {money(item.salary)}</Text>
        <Text style={styles.muted}>Lương đóng BH · {money(item.insSalary)}</Text>
        <Text style={styles.muted}>Phụ cấp · {money(amount(item.allowTaxable) + amount(item.allowFree))} · Người phụ thuộc · {amount(item.dependents)}</Text>
        <Button label={'Sửa hồ sơ ' + item.name} secondary onPress={() => { setError(''); setEditor({ kind: 'employee', id: item.id }); }} />
      </View>)}
    </> : <>
      <View style={styles.panel}>
        <View style={styles.listHeader}>
          <Pressable accessibilityRole="button" accessibilityLabel="Tháng trước" accessibilityState={{ disabled: busy }}
            style={styles.choice} disabled={busy} onPress={() => setMonth(value => offsetMonth(value, -1))}>
            <Text style={styles.label}>‹</Text>
          </Pressable>
          <Text accessibilityRole="header" style={[styles.cardTitle, styles.listHeading]}>Tháng {label}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Tháng sau" accessibilityState={{ disabled: busy }}
            style={styles.choice} disabled={busy} onPress={() => setMonth(value => offsetMonth(value, 1))}>
            <Text style={styles.label}>›</Text>
          </Pressable>
        </View>
        {!!displayRows.length && <>
          <Text style={styles.body}>Tổng thu nhập · {total('gross')}</Text>
          <Text style={styles.cardTitle}>Tổng thực lĩnh · {total('net')}</Text>
          <Text style={styles.body}>Tổng chi phí · {total('companyCost')}</Text>
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
            setConfirmation({ title: 'Chốt bảng lương', message: 'Chốt các dòng nháp kỳ ' + label + ' để nhân viên có thể xem phiếu lương.',
              submit: () => void run(async () => 'Đã chốt ' + await writePayroll(email, month, active, data, 'lock') + ' dòng lương.') });
          }} />
        </>}
        {monthly.some(slip => slip.status === 'Đã chốt') && <Button label="Tạo đề nghị chi lương & BHXH" secondary disabled={busy}
          onPress={() => {
            setError('');
            setConfirmation({ title: 'Tạo đề nghị chi', message: 'Tạo các khoản chi lương, bảo hiểm, công đoàn và thuế TNCN kỳ ' + label + ' từ các dòng đã chốt.',
              submit: () => void run(async () => {
                const count = await createPayrollExpenses(email, month, monthly);
                return count ? 'Đã tạo ' + count + ' khoản trong mục Thu chi.' : 'Kỳ lương này không có khoản chi mới.';
              }) });
          }} />}
        {!!displayRows.length && <Button label="Xuất Excel" secondary disabled={busy} onPress={() =>
          void run(async () => { await exportPayroll(month, displayRows); return 'Đã mở tệp xuất bảng lương.'; })} />}
        {!displayRows.length && <Text style={styles.muted}>Chưa có dòng lương trong kỳ này.</Text>}
      </View>
      {rows.map(row => <View key={row.employee.id} style={styles.panel}>
        <View style={styles.listHeader}>
          <Text style={[styles.cardTitle, styles.listHeading]}>{row.name}</Text>
          <Text style={styles.badge}>{row.status}</Text>
        </View>
        <Text style={styles.muted}>Ngày công · {row.pay.workDays} / {row.pay.standardDays}</Text>
        <Text style={styles.body}>Thực lĩnh · {money(row.pay.net)}</Text>
        <Button label={'Xem dòng lương ' + row.name} secondary disabled={busy}
          onPress={() => { setError(''); setEditor({ kind: 'pay', id: row.employee.id }); }} />
      </View>)}
      {historical.map(slip => <View key={slip.id} style={styles.panel}>
        <View style={styles.listHeader}>
          <Text style={[styles.cardTitle, styles.listHeading]}>{slip.name}</Text>
          <Text style={styles.badge}>{slip.status}</Text>
        </View>
        <PayBreakdown pay={slip} admin />
      </View>)}
    </>}
    {!!error && !editor && !confirmation && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {editor && (editor.kind === 'employee' || selected) && <PayrollModal busy={busy} onClose={() => setEditor(undefined)}
      title={editor.kind === 'employee' ? (editor.id ? 'Sửa hồ sơ nhân sự' : 'Thêm nhân sự') : 'Lương tháng ' + label + ' · ' + selected?.name}>
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {editor.kind === 'employee' ? <EmployeeForm employee={employee} busy={busy} onSave={fields =>
        void run(async () => { await saveEmployee(email, fields, editor.id); return 'Đã lưu hồ sơ nhân sự.'; }, true)} />
      : selected && <PayEditor employee={selected.employee} pay={selected.pay} rates={rates} month={month} advance={selected.advance}
        slip={selected.slip} busy={busy} onSave={input => void run(async () => {
          await writePayroll(email, month, [selected.employee], data, 'save', new Map([[selected.employee.id, input]]));
          return 'Đã lưu dòng lương.';
        }, true)} onReopen={() => void run(async () => {
          await writePayroll(email, month, [selected.employee], data, 'reopen');
          return 'Đã mở lại dòng lương.';
        }, true)} />}
    </PayrollModal>}
    {confirmation && <PayrollModal title={confirmation.title} busy={busy} onClose={() => setConfirmation(undefined)}>
      <Text style={styles.body}>{confirmation.message}</Text>
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <Button label={busy ? 'Đang xử lý…' : 'Xác nhận'} disabled={busy} onPress={confirmation.submit} />
    </PayrollModal>}
  </View>;
}
