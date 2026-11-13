import { Text } from 'react-native';
import type { TextProps } from 'react-native';
import { useTheme } from '../theme/theme';

export function FieldLabel({ children, required = false, ...props }: TextProps & { required?: boolean }) {
  const { colors } = useTheme();
  return <Text {...props}>{children}{required && <Text style={{ color: colors.danger }}>{' *'}</Text>}</Text>;
}
