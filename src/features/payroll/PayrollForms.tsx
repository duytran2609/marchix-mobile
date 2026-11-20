import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardScrollView } from '../../components/KeyboardScrollView';
import { KeyboardViewport } from '../../components/KeyboardViewport';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { Dropdown } from '../../components/Dropdown';
import { FieldLabel } from '../../components/FieldLabel';
import { NumberStepper } from '../../components/NumberStepper';
import type { NumberStepBounds } from '../../components/NumberStepper';
import { PopupCloseButton } from '../../components/PopupCloseButton';
import { useInformationStyles, useScreenStyles } from '../../theme/screenStyles';
import { DateCalendarField } from '../tasks/CalendarDialog';
import { amount, calculatePay, contracts, employeeStatuses, emptyEmployee, locked, money } from './payroll';
import type { Employee, EmployeeFields, PayAmounts, PayInputs, PayrollAdvance, Payslip, Rates } from './payroll';
import { payrollDeductions, payrollMetrics, payrollMoney, payrollWork } from './payrollColumns';

export function PayBreakdown({ pay, employeeName, showTaxable, advances, onOpenAdvance }: {
  pay: PayAmounts; employeeName?: string; showTaxable?: boolean;
  advances?: PayrollAdvance[]; onOpenAdvance: (requestId: string) => void;
}) {
  const styles = useScreenStyles();
  const information = useInformationStyles();
  const advanceAmount = amount(pay.advance);
  const rows = [
    ...(employeeName !== undefined ? [{ label: 'Họ tên', value: employeeName }] : []),
    { label: 'Công', value: payrollWork(pay) },
    ...payrollMetrics.flatMap(metric => metric === payrollDeductions ? [
      { label: 'Tạm ứng lương', value: payrollMoney(advanceAmount) },
      { label: 'Khấu trừ khác', value: payrollMoney(amount(pay.deduction)) },
    ] : [{ label: metric.label, value: payrollMoney(metric.get(pay)) }]),
    ...(showTaxable ? [{ label: 'Thu nhập tính thuế', value: money(pay.taxable) }] : []),
  ];

  return <View style={information.panel}>
    {rows.map(({ label, value }, index) => (
      <View key={label} style={index > 0 && information.divider}>
        <View style={information.row}>
          <Text style={information.label}>{label}</Text>
          <Text style={[information.value, label === 'Thực lĩnh' && styles.cardTitle]}>{value}</Text>
        </View>
        {label === 'Tạm ứng lương' && (advances?.length || advanceAmount > 0) ? (
          <View style={[styles.stack, { paddingBottom: 10 }]}>
            {advances?.length ? advances.map(advance => <Button key={advance.requestId} secondary
              label={`Xem đơn tạm ứng: ${advance.reason || advance.requestId} · ${money(advance.amount)}`}
              onPress={() => onOpenAdvance(advance.requestId)} />)
              : <EmptyState icon="wallet" message="Phiếu này chưa lưu chi tiết đơn tạm ứng." />}
          </View>
        ) : null}
      </View>
    ))}
  </View>;
}

export function PayrollModal({ title, busy, onClose, children }: {
  title: string; busy: boolean; onClose: () => void; children: React.ReactNode;
}) {
  const styles = useScreenStyles();
  return <Modal visible transparent animationType="fade" statusBarTranslucent navigationBarTranslucent
    onRequestClose={() => { if (!busy) onClose(); }}>
    <SafeAreaView style={popup.overlay}>
      <KeyboardViewport style={popup.center}>
        <View role="dialog" accessibilityLabel={title} accessibilityViewIsModal style={[styles.panel, popup.panel]}>
          <View style={styles.listHeader}>
            <Text accessibilityRole="header" style={[styles.cardTitle, styles.listHeading]}>{title}</Text>
            <PopupCloseButton label="Đóng" onPress={onClose} disabled={busy} />
          </View>
          <KeyboardScrollView style={popup.scroll} contentContainerStyle={styles.stack} keyboardShouldPersistTaps="handled">
            {children}
          </KeyboardScrollView>
        </View>
      </KeyboardViewport>
    </SafeAreaView>
  </Modal>;
}

const popup = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(33, 25, 53, 0.45)' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 },
  panel: { width: '100%', maxWidth: 560, flexShrink: 1 },
  scroll: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
});

const employeeTextFields = [
  ['name', 'Họ tên'], ['email', 'Email nhận phiếu lương'], ['position', 'Chức danh'],
  ['startDate', 'Ngày vào làm'], ['taxCode', 'Mã số thuế cá nhân'],
] as const;
const contractChoices = contracts.map(value => ({ value, label: value }));
const employeeNumbers = [
  ['salary', 'Lương thỏa thuận / tháng', 'money'], ['insSalary', 'Mức lương đóng BHXH', 'money'],
  ['allowTaxable', 'Phụ cấp chịu thuế / tháng', 'money'], ['allowFree', 'Phụ cấp không chịu thuế / tháng', 'money'],
  ['dependents', 'Số người phụ thuộc', 'integer'],
] as const;
const payFields = [
  ['workDays', 'Ngày công thực tế', 'decimal'], ['standardDays', 'Ngày công chuẩn', 'decimal'],
  ['bonus', 'Thưởng / khoản thêm', 'money'], ['deduction', 'Khấu trừ khác', 'money'],
] as const;

