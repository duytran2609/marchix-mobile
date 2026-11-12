import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../theme/theme';

export function DeleteIconButton({ label, disabled, onPress }: {
  label: string; disabled?: boolean; onPress: () => void;
}) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled}
    onPress={onPress} style={({ pressed }) => [styles.button, (pressed || disabled) && styles.dimmed]}>
    <Text aria-hidden style={{ color: colors.danger, fontSize: 22 }}>🗑︎</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  button: { width: 44, height: 44, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  dimmed: { opacity: 0.55 },
});
