import { Pressable, StyleSheet, Text } from 'react-native';
import { createThemedStyles } from '../theme/theme';

export function PopupCloseButton({ label, onPress, disabled, tone }: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'accent';
}) {
  const styles = useStyles();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled}
      onPress={onPress} style={styles.button}>
      <Text style={[styles.icon, tone === 'accent' && styles.accent]}>×</Text>
    </Pressable>
  );
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  icon: { color: colors.ink, fontSize: 28, lineHeight: 32 },
  accent: { color: colors.accent },
}));
