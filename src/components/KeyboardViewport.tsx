import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import type { ViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { SafeAreaViewProps } from 'react-native-safe-area-context';

export function KeyboardViewport({ style, ...props }: ViewProps) {
  const [webFrame, setWebFrame] = useState<{ height: number; top: number }>();

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const viewport = window.visualViewport;
    if (!viewport) return;

    function update() {
      if (!viewport) return;
      const { height, offsetTop: top, scale } = viewport;
      setWebFrame(previous => {
        if (scale !== 1 || height >= window.innerHeight - 1) return undefined;
        return previous?.height === height && previous.top === top ? previous : { height, top };
      });
    }

    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, []);

  if (Platform.OS === 'ios') {
    return <KeyboardAvoidingView {...props} style={style} behavior="padding" />;
  }
  return <View {...props} style={[style, webFrame && { ...webFrame, flex: 0 }]} />;
}

export function KeyboardSafeAreaView(props: SafeAreaViewProps) {
  return <KeyboardViewport style={styles.fill}>
    <SafeAreaView {...props} />
  </KeyboardViewport>;
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
