import { useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/Button';
import { FieldLabel } from '../../components/FieldLabel';
import { PopupCloseButton } from '../../components/PopupCloseButton';
import { useScreenStyles } from '../../theme/screenStyles';
import { createThemedStyles } from '../../theme/theme';
import { AssignmentCalendar, displayDay } from './AssignmentCalendar';
import { todayInVietnam } from './taskDates';

export function CalendarDialog({ title, onClose, children }: {
  title: string; onClose: () => void; children: ReactNode;
}) {
  const ui = useScreenStyles();
  const styles = useStyles();
  return <Modal visible transparent statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
    <SafeAreaView style={styles.overlay}>
      <Pressable accessible={false} aria-hidden tabIndex={-1} style={StyleSheet.absoluteFill} onPress={onClose} />
      <View role="dialog" accessibilityLabel={title} accessibilityViewIsModal style={styles.panel}>
        <View style={styles.header}>
          <Text accessibilityRole="header" style={[ui.cardTitle, ui.listHeading]}>{title}</Text>
          <PopupCloseButton label="Đóng lịch" onPress={onClose} />
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </View>
    </SafeAreaView>
  </Modal>;
}

export function DateCalendarButton({ label, value, initialDay, min, max, disabled = false, clearLabel, onChange, style }: {
  label: string; value: string; initialDay?: string; min?: string; max?: string; disabled?: boolean;
  clearLabel?: string; onChange: (day: string) => void; style?: StyleProp<ViewStyle>;
}) {
  const ui = useScreenStyles();
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const display = value ? displayDay(value) : 'Chọn ngày';
  const close = () => setOpen(false);
  function select(day: string) {
    onChange(day);
    close();
  }
  const initial = initialDay || value || todayInVietnam();
  const visibleDay = min && initial < min ? min : max && initial > max ? max : initial;

  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}, ${display}`} aria-expanded={open}
      disabled={disabled} style={[ui.input, styles.trigger, style]} onPress={() => {
        if (Keyboard.isVisible()) Keyboard.dismiss();
        setOpen(true);
      }}>
      <Text style={value ? ui.label : ui.muted}>{display}</Text>
      <Text aria-hidden style={styles.icon}>▦</Text>
    </Pressable>
    {open && <CalendarDialog title={label} onClose={close}>
      <AssignmentCalendar initialDay={visibleDay} value={value} min={min} max={max} disabled={disabled} onSelect={select} />
      {clearLabel && value ? <Button label={clearLabel} secondary disabled={disabled} onPress={() => select('')} /> : null}
    </CalendarDialog>}
  </>;
}

export function DateCalendarField({ required, ...props }: ComponentProps<typeof DateCalendarButton> & { required?: boolean }) {
  const ui = useScreenStyles();
  const styles = useStyles();
  return <View style={styles.field}>
    <FieldLabel style={ui.label} required={required}>{props.label}</FieldLabel>
    <DateCalendarButton {...props} />
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16, backgroundColor: 'rgba(33, 25, 53, 0.45)' },
  panel: { width: '100%', maxWidth: 380, flexShrink: 1, borderRadius: 16, borderWidth: 1,
    borderColor: colors.line, backgroundColor: colors.paper, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    paddingLeft: 12, paddingRight: 4, borderBottomWidth: 1, borderBottomColor: colors.line },
  scroll: { flexShrink: 1, minHeight: 0 },
  body: { padding: 12, gap: 10 },
  field: { gap: 6 },
  trigger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  icon: { color: colors.accent, fontSize: 18 },
}));
