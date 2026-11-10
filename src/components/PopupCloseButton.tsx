import { Pressable, StyleSheet, Text } from 'react-native';

export function PopupCloseButton({ label, onPress, disabled }: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled}
      onPress={onPress} style={styles.button}>
      <Text style={styles.icon}>×</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  icon: { color: '#000', fontSize: 28, lineHeight: 32 },
});
