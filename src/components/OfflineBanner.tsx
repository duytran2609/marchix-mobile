import { useNetworkState } from 'expo-network';
import { StyleSheet, Text, View } from 'react-native';
import { createThemedStyles } from '../theme/theme';

export function OfflineBanner() {
  const styles = useStyles();
  const { isConnected, isInternetReachable } = useNetworkState();

  if (isConnected !== false && isInternetReachable !== false) return null;
  return <View style={styles.banner}>
    <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.message}>
      Không có kết nối Internet
    </Text>
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  banner: { backgroundColor: colors.warningSoft, paddingHorizontal: 16, paddingVertical: 8 },
  message: { color: colors.warning, fontSize: 13, fontWeight: '700', textAlign: 'center' },
}));
