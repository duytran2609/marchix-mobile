import { useState, type ComponentProps } from 'react';
import { StyleSheet, TextInput as NativeTextInput } from 'react-native';
import { metadataValueStyle, useTheme } from '../theme/theme';

export function TextInput({ style, onChangeText, ...props }: ComponentProps<typeof NativeTextInput>) {
  const { colors } = useTheme();
  const [hasUncontrolledValue, setHasUncontrolledValue] = useState(Boolean(props.defaultValue));
  const isControlled = props.value !== undefined;
  const hasValue = isControlled ? Boolean(props.value) : hasUncontrolledValue;
  const showsPlaceholder = !!props.placeholder && !hasValue;

  return <NativeTextInput {...props} style={[style, metadataValueStyle(colors), showsPlaceholder && styles.placeholder]}
    placeholderTextColor={colors.placeholder} onChangeText={isControlled ? onChangeText : (text) => {
      setHasUncontrolledValue(text.length > 0);
      onChangeText?.(text);
    }} />;
}

const styles = StyleSheet.create({
  placeholder: { fontWeight: '400' },
});
