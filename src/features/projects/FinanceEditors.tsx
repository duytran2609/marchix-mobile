import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Button } from '../../components/Button';
import { Dropdown } from '../../components/Dropdown';
import { useScreenStyles } from '../../theme/screenStyles';
import { DateCalendarField } from '../tasks/CalendarDialog';
import { BUDGET_NATURES, formatVndInput, guidedRentLines, lineTotal, parseVndInput, TAX_MODES } from './financeMath';
import type { BudgetLine, FinancePlan } from './financeMath';

const textValue = (value: number | null | undefined) => value == null ? '' : String(value);
const optionalNumber = (value: string) => value.trim() ? Number(value.replace(',', '.')) : null;
export const financeChoices = (values: readonly string[]) => values.map(value => ({ value, label: value }));

export function FinanceInput({ label, value, onChange, maxLength = 120, inputMode }: {
  label: string; value: string; onChange: (value: string) => void; maxLength?: number; inputMode?: 'numeric' | 'decimal';
}) {
  const styles = useScreenStyles();
  return <View style={{ gap: 4 }}>
    <Text style={styles.label}>{label}</Text>
    <TextInput accessibilityLabel={label} style={styles.input} value={value} onChangeText={onChange}
      maxLength={maxLength} inputMode={inputMode} />
  </View>;
}

