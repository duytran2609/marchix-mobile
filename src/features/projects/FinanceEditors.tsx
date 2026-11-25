import { useState } from 'react';
import { Text, View } from 'react-native';
import { TextInput } from '../../components/TextInput';
import { PopupAction } from '../../components/PopupBody';
import { Dropdown } from '../../components/Dropdown';
import { NumberStepper } from '../../components/NumberStepper';
import { SegmentedButtons } from '../../components/SegmentedButtons';
import type { NumberStepBounds } from '../../components/NumberStepper';
import { useScreenStyles } from '../../theme/screenStyles';
import { DateCalendarField } from '../tasks/CalendarDialog';
import { ProjectFormPopup } from './ProjectFormPopup';
import { BUDGET_NATURES, formatVndInput, guidedRentLines, lineTotal, parseVndInput, TAX_MODES } from './financeMath';
import type { BudgetLine, FinancePlan } from './financeMath';

const textValue = (value: number | null | undefined) => value == null ? '' : String(value);
const optionalNumber = (value: string) => value.trim() ? Number(value.replace(',', '.')) : null;
export const financeChoices = (values: readonly string[]) => values.map(value => ({ value, label: value }));
const budgetTabs = [
  { value: 'main', label: 'Thông tin chính' },
  { value: 'cost', label: 'Chi phí & VAT' },
  { value: 'forecast', label: 'Báo giá & dự báo' },
] as const;
type BudgetTab = typeof budgetTabs[number]['value'];

export function FinanceInput({ label, value, onChange, maxLength = 120, inputMode, stepBounds, disabled }: {
  label: string; value: string; onChange: (value: string) => void; maxLength?: number; inputMode?: 'numeric' | 'decimal';
  stepBounds?: NumberStepBounds; disabled?: boolean;
}) {
  const styles = useScreenStyles();
  const Input = stepBounds ? NumberStepper : TextInput;
  return <View style={{ gap: 4 }}>
    <Text style={styles.label}>{label}</Text>
    <Input accessibilityLabel={label} style={styles.input} value={value} onChangeText={onChange}
      maxLength={maxLength} inputMode={inputMode} editable={!disabled} {...stepBounds} />
  </View>;
}

