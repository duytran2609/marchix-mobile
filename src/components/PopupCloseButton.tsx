import { Pressable, StyleSheet, Text } from 'react-native';
import { createThemedStyles } from '../theme/theme';

export function PopupCloseButton({ label, onPress, disabled }: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const styles = useStyles();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled}
      onPress={onPress} style={styles.button}>
      <Text style={styles.icon}>×</Text>
    </Pressable>
  );
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  icon: { color: colors.ink, fontSize: 28, lineHeight: 32 },
}));
