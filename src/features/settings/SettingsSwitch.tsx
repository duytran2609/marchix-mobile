import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '../../theme/theme';

export function SettingsSwitch({ label, checked, disabled, onChange }: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  const { colors } = useTheme();

  return (
    <Pressable accessibilityRole="switch" accessibilityLabel={label} aria-checked={checked}
      disabled={disabled} onPress={() => onChange(!checked)}
      onKeyDown={Platform.OS === 'web' ? event => {
        const { key, repeat } = event as typeof event & { key?: string; repeat?: boolean };
        if (key !== ' ' || disabled) return;
        event.preventDefault();
        if (!repeat) onChange(!checked);
      } : undefined}
      style={[styles.toggle, disabled && styles.disabled]}>
      <View aria-hidden pointerEvents="none" style={[styles.track, {
        backgroundColor: checked ? colors.accent : colors.line,
        alignItems: checked ? 'flex-end' : 'flex-start',
      }]}>
        <View testID="settings-switch-thumb" style={styles.thumb} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toggle: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.5 },
  track: { width: 40, height: 14, borderRadius: 7, justifyContent: 'center' },
  thumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFF',
    ...Platform.select({
      web: { boxShadow: 'inset 0 0 0 0.5px #000000' },
      default: { borderWidth: StyleSheet.hairlineWidth, borderColor: '#000000' },
    }) },
});
