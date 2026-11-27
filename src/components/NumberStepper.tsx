import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { createThemedStyles } from '../theme/theme';
import { TextInput } from './TextInput';

export type NumberStepBounds = { min?: number; max?: number; emptyValue?: number };
type InputProps = ComponentProps<typeof TextInput>;

export function NumberStepper({ value, onChangeText, accessibilityLabel, editable = true, style,
  min = 0, max = Number.MAX_SAFE_INTEGER, emptyValue = 0, ...props }:
  Omit<InputProps, 'value' | 'onChangeText' | 'accessibilityLabel' | 'maxLength'> & NumberStepBounds & {
    value: string; onChangeText: (value: string) => void; accessibilityLabel: string;
  }) {
  const styles = useStyles();
  const text = value.trim();
  const [, integer, separator, fraction] = /^(\d*)(?:([.,])(\d*))?$/.exec(text) ?? [];
  const whole = text === '' ? emptyValue : integer || fraction ? Number(integer) : NaN;

  return <TextInput {...props} numeric accessibilityLabel={accessibilityLabel} editable={editable}
    value={value} onChangeText={onChangeText} style={[style, styles.input]} accessory={
    <View style={styles.arrows}>
      {([1, -1] as const).map(step => {
        const nextWhole = whole + step;
        const result = fraction ? `${nextWhole}${separator}${fraction}` : String(nextWhole);
        const next = Number(result.replace(',', '.'));
        const disabled = !editable || !Number.isSafeInteger(nextWhole) || nextWhole < 0 || next < min || next > max;
        return <Pressable key={step} accessibilityRole="button" disabled={disabled}
          accessibilityState={{ disabled }}
          accessibilityLabel={`${step === 1 ? 'Tăng' : 'Giảm'} ${accessibilityLabel.toLocaleLowerCase('vi')}`}
          onPress={() => onChangeText(result)}
          style={({ pressed }) => [styles.arrow, step === -1 && styles.divider, (pressed || disabled) && styles.dimmed]}>
          <Text aria-hidden style={styles.glyph}>{step === 1 ? '▴' : '▾'}</Text>
        </Pressable>;
      })}
    </View>
  } />;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  input: { paddingRight: 36 },
  arrows: { position: 'absolute', top: 1, bottom: 1, right: 1, width: 30, borderLeftWidth: 1,
    borderTopRightRadius: 8, borderBottomRightRadius: 8, borderColor: colors.line, backgroundColor: colors.accentSoft },
  arrow: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  divider: { borderTopWidth: 1, borderColor: colors.line },
  dimmed: { opacity: 0.4 },
  glyph: { color: colors.accent, fontSize: 15, lineHeight: 17 },
}));
