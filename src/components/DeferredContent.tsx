import { reloadAppAsync } from 'expo';
import { Component, Suspense, type ReactNode } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useScreenStyles } from '../theme/screenStyles';
import { useTheme } from '../theme/theme';
import { Button } from './Button';

export class DeferredContent extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) return <LoadError />;
    return <Suspense fallback={<Loading />}>{this.props.children}</Suspense>;
  }
}

function Loading() {
  const { colors } = useTheme();
  return <ActivityIndicator accessibilityLabel="Đang tải màn hình" color={colors.accent} />;
}

function LoadError() {
  const styles = useScreenStyles();
  return <View style={styles.panel}>
    <Text accessibilityRole="alert" style={styles.error}>Không tải được màn hình. Vui lòng tải lại ứng dụng.</Text>
    <Button label="Tải lại ứng dụng" onPress={() => void reloadAppAsync()} />
  </View>;
}
