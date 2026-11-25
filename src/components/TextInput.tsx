import { useState, type ComponentProps } from 'react';
import { StyleSheet, TextInput as NativeTextInput } from 'react-native';
import { metadataValueStyle, useTheme } from '../theme/theme';

export function TextInput({ style, onChangeText, ...props }: ComponentProps<typeof NativeTextInput>) {
  const { colors } = useTheme();
  const [hasUncontrolledValue, setHasUncontrolledValue] = useState(Boolean(props.defaultValue));
  const isControlled = props.value !== undefined;
  const hasValue = isControlled ? Boolean(props.value) : hasUncontrolledValue;
  const showsPlaceholder = !!props.placeholder && !hasValue;
  const placeholderStyle = showsPlaceholder && {
    fontSize: (StyleSheet.flatten(style)?.fontSize ?? 14) - 1,
    fontWeight: '400' as const,
  };

  return <NativeTextInput {...props} style={[style, metadataValueStyle(colors), placeholderStyle]}
    placeholderTextColor={colors.inputPlaceholder} onChangeText={isControlled ? onChangeText : (text) => {
      setHasUncontrolledValue(text.length > 0);
      onChangeText?.(text);
    }} />;
}
