import { useRef } from 'react';
import type { ComponentRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { WorkspaceNotifications } from '../features/notifications/WorkspaceNotifications';
import type { WorkspaceNotification } from '../features/notifications/notifications';
import { emulatorMode, pilotMode, taskAssignmentEnabled } from '../services/firebase/firebase';
import { screenStyles } from '../theme/screenStyles';
import { colors } from '../theme/theme';

export const workspaceHeaderPadding = 20;

export function WorkspaceHeader({ onOpenMenu, menuOpen, inbox }: {
  onOpenMenu?: () => void;
  menuOpen?: boolean;
  inbox?: { email: string; onOpenNote: (note: WorkspaceNotification) => void };
}) {
  const header = useRef<ComponentRef<typeof View>>(null);

  return (
    <View ref={header} collapsable={false} style={[styles.brand, onOpenMenu && styles.workspaceBrand]}>
      {onOpenMenu ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Mở menu"
          accessibilityState={{ expanded: menuOpen }} onPress={onOpenMenu}
          style={({ pressed }) => [styles.menuButton, pressed && screenStyles.dimmed]}>
          <View style={styles.menuLine} />
          <View style={styles.menuLine} />
          <View style={styles.menuLine} />
        </Pressable>
      ) : <Text style={styles.mark}>M</Text>}
      <View style={styles.brandDetails}>
        <Text style={styles.brandName}>Marchix</Text>
        <Text style={screenStyles.muted}>Quản lý nội bộ</Text>
      </View>
      <Text style={screenStyles.badge}>{pilotMode ? (taskAssignmentEnabled ? 'PILOT' : 'PILOT · CHỈ XEM')
        : emulatorMode ? 'EMULATOR' : 'STAGING'}</Text>
      {inbox ? (
        <WorkspaceNotifications email={inbox.email} header={header} edge={workspaceHeaderPadding} onOpenNote={inbox.onOpenNote} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  brand: { width: '100%', maxWidth: 560, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  workspaceBrand: { maxWidth: '100%', gap: 8 },
  menuButton: { width: 44, height: 44, borderRadius: 11, backgroundColor: colors.accentSoft,
    alignItems: 'center', justifyContent: 'center', gap: 4 },
  menuLine: { width: 18, height: 2, borderRadius: 1, backgroundColor: colors.accent },
  mark: { fontSize: 20, fontWeight: '900', backgroundColor: colors.accent, color: colors.paper,
    textAlign: 'center', textAlignVertical: 'center', borderRadius: 12, width: 44, height: 44, lineHeight: 44 },
  brandDetails: { flex: 1, minWidth: 76 },
  brandName: { fontSize: 19, fontWeight: '800', color: colors.ink },
});
