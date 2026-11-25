import { Pressable, StyleSheet, Text } from 'react-native';
import { useScreenStyles } from '../theme/screenStyles';

export function DisclosureButton({ label, expanded, onPress }: {
  label: string; expanded: boolean; onPress: () => void;
}) {
  const styles = useScreenStyles();
  return <Pressable accessibilityRole="button" aria-expanded={expanded} onPress={onPress}
    style={({ pressed }) => [styles.secondary, local.button, pressed && styles.dimmed]}>
    <Text style={[styles.label, styles.listHeading]}>{label}</Text>
    <Text aria-hidden style={styles.muted}>{expanded ? '▴' : '▾'}</Text>
  </Pressable>;
}

const local = StyleSheet.create({
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    minHeight: 44, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10 },
});
