import { StyleSheet, Text } from 'react-native';
import { createThemedStyles } from '../theme/theme';

export function overviewGreeting(name: unknown, email: string) {
  const displayName = typeof name === 'string' ? name.trim() : '';
  // The session uses the email as its fallback; greet neutrally in that case.
  return displayName && displayName !== email ? `Xin chào, ${displayName}!` : 'Xin chào!';
}

export function OverviewGreeting({ name, email }: { name: string; email: string }) {
  const styles = useStyles();
  return <Text accessibilityRole="header" style={styles.greeting}>{overviewGreeting(name, email)}</Text>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  greeting: { color: colors.ink, fontSize: 22, lineHeight: 30, fontWeight: '700',
    width: '100%', flexShrink: 1 },
}));
