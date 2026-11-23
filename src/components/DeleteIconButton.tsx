import { Pressable, StyleSheet, View } from 'react-native';
import { createThemedStyles } from '../theme/theme';

export function DeleteIconButton({ label, disabled, onPress }: {
  label: string; disabled?: boolean; onPress: () => void;
}) {
  const styles = useStyles();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled}
    onPress={onPress} style={({ pressed }) => [styles.button, (pressed || disabled) && styles.dimmed]}>
    <View aria-hidden pointerEvents="none" style={styles.icon}>
      <View style={styles.handle} />
      <View style={styles.lid} />
      <View style={styles.bin}>
        <View style={styles.slot} />
        <View style={styles.slot} />
      </View>
    </View>
  </Pressable>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  button: { width: 44, height: 44, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  dimmed: { opacity: 0.55 },
  icon: { width: 22, height: 22, alignItems: 'center' },
  handle: { width: 8, height: 4, borderWidth: 2, borderBottomWidth: 0,
    borderTopLeftRadius: 2, borderTopRightRadius: 2, borderColor: colors.danger },
  lid: { width: 20, height: 2, borderRadius: 1, backgroundColor: colors.danger },
  bin: { width: 16, height: 15, borderWidth: 2, borderTopWidth: 0, borderColor: colors.danger,
    borderBottomLeftRadius: 3, borderBottomRightRadius: 3, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 3 },
  slot: { width: 2, height: 7, borderRadius: 1, backgroundColor: colors.danger },
}));
