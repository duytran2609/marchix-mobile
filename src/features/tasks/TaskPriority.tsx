import { Text } from 'react-native';
import { useScreenStyles } from '../../theme/screenStyles';
import { useTheme, type Palette } from '../../theme/theme';
import { taskUnsetLabel } from './taskLabels';

export function priorityTone(priority: string | undefined, colors: Palette) {
  switch (priority) {
    case 'Cao': return { text: colors.danger, background: colors.dangerSoft };
    case 'Trung bình': return { text: colors.warning, background: colors.warningSoft };
    case 'Thấp': return { text: colors.success, background: colors.successSoft };
  }
}

export function TaskPriority({ priority, colored = false }: { priority?: string; colored?: boolean }) {
  const styles = useScreenStyles();
  const { colors } = useTheme();
  const value = priority?.trim();
  const tone = colored ? priorityTone(value, colors) : undefined;
  return <Text style={[value ? styles.metadataValue : styles.unsetValue, tone && { color: tone.text }]}>{value || taskUnsetLabel}</Text>;
}
