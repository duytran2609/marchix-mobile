import { useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { createThemedStyles } from '../../theme/theme';

const weekdays = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const isoDay = (date: Date) => date.toISOString().slice(0, 10);

export const displayDay = (day: string) => day.split('-').reverse().join('/');

export function AssignmentCalendar({ initialDay, value, rangeEnd = value, min, max, disabled, onSelect }: {
  initialDay: string; value: string; rangeEnd?: string; min?: string; max?: string; disabled: boolean;
  onSelect: (day: string) => void;
}) {
  const styles = useStyles();
  const [month, setMonth] = useState(() => initialDay.slice(0, 7) + '-01');
  const calendar = useRef<ComponentRef<typeof View>>(null);
  useEffect(() => {
    if (Platform.OS === 'web') calendar.current?.focus();
  }, []);
  const first = new Date(month + 'T00:00:00Z');
  const offset = (first.getUTCDay() + 6) % 7;
  const next = new Date(first);
  next.setUTCMonth(first.getUTCMonth() + 1);
  const nextMonth = isoDay(next);
  const previous = new Date(first);
  previous.setUTCMonth(first.getUTCMonth() - 1);
  const dayCount = new Date(next.getTime() - 86400000).getUTCDate();
  const weeks = Math.ceil((dayCount + offset) / 7);
  const previousDisabled = disabled || month <= '0001-01-01' || Boolean(min && min >= month);
  const nextDisabled = disabled || month >= '9999-12-01' || Boolean(max && max < nextMonth);

  return (
    <View ref={calendar} tabIndex={-1} style={styles.calendar}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Tháng trước" disabled={previousDisabled}
          style={[styles.arrow, previousDisabled && styles.disabled]} onPress={() => setMonth(isoDay(previous))}>
          <Text style={styles.arrowText}>‹</Text>
        </Pressable>
        <Text accessibilityLiveRegion="polite" style={styles.title}>
          Tháng {first.getUTCMonth() + 1}, {first.getUTCFullYear()}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Tháng sau" disabled={nextDisabled}
          style={[styles.arrow, nextDisabled && styles.disabled]} onPress={() => setMonth(nextMonth)}>
          <Text style={styles.arrowText}>›</Text>
        </Pressable>
      </View>
      <View style={styles.row}>
        {weekdays.map(day => <Text key={day} style={styles.weekday}>{day}</Text>)}
      </View>
      {Array.from({ length: weeks }, (_, week) => (
        <View key={week} style={styles.row}>
          {weekdays.map((_, weekday) => {
            const number = week * 7 + weekday + 1 - offset;
            if (number < 1 || number > dayCount) return <View key={weekday} style={styles.day} />;
            const day = month.slice(0, 8) + String(number).padStart(2, '0');
            const selected = day >= value && day <= rangeEnd;
            const blocked = disabled || Boolean((min && day < min) || (max && day > max));
            return (
              <Pressable key={weekday} accessibilityRole="button" accessibilityLabel={`Ngày ${displayDay(day)}`}
                aria-pressed={selected} disabled={blocked} onPress={() => onSelect(day)}
                style={[styles.day, selected && styles.selected, blocked && styles.disabled]}>
                <Text style={[styles.number, selected && styles.selectedText]}>{number}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  calendar: { borderRadius: 10, padding: 6, borderWidth: 1, borderColor: colors.line, gap: 2 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 2 },
  weekday: { flex: 1, textAlign: 'center', paddingVertical: 4, color: colors.muted, fontSize: 12 },
  day: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: colors.accentSoft },
  arrowText: { color: colors.accent, fontSize: 24, fontWeight: '700' },
  number: { color: colors.ink, fontSize: 14 },
  selected: { backgroundColor: colors.accent },
  selectedText: { color: colors.onAccent, fontWeight: '700' },
  disabled: { opacity: 0.35 },
}));
