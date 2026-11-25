import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { PopupAction } from '../../components/PopupBody';
import { Dropdown } from '../../components/Dropdown';
import { inputTextStyle, useScreenStyles } from '../../theme/screenStyles';
import { useTheme } from '../../theme/theme';
import { weekday } from '../attendance/attendance';
import type { WorkdayOverrides, WorkdayWeight } from '../attendance/attendance';
import { AssignmentCalendar, displayDay } from '../tasks/AssignmentCalendar';
import { CalendarDialog } from '../tasks/CalendarDialog';
import { shiftDay, todayInVietnam } from '../tasks/taskDates';
import { workdayChoices, workdayLabels } from './adminSettingsFields';
import type { FieldValues } from './adminSettingsFields';

type Selection = { day: string; weight: WorkdayWeight; range?: { end?: string } };

export function WorkdayOverrideSettings({ overrides, weekly, disabled, onChange }: {
  overrides: WorkdayOverrides;
  weekly: FieldValues;
  disabled: boolean;
  onChange: (days: readonly string[], weight: WorkdayWeight | undefined) => void;
}) {
  const ui = useScreenStyles();
  const { colors } = useTheme();
  const markerColors: Record<WorkdayWeight, string> = { 1: colors.success, 0.5: colors.warning, 0: colors.danger };
  const [selection, setSelection] = useState<Selection>();
  const title = 'Thiết lập ngày cụ thể';
  const close = () => setSelection(undefined);
  const waitingForEnd = selection?.range !== undefined && selection.range.end === undefined;
  const start = selection?.day ?? '';
  const end = selection?.range?.end ?? start;
  const multipleDays = start !== end;

  function regularWeight(day: string): WorkdayWeight {
    const weight = weekly['day' + weekday(day)];
    return weight === 0 || weight === 0.5 ? weight : 1;
  }

  function select(day: string, range?: Selection['range']) {
    setSelection({ day, weight: overrides[day] ?? regularWeight(day), range });
  }

  function selectCalendarDay(day: string) {
    if (waitingForEnd && selection && day !== selection.day) {
      const [first, last] = [selection.day, day].sort();
      setSelection({ ...selection, day: first, range: { end: last } });
    } else {
      select(day);
    }
  }

  function apply() {
    if (!selection || waitingForEnd) return;
    const days = [start];
    while (days[days.length - 1] < end) days.push(shiftDay(days[days.length - 1], 1));
    onChange(days, selection.weight);
  }

  return <>
    <Button label={title} secondary disabled={disabled} onPress={() => select(todayInVietnam())} />
    {selection && <CalendarDialog title={title} onClose={close} footer={<>
      <PopupAction label={multipleDays ? 'Áp dụng cho các ngày đã chọn' : 'Áp dụng cho ngày này'}
        disabled={disabled || waitingForEnd} onPress={apply} />
      {!multipleDays && !waitingForEnd && overrides[start] !== undefined &&
        <PopupAction label="Dùng lại lịch cố định" secondary disabled={disabled}
          onPress={() => {
            onChange([start], undefined);
            setSelection({ day: start, weight: regularWeight(start) });
          }} />}
    </>}>
      <Text style={ui.muted} accessibilityLiveRegion="polite">
        {waitingForEnd ? `Đã chọn ngày đầu ${displayDay(start)}. Chọn ngày cuối.`
          : multipleDays ? `Từ ${displayDay(start)} đến ${displayDay(end)}`
            : 'Nhấn giữ ngày đầu, rồi chọn ngày cuối để thiết lập nhiều ngày.'}
      </Text>
      <AssignmentCalendar initialDay={start} value={start} rangeEnd={end} disabled={disabled}
        onSelect={selectCalendarDay} onLongSelect={day => select(day, {})}
        getDayMarker={day => {
          const weight = overrides[day];
          if (weight === undefined) return;
          return { label: workdayLabels[weight], color: markerColors[weight] };
        }} />
      <View role="group" accessibilityLabel="Chú thích lịch làm việc" style={styles.legend}>
        {workdayChoices.map(({ value, label }) => <View key={value} style={styles.legendItem}>
          <View aria-hidden testID="calendar-legend-marker" style={[styles.legendDot, { backgroundColor: markerColors[value] }]} />
          <Text style={ui.muted}>{label}</Text>
        </View>)}
      </View>
      <Dropdown label={multipleDays ? 'Lịch làm việc cho khoảng ngày' : 'Lịch làm việc trong ngày'}
        value={selection.weight} valueTextStyle={inputTextStyle} choices={workdayChoices} highlightSelection={false}
        disabled={disabled || waitingForEnd} onChange={weight => setSelection({ ...selection, weight })} />
    </CalendarDialog>}
  </>;
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
});
