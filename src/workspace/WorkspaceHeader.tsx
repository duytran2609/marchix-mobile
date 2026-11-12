import { useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { WorkspaceNotifications } from '../features/notifications/WorkspaceNotifications';
import type { WorkspaceNotification } from '../features/notifications/notifications';
import { emulatorMode, pilotMode, taskAssignmentEnabled } from '../services/firebase/firebase';
import { useScreenStyles } from '../theme/screenStyles';
import { createThemedStyles } from '../theme/theme';

export const workspaceHeaderPadding = 20;

const vietnamDate = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
});
const vietnamTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function HeaderClock({ inline }: { inline: boolean }) {
  const styles = useStyles();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const date = vietnamDate.format(now);

  return (
    <View pointerEvents="none" style={[styles.clock, inline && styles.inlineClock]}>
      <Text style={styles.clockDate}>{date.charAt(0).toLocaleUpperCase('vi-VN') + date.slice(1)}</Text>
      <Text style={styles.clockTime}>{vietnamTime.format(now)}</Text>
    </View>
  );
}

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
  const inlineClock = width >= 200 + 440 * Math.max(fontScale, 1);
  const environment = (
    <Text style={screenStyles.badge}>{pilotMode ? (taskAssignmentEnabled ? 'PILOT' : 'PILOT · CHỈ XEM')
      : emulatorMode ? 'EMULATOR' : 'STAGING'}</Text>
  );

  return (
    <View ref={header} collapsable={false} style={[styles.brand, onOpenMenu && styles.workspaceBrand]}>
      <View style={[styles.brandRow, onOpenMenu && styles.workspaceRow]}>
        {onOpenMenu ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Mở menu"
            accessibilityState={{ expanded: menuOpen }} onPress={onOpenMenu}
            style={({ pressed }) => [styles.headerButton, styles.menuButton, pressed && screenStyles.dimmed]}>
            <View style={styles.menuLine} />
            <View style={styles.menuLine} />
            <View style={styles.menuLine} />
          </Pressable>
        ) : (
          <Image source={require('../../assets/marchix-mark.png')} resizeMode="contain" aria-hidden style={styles.logo} />
        )}
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
      <HeaderClock inline={inlineClock} />
    </View>
  );
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  brand: { width: '100%', maxWidth: 560, gap: 6, paddingVertical: 8 },
  workspaceBrand: { maxWidth: '100%' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  workspaceRow: { gap: 8 },
  clock: { alignItems: 'center', justifyContent: 'center', gap: 2 },
  inlineClock: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  clockDate: { color: colors.muted, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  clockTime: { color: colors.ink, fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  headerButton: { width: 44, height: 44, borderRadius: 11, backgroundColor: colors.accentSoft,
    alignItems: 'center', justifyContent: 'center' },
  menuButton: { gap: 4 },
  menuLine: { width: 18, height: 2, borderRadius: 1, backgroundColor: colors.accent },
  browserIcon: { width: 20, height: 16, borderWidth: 2, borderRadius: 4, borderColor: colors.accent },
  browserBar: { marginTop: 3, borderBottomWidth: 2, borderBottomColor: colors.accent },
  logo: { width: 56, height: 56, transform: [{ scale: 1.4 }] },
  brandDetails: { flex: 1, minWidth: 76 },
  brandName: { fontSize: 19, fontWeight: '800', color: colors.ink },
}));
