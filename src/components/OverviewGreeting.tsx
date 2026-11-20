import { StyleSheet, Text, View } from 'react-native';
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
  return <View style={styles.banner}>
    <View aria-hidden accessible={false} importantForAccessibility="no-hide-descendants"
      pointerEvents="none" style={styles.decoration}>
      <View style={styles.innerRing} />
      <View style={styles.dot} />
    </View>
    <Text accessibilityRole="header" style={styles.greeting}>
      {displayName ? <>Xin chào, <Text style={styles.name}>{displayName}</Text>!</> : 'Xin chào!'}
    </Text>
    <Text style={styles.suggestion}>Chọn một việc quan trọng hôm nay và bắt đầu từ bước nhỏ nhất.</Text>
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  banner: { paddingHorizontal: 20, paddingVertical: 22, borderRadius: 18, borderWidth: 1,
    borderColor: colors.line, backgroundColor: colors.accentSoft, overflow: 'hidden' },
  decoration: { position: 'absolute', right: -30, top: -54, width: 176, height: 176, borderRadius: 88,
    borderWidth: 1, borderColor: colors.accent, opacity: 0.16, justifyContent: 'center', alignItems: 'center' },
  innerRing: { width: 132, height: 132, borderRadius: 66, borderWidth: 1, borderColor: colors.accent },
  dot: { position: 'absolute', left: 16, bottom: 26, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.accent },
  greeting: { color: colors.ink, fontSize: 28, lineHeight: 36, fontWeight: '400',
    width: '100%', flexShrink: 1 },
  name: { color: colors.accent, fontWeight: '800' },
  suggestion: { marginTop: 8, color: colors.muted, fontSize: 15, lineHeight: 22 },
}));
