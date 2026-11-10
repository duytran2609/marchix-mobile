import { Pressable, StyleSheet, Text } from 'react-native';
import { screenStyles } from '../theme/screenStyles';
import { colors } from '../theme/theme';

export function Button({ label, onPress, secondary = false, disabled = false }: {
  label: string; onPress: () => void; secondary?: boolean; disabled?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled}
      onPress={onPress} style={({ pressed }) => [
        styles.button, secondary && screenStyles.secondary, (pressed || disabled) && screenStyles.dimmed,
      ]}>
      <Text style={[styles.buttonLabel, secondary && styles.secondaryLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, alignItems: 'center',
    justifyContent: 'center', borderRadius: 9, backgroundColor: colors.accent },
  buttonLabel: { color: colors.paper, fontSize: 14, fontWeight: '700' },
  secondaryLabel: { color: colors.ink },
});
