import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { useScreenStyles } from '../theme/screenStyles';
import { createThemedStyles } from '../theme/theme';
import { FieldLabel } from './FieldLabel';

export function Button({ label, onPress, secondary = false, disabled = false, selected, style, labelStyle, required, danger = false, leading }: {
  label: string; onPress: () => void; secondary?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  selected?: boolean;
  required?: boolean;
  danger?: boolean;
  leading?: ReactNode;
}) {
  const styles = useStyles();
  const screenStyles = useScreenStyles();
  const textStyles = [styles.buttonLabel, secondary && styles.secondaryLabel, selected && styles.selectedLabel,
    danger && styles.dangerLabel, labelStyle];
  const content = required ? <FieldLabel required style={textStyles}>{label}</FieldLabel> : <Text style={textStyles}>{label}</Text>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={required || leading ? label : undefined}
      accessibilityState={{ disabled }} aria-pressed={selected} disabled={disabled}
      onPress={onPress} style={({ pressed }) => [
        styles.button, secondary && screenStyles.secondary, selected && screenStyles.selected,
        danger && styles.danger, style, (pressed || disabled) && screenStyles.dimmed,
      ]}>
      {leading ? <View style={styles.leadingRow}>{leading}<View style={styles.leadingLabel}>{content}</View></View> : content}
    </Pressable>
  );
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  button: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, alignItems: 'center',
    justifyContent: 'center', borderRadius: 9, backgroundColor: colors.accent },
  buttonLabel: { color: colors.onAccent, fontSize: 14, fontWeight: '700' },
  leadingRow: { flexDirection: 'row', alignSelf: 'stretch', alignItems: 'center', gap: 8 },
  leadingLabel: { flex: 1, minWidth: 0 },
  secondaryLabel: { color: colors.ink },
  selectedLabel: { color: colors.accent, fontWeight: '800' },
  danger: { backgroundColor: '#9E342B', borderColor: '#9E342B' },
  dangerLabel: { color: '#fff' },
}));
