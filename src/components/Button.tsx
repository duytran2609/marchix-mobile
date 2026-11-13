import { Pressable, StyleSheet, Text } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useScreenStyles } from '../theme/screenStyles';
import { createThemedStyles } from '../theme/theme';
import { FieldLabel } from './FieldLabel';

export function Button({ label, onPress, secondary = false, disabled = false, selected, style, required }: {
  label: string; onPress: () => void; secondary?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>;
  selected?: boolean;
  required?: boolean;
}) {
  const styles = useStyles();
  const screenStyles = useScreenStyles();
  const labelStyle = [styles.buttonLabel, secondary && styles.secondaryLabel, selected && styles.selectedLabel];
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={required ? label : undefined}
      accessibilityState={{ disabled }} aria-pressed={selected} disabled={disabled}
      onPress={onPress} style={({ pressed }) => [
        styles.button, secondary && screenStyles.secondary, selected && screenStyles.selected,
        style, (pressed || disabled) && screenStyles.dimmed,
      ]}>
      {required ? <FieldLabel required style={labelStyle}>{label}</FieldLabel> : <Text style={labelStyle}>{label}</Text>}
    </Pressable>
  );
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  button: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, alignItems: 'center',
    justifyContent: 'center', borderRadius: 9, backgroundColor: colors.accent },
  buttonLabel: { color: colors.onAccent, fontSize: 14, fontWeight: '700' },
  secondaryLabel: { color: colors.ink },
  selectedLabel: { color: colors.accent, fontWeight: '800' },
}));
