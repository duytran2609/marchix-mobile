import { useRef } from 'react';
import type { ComponentRef } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { WorkspaceNotifications } from '../features/notifications/WorkspaceNotifications';
import type { WorkspaceNotification } from '../features/notifications/notifications';
import { emulatorMode, pilotMode, taskAssignmentEnabled } from '../services/firebase/firebase';
import { useScreenStyles } from '../theme/screenStyles';
import { createThemedStyles } from '../theme/theme';

export const workspaceHeaderPadding = 20;

export function WorkspaceHeader({ onOpenMenu, menuOpen, inbox, onOpenWeb }: {
  onOpenMenu?: () => void;
  menuOpen?: boolean;
  inbox?: { email: string; onOpenNote: (note: WorkspaceNotification) => void };
  onOpenWeb?: () => void;
}) {
  const styles = useStyles();
  const screenStyles = useScreenStyles();
  const header = useRef<ComponentRef<typeof View>>(null);
  const { width, fontScale } = useWindowDimensions();
  const compact = !!onOpenWeb && width < 240 + 160 * fontScale;
  const environment = (
    <Text style={screenStyles.badge}>{pilotMode ? (taskAssignmentEnabled ? 'PILOT' : 'PILOT · CHỈ XEM')
      : emulatorMode ? 'EMULATOR' : 'STAGING'}</Text>
  );

  return (
    <View ref={header} collapsable={false} style={[styles.brand, onOpenMenu && styles.workspaceBrand]}>
      {onOpenMenu ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Mở menu"
          accessibilityState={{ expanded: menuOpen }} onPress={onOpenMenu}
          style={({ pressed }) => [styles.headerButton, styles.menuButton, pressed && screenStyles.dimmed]}>
          <View style={styles.menuLine} />
          <View style={styles.menuLine} />
          <View style={styles.menuLine} />
        </Pressable>
      ) : <Text style={styles.mark}>M</Text>}
      <View style={styles.brandDetails}>
        <Text style={styles.brandName}>Marchix</Text>
        <Text style={screenStyles.muted}>Quản lý nội bộ</Text>
        {compact && environment}
      </View>
      {!compact && environment}
      {inbox ? (
        <WorkspaceNotifications email={inbox.email} header={header} edge={workspaceHeaderPadding} onOpenNote={inbox.onOpenNote} />
      ) : null}
      {onOpenWeb && (
        <Pressable accessibilityRole="button" accessibilityLabel="Mở Quản lý Marchix bản web"
          onPress={onOpenWeb} style={({ pressed }) => [styles.headerButton, pressed && screenStyles.dimmed]}>
          <View aria-hidden style={styles.browserIcon}>
            <View style={styles.browserBar} />
          </View>
        </Pressable>
      )}
    </View>
  );
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  brand: { width: '100%', maxWidth: 560, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  workspaceBrand: { maxWidth: '100%', gap: 8 },
  headerButton: { width: 44, height: 44, borderRadius: 11, backgroundColor: colors.accentSoft,
    alignItems: 'center', justifyContent: 'center' },
  menuButton: { gap: 4 },
  menuLine: { width: 18, height: 2, borderRadius: 1, backgroundColor: colors.accent },
  browserIcon: { width: 20, height: 16, borderWidth: 2, borderRadius: 4, borderColor: colors.accent },
  browserBar: { marginTop: 3, borderBottomWidth: 2, borderBottomColor: colors.accent },
  mark: { fontSize: 20, fontWeight: '900', backgroundColor: colors.accent, color: colors.onAccent,
    textAlign: 'center', textAlignVertical: 'center', borderRadius: 12, width: 44, height: 44, lineHeight: 44 },
  brandDetails: { flex: 1, minWidth: 76 },
  brandName: { fontSize: 19, fontWeight: '800', color: colors.ink },
}));
