import { Pressable, StyleSheet, Text, View } from 'react-native';
import { createThemedStyles } from '../theme/theme';

export function SegmentedButtons<Value extends string>({ label, value, choices, onChange }: {
  label: string;
  value: Value;
  choices: readonly { value: Value; label: string }[];
  onChange: (value: Value) => void;
}) {
  const styles = useStyles();
  return <View style={styles.track} accessibilityLabel={label}>
    {choices.map(choice => <Pressable key={choice.value} accessibilityRole="button" aria-pressed={value === choice.value}
      onPress={() => onChange(choice.value)} style={[styles.button, value === choice.value && styles.active]}>
      <Text style={[styles.label, value === choice.value && styles.activeLabel]}>{choice.label}</Text>
    </Pressable>)}
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  track: { flexDirection: 'row', gap: 4, padding: 3, borderRadius: 10, backgroundColor: colors.surfaceMuted },
  button: { flex: 1, minHeight: 44, paddingHorizontal: 6, paddingVertical: 8, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center' },
  active: { backgroundColor: colors.paper },
  label: { color: colors.muted, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  activeLabel: { color: colors.accent, fontSize: 13, fontWeight: '800', textAlign: 'center' },
}));
