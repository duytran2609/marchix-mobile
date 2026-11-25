import type { ReactNode } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PopupBody } from '../../components/PopupBody';
import { KeyboardViewport } from '../../components/KeyboardViewport';
import { PopupHeader } from '../../components/PopupHeader';
import { createThemedStyles } from '../../theme/theme';

export function ProjectFormPopup({ title, children, onClose, busy, tabs, contentKey, footer }: {
  title: string; children: ReactNode; onClose: () => void; busy: boolean;
  tabs?: ReactNode; contentKey?: string; footer?: ReactNode;
}) {
  const styles = useStyles();
  const close = () => { if (!busy) onClose(); };
  return <Modal visible transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
    <SafeAreaView style={styles.overlay}>
      <KeyboardViewport style={styles.center}>
        <View role="dialog" accessibilityLabel={title} accessibilityViewIsModal style={styles.panel}>
          <PopupHeader title={title} closeLabel="Đóng biểu mẫu" disabled={busy} onClose={close} />
          {tabs && <View style={styles.tabs}>{tabs}</View>}
          <PopupBody key={contentKey} contentContainerStyle={styles.content} footer={footer}>
            {children}
          </PopupBody>
        </View>
      </KeyboardViewport>
    </SafeAreaView>
  </Modal>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(33, 25, 53, 0.45)' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 12 },
  panel: { width: '100%', maxWidth: 560, maxHeight: '95%', flexShrink: 1,
    borderRadius: 16, overflow: 'hidden', backgroundColor: colors.paper },
  tabs: { paddingHorizontal: 16, paddingTop: 12 },
  content: { padding: 16, gap: 12 },
}));
