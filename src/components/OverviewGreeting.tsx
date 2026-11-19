import { StyleSheet, Text } from 'react-native';
import { createThemedStyles } from '../theme/theme';

function greetingName(name: unknown, email: string) {
  const displayName = typeof name === 'string' ? name.trim() : '';
  // The session uses the email as its fallback; greet neutrally in that case.
  return displayName && displayName !== email ? displayName : '';
}

export function overviewGreeting(name: unknown, email: string) {
  const displayName = greetingName(name, email);
  return displayName ? `Xin chào, ${displayName}!` : 'Xin chào!';
}

export function OverviewGreeting({ name, email }: { name: string; email: string }) {
  const styles = useStyles();
  const displayName = greetingName(name, email);
  return <Text accessibilityRole="header" style={styles.greeting}>
    {displayName ? <>Xin chào, <Text style={styles.name}>{displayName}</Text>!</> : 'Xin chào!'}
  </Text>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  greeting: { color: colors.ink, fontSize: 22, lineHeight: 30, fontWeight: '400',
    width: '100%', flexShrink: 1 },
  name: { color: colors.accent, fontWeight: '700' },
}));
