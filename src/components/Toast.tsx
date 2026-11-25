import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createThemedStyles } from '../theme/theme';

const TOAST_SLIDE_DISTANCE = 12;

type Toast = {
  message: string;
  tone: 'success' | 'error' | 'neutral';
  translateY: Animated.Value;
  opacity: Animated.Value;
};
type ShowToast = (message: string, tone?: Toast['tone']) => void;

const ToastAction = createContext<ShowToast | null>(null);
const ToastDisplay = createContext<{
  toast: Toast | null;
  activeLayer?: symbol;
  dismissToast: () => void;
  registerLayer: (layer: symbol) => () => void;
}>({ toast: null, dismissToast: () => {}, registerLayer: () => () => {} });

export function useToast() {
  const showToast = useContext(ToastAction);
  if (!showToast) throw new Error('ToastProvider is required.');
  return showToast;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const styles = useStyles();
  const [toast, setToast] = useState<Toast | null>(null);
  const [layers, setLayers] = useState<symbol[]>([]);
  const dismissCurrent = useRef<(() => void) | null>(null);

  const dismissToast = useCallback(() => dismissCurrent.current?.(), []);

  const showToast = useCallback<ShowToast>((message, tone = 'success') => {
    setToast({ message, tone, translateY: new Animated.Value(TOAST_SLIDE_DISTANCE), opacity: new Animated.Value(0) });
  }, []);

  const registerLayer = useCallback((layer: symbol) => {
    setLayers(current => [...current, layer]);
    return () => setLayers(current => current.filter(item => item !== layer));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const useNativeDriver = Platform.OS !== 'web';
    const entryTiming = { duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver };
    const slideAndFadeIn = Animated.parallel([
      Animated.timing(toast.translateY, { ...entryTiming, toValue: 0 }),
      Animated.timing(toast.opacity, { ...entryTiming, toValue: 1 }),
    ]);
    const exitTiming = { duration: 200, useNativeDriver };
    const slideAndFadeOut = Animated.parallel([
      Animated.timing(toast.translateY, { ...exitTiming, toValue: TOAST_SLIDE_DISTANCE }),
      Animated.timing(toast.opacity, { ...exitTiming, toValue: 0 }),
    ]);
    let dismissing = false;
    let exitTimer: ReturnType<typeof setTimeout> | undefined;
    const removeToast = () => setToast(current => current === toast ? null : current);
    const dismiss = () => {
      if (dismissing) return;
      dismissing = true;
      clearTimeout(timer);
      slideAndFadeIn.stop();
      // A background browser tab can pause the frames needed to finish the exit animation.
      exitTimer = setTimeout(removeToast, exitTiming.duration + 50);
      slideAndFadeOut.start(({ finished }) => {
        if (finished) removeToast();
      });
    };
    const timer = setTimeout(dismiss, 3000);
    dismissCurrent.current = dismiss;
    slideAndFadeIn.start();
    return () => {
      dismissCurrent.current = null;
      clearTimeout(timer);
      clearTimeout(exitTimer);
      slideAndFadeIn.stop();
      slideAndFadeOut.stop();
    };
  }, [toast]);

  return (
    <ToastAction.Provider value={showToast}>
      <ToastDisplay.Provider value={{ toast, activeLayer: layers.at(-1), dismissToast, registerLayer }}>
        <View style={styles.root}>
          {children}
          <ToastViewport />
        </View>
      </ToastDisplay.Provider>
    </ToastAction.Provider>
  );
}

// A native modal needs its own viewport above the underlying screen.
export function ToastLayer({ safeAreaApplied = false }: { safeAreaApplied?: boolean }) {
  const [layer] = useState(() => Symbol());
  const { registerLayer } = useContext(ToastDisplay);
  useEffect(() => registerLayer(layer), [layer, registerLayer]);
  return <ToastViewport layer={layer} safeAreaApplied={safeAreaApplied} />;
}

function ToastViewport({ layer, safeAreaApplied = false }: { layer?: symbol; safeAreaApplied?: boolean }) {
  const styles = useStyles();
  const { toast, activeLayer, dismissToast } = useContext(ToastDisplay);
  const insets = useSafeAreaInsets();
  if (!toast || activeLayer !== layer) return null;
  const isError = toast.tone === 'error';

  return (
    <View pointerEvents="box-none" style={[styles.viewport, { bottom: (safeAreaApplied ? 0 : insets.bottom) + 16 }]}>
      <Animated.View pointerEvents="box-none" style={[styles.toast, isError && styles.error,
        { opacity: toast.opacity, transform: [{ translateY: toast.translateY }] }]}>
        {toast.tone !== 'neutral' && (
          <View pointerEvents="none" aria-hidden importantForAccessibility="no-hide-descendants"
            style={[styles.icon, isError && styles.errorIcon]}>
            <Text style={[styles.iconGlyph, isError && styles.errorGlyph]}>{isError ? '\u26A0\uFE0E' : '✓'}</Text>
          </View>
        )}
        <Text accessibilityRole={isError ? 'alert' : undefined} accessibilityLiveRegion={isError ? 'assertive' : 'polite'}
          pointerEvents="none" style={[styles.message, isError && styles.errorText]}>
          {toast.message}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Đóng thông báo nhanh"
          onPress={dismissToast} style={styles.closeButton}>
          <Text style={[styles.closeGlyph, isError && styles.errorText]}>×</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  root: { flex: 1 },
  viewport: { position: 'absolute', left: 16, right: 16, alignItems: 'center', zIndex: 100 },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: 380, paddingHorizontal: 14,
    borderRadius: 14, backgroundColor: colors.ink,
    boxShadow: '0 4px 12px rgba(33, 25, 53, 0.18)' },
  message: { flexShrink: 1, paddingVertical: 9, color: colors.inverseText, fontSize: 14, lineHeight: 20 },
  closeButton: { width: 44, height: 44, marginRight: -9, alignItems: 'center', justifyContent: 'center' },
  closeGlyph: { color: colors.inverseText, fontSize: 20, lineHeight: 24 },
  icon: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.successSoft },
  iconGlyph: { color: colors.success, fontSize: 14, lineHeight: 18, fontWeight: '700', includeFontPadding: false },
  error: { backgroundColor: colors.danger },
  errorText: { color: colors.onAccent },
  errorIcon: { backgroundColor: colors.dangerSoft },
  errorGlyph: { color: colors.danger },
}));
