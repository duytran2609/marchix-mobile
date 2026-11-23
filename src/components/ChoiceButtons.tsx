import { Pressable, StyleSheet, Text, View } from 'react-native';
import { createThemedStyles, metadataValueStyle } from '../theme/theme';

type ChoiceTone = { text: string; background: string };

export function ChoiceButtons<T extends string>({ items, value, onChange, disabled, label }: {
  items: readonly { value: T; label: string; disabled?: boolean; tone?: ChoiceTone }[];
  value: T; onChange: (value: T) => void; disabled: boolean;
  label?: string;
}) {
  const styles = useStyles();
  return <View style={styles.row} accessibilityRole={label ? 'radiogroup' : undefined} accessibilityLabel={label}>{items.map(item => {
    const selected = value === item.value;
    const tone = item.tone;
    return <Pressable key={item.value} accessibilityRole="radio" aria-checked={selected}
      onPress={() => onChange(item.value)} disabled={disabled || item.disabled}
      style={[styles.choice, tone && styles.tonedChoice, selected && !tone && styles.highlight,
        tone && { backgroundColor: tone.background }, tone && selected && { borderColor: tone.text },
        item.disabled && styles.disabled]}>
      <Text style={[styles.label, tone && styles.tonedLabel, tone && { color: tone.text }]}>{item.label}</Text>
    </Pressable>;
  })}</View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  choice: { minHeight: 44, justifyContent: 'center', borderRadius: 9, borderWidth: 1,
    borderColor: colors.line, paddingHorizontal: 10 },
  highlight: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  tonedChoice: { borderRadius: 13 },
  disabled: { opacity: 0.5 },
  label: { ...metadataValueStyle(colors), fontSize: 14 },
  tonedLabel: { fontWeight: '700' },
}));
