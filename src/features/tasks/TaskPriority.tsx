import { Text } from 'react-native';
import { useScreenStyles } from '../../theme/screenStyles';

export function TaskPriority({ priority }: { priority?: string }) {
  const styles = useScreenStyles();
  return <Text style={styles.metadataValue}>{priority || 'Chưa đặt'}</Text>;
}
