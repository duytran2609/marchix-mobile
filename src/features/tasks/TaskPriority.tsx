import { Text } from 'react-native';
import { useTheme } from '../../theme/theme';

const priorityTones = new Map<string, 'success' | 'warning' | 'danger'>([
  ['Thấp', 'success'], ['Trung bình', 'warning'], ['Cao', 'danger'],
]);

export function TaskPriority({ priority }: { priority?: string }) {
  const { colors } = useTheme();
  const tone = priorityTones.get(priority ?? '');
  return <Text style={tone ? { color: colors[tone], fontWeight: '700' } : undefined}>{priority || 'Chưa đặt'}</Text>;
}
