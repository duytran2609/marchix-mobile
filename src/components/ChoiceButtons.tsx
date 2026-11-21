import { Pressable, StyleSheet, Text, View } from 'react-native';
import { createThemedStyles, metadataValueStyle } from '../theme/theme';

export function ChoiceButtons<T extends string>({ items, value, onChange, disabled }: {
  items: readonly { value: T; label: string; disabled?: boolean }[]; value: T; onChange: (value: T) => void; disabled: boolean;
}) {
  const styles = useStyles();
  return <View style={styles.row}>{items.map(item => (
    <Pressable key={item.value} accessibilityRole="radio" aria-checked={value === item.value}
      onPress={() => onChange(item.value)} disabled={disabled || item.disabled}
      style={[styles.choice, value === item.value && styles.highlight, item.disabled && styles.disabled]}>
      <Text style={styles.label}>{item.label}</Text>
    </Pressable>
  ))}</View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  choice: { minHeight: 44, justifyContent: 'center', borderRadius: 9, borderWidth: 1,
    borderColor: colors.line, paddingHorizontal: 10 },
  highlight: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  disabled: { opacity: 0.5 },
  label: { ...metadataValueStyle(colors), fontSize: 14 },
}));
