import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/Button';
import { PopupCloseButton } from '../../components/PopupCloseButton';
import { useScreenStyles } from '../../theme/screenStyles';
import { useTheme } from '../../theme/theme';
import { amount, calculatePay, contracts, employeeStatuses, emptyEmployee, locked, money } from './payroll';
import type { Employee, EmployeeFields, PayAmounts, PayInputs, Payslip, Rates } from './payroll';
import { payrollMetrics, payrollMoney, payrollWork } from './payrollColumns';

export function PayBreakdown({ pay }: { pay: PayAmounts }) {
  const styles = useScreenStyles();
  return <View style={styles.stack}>
    <PayMetric label="Công" value={payrollWork(pay)} />
    {payrollMetrics.map(({ label, get }) => <PayMetric key={label} label={label} value={payrollMoney(get(pay))} />)}
  </View>;
}

function PayMetric({ label, value }: { label: string; value: string }) {
  const styles = useScreenStyles();
  return <View style={[styles.detailRow, styles.listHeader]}>
    <Text style={[styles.muted, styles.listHeading]}>{label}</Text>
    <Text style={label === 'Thực lĩnh' ? styles.cardTitle : styles.label}>{value}</Text>
  </View>;
}

export function PayrollModal({ title, busy, onClose, children }: {
  title: string; busy: boolean; onClose: () => void; children: React.ReactNode;
}) {
  const styles = useScreenStyles();
  const { colors } = useTheme();
  return <Modal visible animationType="fade" onRequestClose={() => { if (!busy) onClose(); }}>
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
        <View style={styles.page}>
          <View style={styles.panel}>
            <View style={styles.listHeader}>
              <Text accessibilityRole="header" style={[styles.heading, styles.listHeading]}>{title}</Text>
              <PopupCloseButton label="Đóng" onPress={onClose} disabled={busy} />
            </View>
            {children}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

const employeeTextFields = [
  ['name', 'Họ tên'], ['email', 'Email nhận phiếu lương'], ['position', 'Chức danh'],
  ['startDate', 'Ngày vào làm (YYYY-MM-DD)'], ['taxCode', 'Mã số thuế cá nhân'],
] as const;
const employeeNumbers = [
  ['salary', 'Lương thỏa thuận / tháng'], ['insSalary', 'Mức lương đóng BHXH'],
  ['allowTaxable', 'Phụ cấp chịu thuế / tháng'], ['allowFree', 'Phụ cấp không chịu thuế / tháng'],
  ['dependents', 'Số người phụ thuộc'],
] as const;
const payFields = [
  ['workDays', 'Ngày công thực tế'], ['standardDays', 'Ngày công chuẩn'],
  ['bonus', 'Thưởng / khoản thêm'], ['deduction', 'Khấu trừ khác'],
] as const;

function TextField({ label, value, onChange, busy, keyboardType }: {
  label: string; value: string; onChange: (value: string) => void; busy: boolean;
  keyboardType?: 'email-address' | 'decimal-pad' | 'number-pad';
}) {
  const styles = useScreenStyles();
  return <View style={{ gap: 5 }}>
    <Text style={styles.label}>{label}</Text>
    <TextInput style={styles.input} accessibilityLabel={label} value={value} onChangeText={onChange}
      editable={!busy} keyboardType={keyboardType} autoCapitalize={keyboardType ? 'none' : 'sentences'} maxLength={250} />
  </View>;
}

export function EmployeeForm({ employee, busy, onSave }: {
  employee?: Employee; busy: boolean; onSave: (fields: EmployeeFields) => void;
}) {
  const styles = useScreenStyles();
  const [fields, setFields] = useState({ ...emptyEmployee, ...employee });
  const [numbers, setNumbers] = useState(() => Object.fromEntries(employeeNumbers.map(([key]) => [key, String(fields[key])])));
  const [error, setError] = useState('');
  const change = (key: keyof EmployeeFields, value: string) => setFields(current => ({ ...current, [key]: value }));
  function save() {
    const { name, email, position, startDate, taxCode, contract, status } = fields;
    const normalizedEmail = email.trim().toLowerCase();
    if (!name.trim() || (normalizedEmail && !/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(normalizedEmail))) {
      setError('Nhập họ tên và kiểm tra địa chỉ email.');
      return;
    }
    if (startDate && (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
      !Number.isFinite(Date.parse(startDate)) || new Date(startDate).toISOString().slice(0, 10) !== startDate)) {
      setError('Nhập ngày vào làm hợp lệ theo định dạng YYYY-MM-DD.');
      return;
    }
    if (Object.values(numbers).some(value => !/^\d*$/.test(value) || !Number.isSafeInteger(Number(value)))) {
      setError('Lương, phụ cấp và số người phụ thuộc phải là số nguyên không âm.');
      return;
    }
    onSave({ name: name.trim(), email: normalizedEmail, position: position.trim(), startDate, taxCode: taxCode.trim(),
      contract, status, salary: Number(numbers.salary), insSalary: Number(numbers.insSalary),
      allowTaxable: Number(numbers.allowTaxable), allowFree: Number(numbers.allowFree), dependents: Number(numbers.dependents) });
  }
  return <>
    {employeeTextFields.map(([key, label]) => <TextField key={key} label={label} value={fields[key]}
      onChange={value => change(key, value)} busy={busy} keyboardType={key === 'email' ? 'email-address' : undefined} />)}
    {([['contract', 'Loại hợp đồng', contracts], ['status', 'Tình trạng', employeeStatuses]] as const).map(([key, label, items]) =>
      <View key={key} style={styles.stack}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.choices}>{items.map(item =>
          <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: item === fields[key] }}
            disabled={busy} onPress={() => change(key, item)} style={[styles.choice, item === fields[key] && styles.selected]}>
            <Text style={styles.label}>{item}</Text>
          </Pressable>)}</View>
      </View>)}
    {employeeNumbers.map(([key, label]) => <TextField key={key} label={label} value={numbers[key]} busy={busy}
      keyboardType="number-pad" onChange={value => setNumbers(current => ({ ...current, [key]: value }))} />)}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    <Button label="Lưu hồ sơ" disabled={busy} onPress={save} />
  </>;
}

