import { StyleSheet, View } from 'react-native';
import { Dropdown } from './Dropdown';

const timeOptions = (count: number) => Array.from({ length: count }, (_, index) => {
  const value = String(index).padStart(2, '0');
  return { value, label: value };
});
const hours = timeOptions(24);
const minutes = timeOptions(60);
const hourOptions = [{ value: '', label: 'Chọn giờ' }, ...hours];
const compactHourOptions = [{ value: '', label: 'Giờ' }, ...hours];
const durationHours = [...hours, { value: '24', label: '24' }];

export function TimeFields({ label, value, disabled, compact, duration, onChange }: {
  label: string; value: string; disabled: boolean; compact?: boolean; duration?: boolean;
  onChange: (value: string) => void;
}) {
  const [hour = '', minute = ''] = value.split(':');
  const hourChoices = duration ? durationHours : compact ? compactHourOptions : hourOptions;
  const fullDay = duration && hour === '24';
  return <View style={[styles.row, compact && styles.compact]}>
    <Dropdown label={label + ' · Giờ'} hideLabel value={hour} choices={hourChoices}
      fallbackLabel={duration ? 'Giờ' : undefined} style={styles.field} disabled={disabled} highlightSelection={!compact && !duration}
      onChange={nextHour => onChange(nextHour ? `${nextHour}:${duration && nextHour === '24' ? '00' : minute || '00'}` : '')} />
    <Dropdown label={label + ' · Phút'} hideLabel value={minute} choices={minutes}
      fallbackLabel={compact || duration ? 'Phút' : 'Chọn phút'} style={styles.field} disabled={disabled || !hour || fullDay}
      highlightSelection={!compact && !duration}
      onChange={nextMinute => onChange(hour + ':' + nextMinute)} />
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  compact: { flex: 1, minWidth: 142 },
  field: { flex: 1, minWidth: 0 },
});
