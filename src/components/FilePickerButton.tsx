import { Pressable, StyleSheet, Text } from 'react-native';
import { createThemedStyles } from '../theme/theme';

export function FilePickerButton({ accessibilityLabel, hint, picking, disabled, onPress,
  label = '+ Chọn tệp', pickingLabel = 'Đang chọn tệp…' }: {
  accessibilityLabel?: string; hint: string; picking: boolean; disabled: boolean; onPress: () => void;
  label?: string; pickingLabel?: string;
}) {
  const styles = useStyles();
  const action = picking ? pickingLabel : label;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? action} accessibilityHint={hint}
      disabled={disabled || picking} onPress={onPress}
      style={({ pressed }) => [styles.picker, (pressed || disabled || picking) && styles.dimmed]}>
      <Text style={styles.action}>{action}</Text>
      <Text style={styles.hint}>{hint}</Text>
    </Pressable>
  );
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  picker: { padding: 16, alignItems: 'center', gap: 6, borderRadius: 9, borderWidth: 1, borderStyle: 'dashed',
    borderColor: colors.accent, backgroundColor: colors.accentSoft },
  action: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  hint: { color: colors.muted, fontSize: 12, textAlign: 'center' },
  dimmed: { opacity: 0.65 },
}));
