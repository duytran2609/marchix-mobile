import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useScreenStyles } from '../theme/screenStyles';

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  const styles = useScreenStyles();
  return (
    <View style={[styles.listHeader, styles.pageHeader]}>
      <Text accessibilityRole="header" accessibilityLabel={title} style={[styles.heading, styles.pageHeading]}>
        {title}
      </Text>
      {children}
    </View>
  );
}
