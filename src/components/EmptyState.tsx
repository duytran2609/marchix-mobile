import { Image, StyleSheet, Text, View } from 'react-native';
import { createThemedStyles } from '../theme/theme';

const icons = {
  approval: require('../../assets/empty-state/approval.png'),
  bell: require('../../assets/empty-state/bell.png'),
  calendar: require('../../assets/empty-state/calendar.png'),
  chart: require('../../assets/empty-state/chart.png'),
  chat: require('../../assets/empty-state/chat.png'),
  document: require('../../assets/empty-state/document.png'),
  history: require('../../assets/empty-state/history.png'),
  note: require('../../assets/empty-state/note.png'),
  people: require('../../assets/empty-state/people.png'),
  project: require('../../assets/empty-state/project.png'),
  search: require('../../assets/empty-state/search.png'),
  tasks: require('../../assets/empty-state/tasks.png'),
  wallet: require('../../assets/empty-state/wallet.png'),
};

export type EmptyStateIcon = keyof typeof icons;

export function EmptyState({ icon, message, detail, announce = false }: {
  icon: EmptyStateIcon; message: string; detail?: string; announce?: boolean;
}) {
  const styles = useStyles();
  return <View style={styles.container}>
    <Image source={icons[icon]} aria-hidden accessible={false} importantForAccessibility="no-hide-descendants"
      resizeMode="contain" style={styles.icon} />
    <Text accessibilityLiveRegion={announce ? 'polite' : undefined} style={styles.message}>{message}</Text>
    {detail && <Text style={styles.message}>{detail}</Text>}
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  container: { alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 8, opacity: 0.9 },
  icon: { width: 32, height: 32, tintColor: colors.placeholder },
  message: { color: colors.placeholder, textAlign: 'center', fontSize: 13, lineHeight: 19 },
}));
