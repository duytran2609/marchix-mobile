import { Pressable, StyleSheet, Text, View } from 'react-native';
import { createThemedStyles } from '../theme/theme';

export function ChoiceButtons<T extends string>({ items, value, onChange, disabled }: {
  items: readonly { value: T; label: string }[]; value: T; onChange: (value: T) => void; disabled: boolean;
}) {
  const styles = useStyles();
  return <View style={styles.row}>{items.map(item => (
    <Pressable key={item.value} accessibilityRole="radio" aria-checked={value === item.value}
      onPress={() => onChange(item.value)} disabled={disabled}
      style={[styles.choice, value === item.value && styles.highlight]}>
      <Text style={[styles.label, value === item.value && styles.selectedLabel]}>{item.label}</Text>
    </Pressable>
  ))}</View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  choice: { minHeight: 44, justifyContent: 'center', borderRadius: 9, borderWidth: 1,
    borderColor: colors.line, paddingHorizontal: 10 },
  highlight: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  label: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  selectedLabel: { color: colors.accent, fontSize: 13, fontWeight: '800' },
}));
