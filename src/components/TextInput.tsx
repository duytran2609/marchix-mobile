import type { ComponentProps } from 'react';
import { TextInput as NativeTextInput } from 'react-native';
import { useTheme } from '../theme/theme';

export function TextInput(props: ComponentProps<typeof NativeTextInput>) {
  const { colors } = useTheme();
  return <NativeTextInput {...props} placeholderTextColor={colors.placeholder} />;
}
