import { useEffect, useRef } from 'react';
import type { ComponentRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { createThemedStyles } from '../theme/theme';

export function ConfirmDialog({ label, title, message, action, pendingAction, pending, error, onCancel, onConfirm }: {
  label: string; title: string; message: string; action: string; pendingAction: string; pending: boolean;
  error?: string; onCancel: () => void; onConfirm: () => void;
}) {
  const styles = useStyles();
  const cancel = useRef<ComponentRef<typeof Pressable>>(null);
  useEffect(() => {
    if (Platform.OS === 'web') cancel.current?.focus();
  }, []);

  return <View style={styles.backdrop}>
    <View role="alertdialog" accessibilityLabel={label} accessibilityViewIsModal style={styles.panel}>
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        <Pressable ref={cancel} accessibilityRole="button" disabled={pending} onPress={onCancel}
          style={({ pressed }) => [styles.button, pressed && styles.pressed, pending && styles.dimmed]}>
          <Text style={styles.cancel}>Hủy</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={pending} onPress={onConfirm}
          style={({ pressed }) => [styles.button, styles.danger, (pressed || pending) && styles.dimmed]}>
          <Text style={styles.action}>{pending ? pendingAction : action}</Text>
        </Pressable>
      </View>
    </View>
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, zIndex: 2, elevation: 16, justifyContent: 'center', alignItems: 'center',
    padding: 20, backgroundColor: 'rgba(33, 25, 53, 0.48)' },
  panel: { width: '100%', maxWidth: 360, padding: 20, gap: 12, borderRadius: 16, backgroundColor: colors.paper },
  title: { color: colors.ink, fontSize: 20, fontWeight: '800' },
  message: { color: colors.muted, fontSize: 15 },
  error: { color: colors.danger, fontSize: 14 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8 },
  button: { minHeight: 44, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center',
    justifyContent: 'center', backgroundColor: colors.background },
  cancel: { color: colors.ink, fontWeight: '700' },
  danger: { backgroundColor: colors.danger },
  action: { color: colors.onAccent, fontWeight: '700' },
  pressed: { backgroundColor: colors.surfaceMuted },
  dimmed: { opacity: 0.65 },
}));
