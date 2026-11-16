import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PopupCloseButton } from '../../components/PopupCloseButton';
import { useScreenStyles } from '../../theme/screenStyles';
import { createThemedStyles } from '../../theme/theme';

export function ProjectFormPopup({ title, children, onClose, busy }: {
  title: string; children: ReactNode; onClose: () => void; busy: boolean;
}) {
  const styles = useStyles();
  const screen = useScreenStyles();
  const close = () => { if (!busy) onClose(); };
  return <Modal visible transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
    <SafeAreaView style={styles.overlay}>
      <KeyboardAvoidingView behavior="padding" enabled={Platform.OS === 'ios'} style={styles.center}>
        <View role="dialog" accessibilityLabel={title} accessibilityViewIsModal style={styles.panel}>
          <View style={styles.header}>
            <Text accessibilityRole="header" style={[screen.cardTitle, styles.title]}>{title}</Text>
            <PopupCloseButton label="Đóng biểu mẫu" disabled={busy} onPress={close} />
          </View>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </Modal>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(33, 25, 53, 0.45)' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 12 },
  panel: { width: '100%', maxWidth: 560, maxHeight: '95%', flexShrink: 1,
    borderRadius: 16, overflow: 'hidden', backgroundColor: colors.paper },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 16,
    paddingRight: 8, borderBottomWidth: 1, borderBottomColor: colors.line },
  title: { flexShrink: 1 },
  scroll: { flexShrink: 1, minHeight: 0 },
  content: { padding: 16, gap: 12 },
}));