export function BudgetLineEditor({ line, categories, onSave, onCancel, onRemove, busy, error }: {
  line?: BudgetLine; categories: string[]; onSave: (line: Omit<BudgetLine, 'code'>) => void; onCancel: () => void; busy: boolean;
  onRemove?: () => void; error?: string;
}) {
  const styles = useScreenStyles();
  const [advanced, setAdvanced] = useState(false);
  const [data, setData] = useState({
    name: line?.name ?? '', category: line?.category ?? '', nature: line?.nature || 'Chi phí',
    total: formatVndInput(line ? lineTotal(line) : null), unit: formatVndInput(line?.unit ?? null),
    quantity: textValue(line?.quantity ?? (line ? null : 1)), unitLabel: line?.unitLabel ?? 'khoản',
    fees: formatVndInput(line ? line.fees : 0), taxMode: line?.taxMode ?? 'Đã gồm thuế GTGT',
    vatMethod: line?.vatMethod ?? (line?.vatRate != null || line?.vat == null ? 'rate' : 'manual'),
    vat: formatVndInput(line?.vat ?? null), vatRate: textValue(line?.vatRate),
    quote: line?.quote ?? '', quoteDate: line?.quoteDate ?? '', payDate: line?.payDate ?? '',
    refundDue: line?.refundDue ?? '', allocationMonths: textValue(line?.allocationMonths),
    reviewUnit: formatVndInput(line?.reviewUnit ?? null), reviewDate: line?.reviewDate ?? '',
    reviewSource: line?.reviewSource ?? '', reviewBasis: line?.reviewBasis ?? 'Báo giá cập nhật',
    remainingEstimate: formatVndInput(line?.remainingEstimate ?? null),
  });
  const set = (key: keyof typeof data) => (value: string) => setData(current => ({ ...current, [key]: value }));
  const input = (key: keyof typeof data, label: string, inputMode?: 'numeric' | 'decimal', maxLength?: number) =>
    <FinanceInput label={label} value={data[key]} onChange={set(key)} inputMode={inputMode} maxLength={maxLength} />;
  const date = (key: 'quoteDate' | 'payDate' | 'refundDue' | 'reviewDate', label: string) =>
    <DateCalendarField label={label} value={data[key]} onChange={set(key)} clearLabel="Bỏ ngày" disabled={busy} />;
  function detailedLine() {
    const { total, ...details } = data;
    return { ...line, ...details, code: line?.code ?? '', name: data.name.trim(), quote: data.quote.trim(), unitLabel: data.unitLabel.trim(),
      quantity: optionalNumber(data.quantity), unit: parseVndInput(data.unit), fees: parseVndInput(data.fees),
      vat: parseVndInput(data.vat), vatRate: optionalNumber(data.vatRate), allocationMonths: optionalNumber(data.allocationMonths),
      reviewUnit: parseVndInput(data.reviewUnit), remainingEstimate: parseVndInput(data.remainingEstimate) };
  }
  function simpleDetails() {
    // A changed lump sum replaces the cost breakdown, just as a simple-mode save does.
    return { quantity: '1', unitLabel: 'khoản', unit: data.total, fees: '0',
      vatMethod: 'rate', vatRate: '', vat: '', taxMode: 'Đã gồm thuế GTGT',
      reviewUnit: '', reviewDate: '', reviewSource: '', remainingEstimate: '' };
  }
  function toggleMode() {
    if (advanced) {
      setData(current => ({ ...current, total: formatVndInput(lineTotal(detailedLine())) }));
    } else if (parseVndInput(data.total) !== lineTotal(detailedLine())) {
      setData(current => ({ ...current, ...simpleDetails() }));
    }
    setAdvanced(value => !value);
  }
  function save() {
    const details = detailedLine();
    const amount = parseVndInput(data.total);
    // Keep the current detailed draft, not the original line, when its total is unchanged.
    if (advanced || amount === lineTotal(details)) return onSave(details);
    onSave({ ...details, quantity: 1, unitLabel: 'khoản', unit: amount, fees: 0,
      vatMethod: 'rate', vatRate: null, vat: null, taxMode: 'Đã gồm thuế GTGT',
      reviewUnit: null, reviewDate: '', reviewSource: '', remainingEstimate: null });
  }
  return <View style={styles.stack}>
    {input('name', 'Mua / chi gì?')}
    <Dropdown label="Hạng mục" value={data.category} choices={financeChoices(categories)} onChange={set('category')} fallbackLabel="Chọn hạng mục" />
    <Dropdown label="Loại khoản" value={data.nature} choices={financeChoices(BUDGET_NATURES)} onChange={set('nature')} />
    {!advanced && input('total', 'Số tiền tổng (đ)', 'numeric', 20)}
    <Text style={styles.muted}>Để trống khi chưa xác định. Nhập 0 khi xác nhận không phát sinh.</Text>
    <Button label={advanced ? 'Nhập số tiền tổng' : 'Nhập chi tiết VAT, báo giá và dự báo'} secondary
      onPress={toggleMode} disabled={busy} />
    {advanced && <>
      {input('quantity', 'Số lượng', 'decimal', 12)}
      {input('unitLabel', 'Đơn vị tính', undefined, 80)}
      {input('unit', 'Đơn giá (đ)', 'numeric', 20)}
      {input('fees', 'Phí khác (đ)', 'numeric', 20)}
      <Dropdown label="Cách tính VAT" value={data.taxMode} choices={financeChoices(TAX_MODES)} onChange={set('taxMode')} />
      {(data.taxMode === TAX_MODES[1] || data.taxMode === TAX_MODES[2]) && <>
        <Dropdown label="Nhập VAT theo" value={data.vatMethod}
          choices={[{ value: 'rate', label: 'Thuế suất' }, { value: 'manual', label: 'Tiền VAT' }]} onChange={set('vatMethod')} />
        {data.vatMethod === 'rate' ? input('vatRate', 'Thuế suất (%)', 'decimal', 6) : input('vat', 'Tiền VAT (đ)', 'numeric', 20)}
      </>}
      {input('quote', 'Căn cứ báo giá', undefined, 240)}
      {date('quoteDate', 'Ngày báo giá')}
      {date('payDate', 'Ngày dự kiến chi')}
      {data.nature === 'Cọc có thể thu hồi' && date('refundDue', 'Ngày dự kiến thu hồi cọc')}
      {data.nature === 'Chi phí trả trước' && input('allocationMonths', 'Số tháng phân bổ', 'numeric', 3)}
      {input('reviewUnit', 'Đơn giá rà soát (đ)', 'numeric', 20)}
      <Dropdown label="Loại căn cứ rà soát" value={data.reviewBasis}
        choices={financeChoices(['Báo giá cập nhật', 'Hóa đơn thực tế'])} onChange={set('reviewBasis')} />
      {input('reviewSource', 'Căn cứ rà soát', undefined, 240)}
      {date('reviewDate', 'Ngày rà soát')}
      {input('remainingEstimate', 'Chi còn lại (đ)', 'numeric', 20)}
    </>}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    <Button label={busy ? 'Đang lưu…' : 'Ghi lại dự toán'} onPress={save} disabled={busy} />
    {onRemove && <Button label="Bỏ khoản khỏi bản nháp" secondary onPress={onRemove} disabled={busy} />}
    <Button label="Hủy" secondary onPress={onCancel} disabled={busy} />
  </View>;
}