export function BudgetLineEditor({ line, categories, onSave, onClose, onRemove, busy, error }: {
  line?: BudgetLine; categories: string[]; onSave: (line: Omit<BudgetLine, 'code'>) => void; onClose: () => void; busy: boolean;
  onRemove?: () => void; error?: string;
}) {
  const styles = useScreenStyles();
  const [tab, setTab] = useState<BudgetTab>('main');
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
  const input = (key: keyof typeof data, label: string, inputMode?: 'numeric' | 'decimal', maxLength?: number,
    stepBounds?: NumberStepBounds) =>
    <FinanceInput label={label} value={data[key]} onChange={set(key)} inputMode={inputMode} maxLength={maxLength}
      stepBounds={stepBounds} disabled={busy} />;
  const date = (key: 'quoteDate' | 'payDate' | 'refundDue' | 'reviewDate', label: string) =>
    <DateCalendarField label={label} value={data[key]} onChange={set(key)} clearLabel="Bỏ ngày" disabled={busy} />;
  function detailedLine(draft = data) {
    const { total, ...details } = draft;
    return { ...line, ...details, code: line?.code ?? '', name: draft.name.trim(), quote: draft.quote.trim(), unitLabel: draft.unitLabel.trim(),
      quantity: optionalNumber(draft.quantity), unit: parseVndInput(draft.unit), fees: parseVndInput(draft.fees),
      vat: parseVndInput(draft.vat), vatRate: optionalNumber(draft.vatRate), allocationMonths: optionalNumber(draft.allocationMonths),
      reviewUnit: parseVndInput(draft.reviewUnit), remainingEstimate: parseVndInput(draft.remainingEstimate) };
  }
  function withEnteredTotal() {
    // Keep the cost and VAT breakdown unless the user changed the total.
    if (parseVndInput(data.total) === lineTotal(detailedLine())) return data;
    return { ...data, quantity: '1', unitLabel: 'khoản', unit: data.total, fees: '0',
      vatMethod: 'rate', vatRate: '', vat: '', taxMode: 'Đã gồm thuế GTGT',
      reviewUnit: '', reviewDate: '', reviewSource: '', remainingEstimate: '' };
  }
  function selectTab(next: BudgetTab) {
    if (busy || next === tab) return;
    if (next === 'main') {
      setData(current => ({ ...current, total: formatVndInput(lineTotal(detailedLine(current))) }));
    } else if (tab === 'main') {
      setData(withEnteredTotal());
    }
    setTab(next);
  }
  function save() {
    onSave(detailedLine(tab === 'main' ? withEnteredTotal() : data));
  }
  return <ProjectFormPopup title={line ? 'Sửa khoản dự toán' : 'Lập khoản dự toán'} busy={busy} onClose={onClose}
    tabs={<SegmentedButtons label="Thông tin khoản dự toán" value={tab} choices={budgetTabs} onChange={selectTab} />}
    contentKey={tab}
    footer={<>
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <PopupAction label={busy ? 'Đang lưu…' : 'Ghi lại dự toán'} onPress={save} disabled={busy} />
      {onRemove && <PopupAction label="Bỏ khoản khỏi bản nháp" secondary onPress={onRemove} disabled={busy} />}
    </>}>
    {tab === 'main' && <>
      {input('name', 'Mua / chi gì?')}
      <Dropdown label="Hạng mục" value={data.category} choices={financeChoices(categories)}
        onChange={set('category')} fallbackLabel="Chọn hạng mục" disabled={busy} highlightSelection={false} />
      <Dropdown label="Loại khoản" value={data.nature} choices={financeChoices(BUDGET_NATURES)}
        onChange={set('nature')} disabled={busy} highlightSelection={false} />
      {input('total', 'Số tiền tổng (VNĐ)', 'numeric', 20)}
      <Text style={styles.muted}>Để trống khi chưa xác định. Nhập 0 khi xác nhận không phát sinh.</Text>
    </>}
    {tab === 'cost' && <>
      {input('quantity', 'Số lượng', 'decimal', 12, { min: 0.001, max: 100000 })}
      {input('unitLabel', 'Đơn vị tính', undefined, 80)}
      {input('unit', 'Đơn giá (VNĐ)', 'numeric', 20)}
      {input('fees', 'Phí khác (VNĐ)', 'numeric', 20)}
      <Dropdown label="Cách tính VAT" value={data.taxMode} choices={financeChoices(TAX_MODES)}
        onChange={set('taxMode')} disabled={busy} highlightSelection={false} />
      {(data.taxMode === TAX_MODES[1] || data.taxMode === TAX_MODES[2]) && <>
        <Dropdown label="Nhập VAT theo" value={data.vatMethod}
          choices={[{ value: 'rate', label: 'Thuế suất' }, { value: 'manual', label: 'Tiền VAT' }]}
          onChange={set('vatMethod')} disabled={busy} highlightSelection={false} />
        {data.vatMethod === 'rate' ? input('vatRate', 'Thuế suất (%)', 'decimal', 6) : input('vat', 'Tiền VAT (VNĐ)', 'numeric', 20)}
      </>}
      {data.nature === 'Chi phí trả trước' && input('allocationMonths', 'Số tháng phân bổ', 'numeric', 3, { min: 1, max: 120 })}
    </>}
    {tab === 'forecast' && <>
      {input('quote', 'Căn cứ báo giá', undefined, 240)}
      {date('quoteDate', 'Ngày báo giá')}
      {date('payDate', 'Ngày dự kiến chi')}
      {data.nature === 'Cọc có thể thu hồi' && date('refundDue', 'Ngày dự kiến thu hồi cọc')}
      {input('reviewUnit', 'Đơn giá rà soát (VNĐ)', 'numeric', 20)}
      <Dropdown label="Loại căn cứ rà soát" value={data.reviewBasis}
        choices={financeChoices(['Báo giá cập nhật', 'Hóa đơn thực tế'])} onChange={set('reviewBasis')}
        disabled={busy} highlightSelection={false} />
      {input('reviewSource', 'Căn cứ rà soát', undefined, 240)}
      {date('reviewDate', 'Ngày rà soát')}
      {input('remainingEstimate', 'Chi còn lại (VNĐ)', 'numeric', 20)}
    </>}
  </ProjectFormPopup>;
}

const cashFields = [
  ['opening', 'Tiền đầu kỳ (VNĐ)'], ['reserve', 'Dự phòng tối thiểu (VNĐ)'],
  ['price', 'Doanh thu thuần/khách (VNĐ)'], ['variable', 'Biến phí/khách (VNĐ)'],
  ['fixed', 'Định phí/tháng (VNĐ)'], ['days', 'Ngày bán/tháng'], ['guests', 'Khách dự kiến/ngày'],
] as const;

