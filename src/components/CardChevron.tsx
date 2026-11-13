import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { createThemedStyles } from '../theme/theme';

export function CardChevron() {
  const styles = useStyles();
  return <Text aria-hidden accessible={false} importantForAccessibility="no" style={styles.chevron}>›</Text>;
}

export function ClickableCardHeader({ children, trailing }: { children: ReactNode; trailing?: ReactNode }) {
  const styles = useStyles();
  return <View style={styles.header}>
    <View style={styles.title}>{children}</View>
    {trailing}
    <CardChevron />
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { flex: 1, minWidth: 0 },
  chevron: { alignSelf: 'flex-start', flexShrink: 0, color: colors.muted, fontSize: 20, lineHeight: 22 },
}));