const cashFields = [
  ['opening', 'Tiền đầu kỳ (đ)'], ['reserve', 'Dự phòng tối thiểu (đ)'],
  ['price', 'Doanh thu thuần/khách (đ)'], ['variable', 'Biến phí/khách (đ)'],
  ['fixed', 'Định phí/tháng (đ)'], ['days', 'Ngày bán/tháng'], ['guests', 'Khách dự kiến/ngày'],
] as const;

export function CashForecastEditor({ plan, onSave, onCancel, busy }: {
  plan: FinancePlan; onSave: (next: FinancePlan) => void; onCancel: () => void; busy: boolean;
}) {
  const styles = useScreenStyles();
  const [values, setValues] = useState(() => Object.fromEntries(cashFields.map(([key]) => [key, textValue(plan[key])])));
  const [start, setStart] = useState(plan.start);
  const [weeks, setWeeks] = useState(() => plan.weeks.map(week => ({ in: textValue(week.in), out: textValue(week.out) })));
  function updateWeek(index: number, key: 'in' | 'out', value: string) {
    setWeeks(current => current.map((week, i) => i === index ? { ...week, [key]: value } : week));
  }
  return <View style={styles.stack}>
    <Text accessibilityRole="header" style={styles.cardTitle}>Nhập dòng tiền 13 tuần & hòa vốn</Text>
    {cashFields.map(([key, label]) => <FinanceInput key={key} label={label} inputMode="numeric" maxLength={20}
      value={values[key]} onChange={value => setValues(current => ({ ...current, [key]: value }))} />)}
    <DateCalendarField label="Bắt đầu tuần 1" value={start} onChange={setStart} clearLabel="Bỏ ngày" disabled={busy} />
    {weeks.map((week, index) => <View key={index} style={styles.choices}>
      <FinanceInput label={'Thu tuần ' + (index + 1)} value={week.in} inputMode="numeric" maxLength={20}
        onChange={value => updateWeek(index, 'in', value)} />
      <FinanceInput label={'Chi tuần ' + (index + 1)} value={week.out} inputMode="numeric" maxLength={20}
        onChange={value => updateWeek(index, 'out', value)} />
    </View>)}
    <Button label={busy ? 'Đang lưu…' : 'Ghi lại dòng tiền'} disabled={busy} onPress={() => onSave({
      ...plan, start, ...Object.fromEntries(cashFields.map(([key]) => [key, parseVndInput(values[key])])),
      weeks: weeks.map(week => ({ in: parseVndInput(week.in), out: parseVndInput(week.out) })),
    })} />
    <Button label="Hủy" secondary onPress={onCancel} disabled={busy} />
  </View>;
}

export function RentEditor({ busy, onCancel, onSave, error }: {
  busy: boolean; onCancel: () => void; onSave: (build: (sequence: number) => BudgetLine[]) => void; error?: string;
}) {
  const styles = useScreenStyles();
  const [monthly, setMonthly] = useState('');
  const [months, setMonths] = useState('');
  const [deposit, setDeposit] = useState('');
  const [taxMode, setTaxMode] = useState(TAX_MODES[0]);
  const [rate, setRate] = useState('');
  const [payment, setPayment] = useState('monthly');
  return <View style={styles.stack}>
    <FinanceInput label="Tiền thuê mỗi tháng (đ)" inputMode="numeric" value={monthly} onChange={setMonthly} />
    <FinanceInput label="Số tháng" inputMode="numeric" maxLength={3} value={months} onChange={setMonths} />
    <Dropdown label="Cách thanh toán" value={payment} choices={[
      { value: 'monthly', label: 'Trả theo tháng' }, { value: 'prepaid', label: 'Trả trước' },
    ]} onChange={setPayment} />
    <Dropdown label="Cách tính VAT" value={taxMode} choices={financeChoices(TAX_MODES)} onChange={setTaxMode} />
    {(taxMode === TAX_MODES[1] || taxMode === TAX_MODES[2]) &&
      <FinanceInput label="Thuế suất (%)" inputMode="decimal" value={rate} onChange={setRate} />}
    <FinanceInput label="Cọc hoàn lại (đ)" inputMode="numeric" value={deposit} onChange={setDeposit} />
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    <Button label={busy ? 'Đang lưu…' : 'Thêm vào dự toán'} disabled={busy} onPress={() => onSave(sequence => guidedRentLines({
      monthly: parseVndInput(monthly), months: optionalNumber(months), payment, taxMode,
      rate: optionalNumber(rate), deposit: parseVndInput(deposit),
    }, sequence))} />
    <Button label="Hủy" secondary disabled={busy} onPress={onCancel} />
  </View>;
}