export function CashForecastEditor({ plan, onSave, onClose, busy, error }: {
  plan: FinancePlan; onSave: (next: FinancePlan) => void; onClose: () => void; busy: boolean; error: string;
}) {
  const styles = useScreenStyles();
  const [values, setValues] = useState(() => Object.fromEntries(cashFields.map(([key]) => [key, textValue(plan[key])])));
  const [start, setStart] = useState(plan.start);
  const [weeks, setWeeks] = useState(() => plan.weeks.map(week => ({ in: textValue(week.in), out: textValue(week.out) })));
  function updateWeek(index: number, key: 'in' | 'out', value: string) {
    setWeeks(current => current.map((week, i) => i === index ? { ...week, [key]: value } : week));
  }
  return <ProjectFormPopup title="Nhập dòng tiền 13 tuần & hòa vốn" onClose={onClose} busy={busy}
    footer={<>
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <PopupAction label={busy ? 'Đang lưu…' : 'Ghi lại dòng tiền'} disabled={busy} onPress={() => onSave({
        ...plan, start, ...Object.fromEntries(cashFields.map(([key]) => [key, parseVndInput(values[key])])),
        weeks: weeks.map(week => ({ in: parseVndInput(week.in), out: parseVndInput(week.out) })),
      })} />
    </>}>
    {cashFields.map(([key, label]) => <FinanceInput key={key} label={label} inputMode="numeric" maxLength={20}
      value={values[key]} onChange={value => setValues(current => ({ ...current, [key]: value }))} disabled={busy} />)}
    <DateCalendarField label="Bắt đầu tuần 1" value={start} onChange={setStart} clearLabel="Bỏ ngày" disabled={busy} />
    {weeks.map((week, index) => <View key={index} style={styles.choices}>
      <FinanceInput label={'Thu tuần ' + (index + 1) + ' (VNĐ)'} value={week.in} inputMode="numeric" maxLength={20}
        onChange={value => updateWeek(index, 'in', value)} disabled={busy} />
      <FinanceInput label={'Chi tuần ' + (index + 1) + ' (VNĐ)'} value={week.out} inputMode="numeric" maxLength={20}
        onChange={value => updateWeek(index, 'out', value)} disabled={busy} />
    </View>)}
  </ProjectFormPopup>;
}

export function RentEditor({ busy, onSave, onClose, error }: {
  busy: boolean; onSave: (build: (sequence: number) => BudgetLine[]) => void; onClose: () => void; error?: string;
}) {
  const styles = useScreenStyles();
  const [monthly, setMonthly] = useState('');
  const [months, setMonths] = useState('');
  const [deposit, setDeposit] = useState('');
  const [taxMode, setTaxMode] = useState(TAX_MODES[0]);
  const [rate, setRate] = useState('');
  const [payment, setPayment] = useState('monthly');
  return <ProjectFormPopup title="Thuê / trả trước / cọc" busy={busy} onClose={onClose} footer={
    <PopupAction label={busy ? 'Đang lưu…' : 'Thêm vào dự toán'} disabled={busy} onPress={() => onSave(sequence => guidedRentLines({
      monthly: parseVndInput(monthly), months: optionalNumber(months), payment, taxMode,
      rate: optionalNumber(rate), deposit: parseVndInput(deposit),
    }, sequence))} />
  }>
    <FinanceInput label="Tiền thuê mỗi tháng (VNĐ)" inputMode="numeric" value={monthly} onChange={setMonthly} />
    <FinanceInput label="Số tháng" inputMode="numeric" maxLength={3} value={months} onChange={setMonths}
      stepBounds={{ min: 1, max: 120 }} disabled={busy} />
    <Dropdown label="Cách thanh toán" value={payment} choices={[
      { value: 'monthly', label: 'Trả theo tháng' }, { value: 'prepaid', label: 'Trả trước' },
    ]} onChange={setPayment} />
    <Dropdown label="Cách tính VAT" value={taxMode} choices={financeChoices(TAX_MODES)} onChange={setTaxMode} />
    {(taxMode === TAX_MODES[1] || taxMode === TAX_MODES[2]) &&
      <FinanceInput label="Thuế suất (%)" inputMode="decimal" value={rate} onChange={setRate} />}
    <FinanceInput label="Cọc hoàn lại (VNĐ)" inputMode="numeric" value={deposit} onChange={setDeposit} />
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
  </ProjectFormPopup>;
}
