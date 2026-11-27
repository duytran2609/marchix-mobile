import { useState, type ComponentProps, type ReactNode } from 'react';
import { StyleSheet, Text, TextInput as NativeTextInput, View } from 'react-native';
import { metadataValueStyle, useTheme } from '../theme/theme';

export function TextInput({ style, onChangeText, maxLength = 250, accessory, numeric, ...props }:
  ComponentProps<typeof NativeTextInput> & { accessory?: ReactNode; numeric?: boolean }) {
  const { colors } = useTheme();
  const [uncontrolledLength, setUncontrolledLength] = useState(props.defaultValue?.length ?? 0);
  const length = props.value?.length ?? uncontrolledLength;
  const isNumeric = numeric || (props.inputMode !== undefined
    ? props.inputMode === 'numeric' || props.inputMode === 'decimal'
    : props.keyboardType === 'numeric' || props.keyboardType === 'number-pad' || props.keyboardType === 'decimal-pad');
  // Let users shorten stored text that already exceeds the limit.
  const limit = isNumeric ? undefined : Math.max(maxLength, length);
  const { flex, flexBasis, flexGrow, flexShrink, minWidth, maxWidth, width, alignSelf, ...inputStyle } =
    StyleSheet.flatten(style) ?? {};
  const showsPlaceholder = !!props.placeholder && length === 0;
  const placeholderStyle = showsPlaceholder && {
    fontSize: (inputStyle.fontSize ?? 14) - 1,
    fontWeight: '400' as const,
  };

  return <View style={{ flex, flexBasis, flexGrow, flexShrink, minWidth, maxWidth, width, alignSelf }}>
    <View>
      <NativeTextInput {...props} maxLength={limit} style={[inputStyle, metadataValueStyle(colors), placeholderStyle]}
        placeholderTextColor={colors.inputPlaceholder} onChangeText={text => {
          if (props.value === undefined) setUncontrolledLength(text.length);
          onChangeText?.(text);
        }} />
      {accessory}
    </View>
    {limit !== undefined && <Text style={[styles.counter, { color: colors.muted }]}>{length}/{limit}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  counter: { alignSelf: 'flex-end', marginTop: 2, paddingHorizontal: 2, fontSize: 11, lineHeight: 14 },
});