export function PayEditor({ employee, month, rates, advance, slip, pay, busy, onSave, onReopen }: {
  employee: Employee; month: string; rates: Rates; advance: number; slip?: Payslip; pay: PayAmounts;
  busy: boolean; onSave: (input: PayInputs) => void; onReopen: () => void;
}) {
  const styles = useScreenStyles();
  const [input, setInput] = useState(() => Object.fromEntries(payFields.map(([key]) => [key, String(amount(pay[key]))])));
  const values = {
    workDays: Number(input.workDays.replace(',', '.')), standardDays: Number(input.standardDays.replace(',', '.')),
    bonus: Number(input.bonus), deduction: Number(input.deduction),
  };
  const [error, setError] = useState('');
  const valid = /^\d+(?:[.,]\d+)?$/.test(input.workDays) && /^\d+(?:[.,]\d+)?$/.test(input.standardDays)
    && values.workDays <= 31 && values.standardDays > 0 && values.standardDays <= 31
    && [input.bonus, input.deduction].every(value => /^\d*$/.test(value) && Number.isSafeInteger(Number(value)));
  const isLocked = locked(slip);
  const preview = !isLocked && valid ? calculatePay(employee, values, month, rates, advance) : pay;
  return <>
    <Text style={styles.badge}>{slip?.status || 'Nháp'}</Text>
    {!isLocked && payFields.map(([key, label]) => <TextField key={key} label={label} value={input[key]} busy={busy}
      keyboardType={key === 'workDays' || key === 'standardDays' ? 'decimal-pad' : 'number-pad'}
      onChange={value => { setError(''); setInput(current => ({ ...current, [key]: value })); }} />)}
    <PayBreakdown pay={preview} />
    <Text style={styles.muted}>Thu nhập tính thuế · {money(preview.taxable)} · Tạm ứng đã duyệt · {money(preview.advance)}</Text>
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {isLocked ? slip?.status === 'Đã chốt' && <Button label="Mở lại dòng lương" secondary disabled={busy} onPress={onReopen} />
      : <Button label="Lưu dòng lương" disabled={busy} onPress={() => {
        if (valid) onSave(values);
        else setError('Nhập số ngày công hợp lệ từ 0 đến 31, công chuẩn lớn hơn 0 và các khoản tiền không âm.');
      }} />}
  </>;
}