function TextField({ label, value, onChange, busy, kind = 'text', required, stepBounds }: {
  label: string; value: string; onChange: (value: string) => void; busy: boolean;
  required?: boolean;
  kind?: 'text' | 'email' | 'integer' | 'decimal' | 'money';
  stepBounds?: NumberStepBounds;
}) {
  const styles = useScreenStyles();
  const Input = stepBounds ? NumberStepper : TextInput;
  const fieldLabel = kind === 'money' ? label + ' (VNĐ)' : label;
  const displayValue = kind === 'money' ? value.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : value;
  const inputMode = kind === 'money' || kind === 'integer' ? 'numeric' : kind;

  function change(text: string) {
    const next = kind === 'money' ? text.replace(/\./g, '') : text;
    if ((kind === 'money' || kind === 'integer') && !/^\d*$/.test(next)) return;
    if (kind === 'decimal' && !/^\d*(?:[.,]\d*)?$/.test(next)) return;
    onChange(next);
  }

  return <View style={{ gap: 5 }}>
    <FieldLabel style={styles.label} required={required}>{fieldLabel}</FieldLabel>
    <Input style={styles.input} accessibilityLabel={fieldLabel} value={displayValue} onChangeText={change}
      editable={!busy} inputMode={inputMode} autoCapitalize={kind === 'text' ? 'sentences' : 'none'} maxLength={250}
      {...stepBounds} />
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
      setError('Chọn ngày vào làm hợp lệ.');
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
    {employeeTextFields.map(([key, label]) => key === 'startDate'
      ? <DateCalendarField key={key} label={label} value={fields[key]} clearLabel="Bỏ ngày"
          disabled={busy} onChange={day => change(key, day)} />
      : <TextField key={key} label={label} value={fields[key]} required={key === 'name'}
          onChange={value => change(key, value)} busy={busy} kind={key === 'email' ? 'email' : key === 'taxCode' ? 'integer' : 'text'} />)}
    <Dropdown label="Loại hợp đồng" required value={fields.contract} choices={contractChoices}
      disabled={busy} onChange={value => change('contract', value)} />
    <View style={styles.stack}>
      <FieldLabel style={styles.label} required>Tình trạng</FieldLabel>
      <View style={styles.choices}>{employeeStatuses.map(item =>
        <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: item === fields.status }}
          disabled={busy} onPress={() => change('status', item)} style={[styles.choice, item === fields.status && styles.selected]}>
          <Text style={styles.label}>{item}</Text>
        </Pressable>)}</View>
    </View>
    {employeeNumbers.map(([key, label, kind]) => <TextField key={key} label={label} value={numbers[key]} busy={busy}
      kind={kind} stepBounds={key === 'dependents' ? { min: 0 } : undefined}
      onChange={value => setNumbers(current => ({ ...current, [key]: value }))} />)}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    <Button label="Lưu hồ sơ" disabled={busy} onPress={save} />
  </>;
}

export function PayEditor({ employee, month, rates, advances, slip, pay, busy, onSave, onReopen, onOpenAdvance }: {
  employee: Employee; month: string; rates: Rates; advances?: PayrollAdvance[]; slip?: Payslip; pay: PayAmounts;
  busy: boolean; onSave: (input: PayInputs) => void; onReopen: () => void;
  onOpenAdvance: (requestId: string) => void;
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
  const preview = !isLocked && valid ? calculatePay(employee, values, month, rates, pay.advance) : pay;
  return <>
    <Text style={styles.badge}>{slip?.status || 'Nháp'}</Text>
    {!isLocked && payFields.map(([key, label, kind]) => <TextField key={key} label={label} value={input[key]} busy={busy} kind={kind}
      required={key === 'workDays' || key === 'standardDays'}
      stepBounds={key === 'workDays' ? { max: 31 } : key === 'standardDays' ? { min: Number.MIN_VALUE, max: 31 } : undefined}
      onChange={value => { setError(''); setInput(current => ({ ...current, [key]: value })); }} />)}
    <PayBreakdown pay={preview} showTaxable advances={advances} onOpenAdvance={onOpenAdvance} />
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {isLocked ? slip?.status === 'Đã chốt' && <Button label="Mở lại dòng lương" secondary disabled={busy} onPress={onReopen} />
      : <Button label="Lưu dòng lương" disabled={busy} onPress={() => {
        if (valid) onSave(values);
        else setError('Nhập số ngày công hợp lệ từ 0 đến 31, công chuẩn lớn hơn 0 và các khoản tiền không âm.');
      }} />}
  </>;
}
