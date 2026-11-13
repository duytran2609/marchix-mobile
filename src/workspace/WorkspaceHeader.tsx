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
const shortVietnamDate = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric',
});
const vietnamTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function HeaderClock({ compact = false, inRow = false }: { compact?: boolean; inRow?: boolean }) {
  const styles = useStyles();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const date = vietnamDate.format(now);

  return (
    <View pointerEvents="none" style={[styles.clock, inRow && styles.clockInRow]}>
      <Text numberOfLines={1} adjustsFontSizeToFit style={styles.clockDate}>
        {compact ? shortVietnamDate.format(now) : date.charAt(0).toLocaleUpperCase('vi-VN') + date.slice(1)}
      </Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={styles.clockTime}>{vietnamTime.format(now)}</Text>
    </View>
  );
}

export function WorkspaceHeader({ onOpenMenu, menuOpen, inbox }: {
  onOpenMenu?: () => void;
  menuOpen?: boolean;
  inbox?: { email: string; onOpenNote: (note: WorkspaceNotification) => void };
}) {
  const styles = useStyles();
  const screenStyles = useScreenStyles();
  const header = useRef<ComponentRef<typeof View>>(null);
  const { width, fontScale } = useWindowDimensions();
  const showWorkspaceBrand = width >= 660 * Math.max(fontScale, 1);
  const compactClock = width < 400 * Math.max(fontScale, 1);
  const brandDetails = (
    <View style={styles.brandDetails}>
      <Text style={styles.brandName}>Marchix</Text>
      <Text style={screenStyles.muted}>Quản lý nội bộ</Text>
    </View>
  );
  const environment = (
    <Text style={screenStyles.badge}>{pilotMode ? (taskAssignmentEnabled ? 'PILOT' : 'PILOT · CHỈ XEM')
      : emulatorMode ? 'EMULATOR' : 'STAGING'}</Text>
  );

  return (
    <View ref={header} collapsable={false} style={[styles.brand, onOpenMenu && styles.workspaceBrand]}>
      {onOpenMenu ? <View style={styles.brandRow}>
        <View style={styles.headerSide}>
          <Pressable accessibilityRole="button" accessibilityLabel="Mở menu"
            accessibilityState={{ expanded: menuOpen }} onPress={onOpenMenu}
            style={({ pressed }) => [styles.headerButton, styles.menuButton, pressed && screenStyles.dimmed]}>
            <View style={styles.menuLine} />
            <View style={styles.menuLine} />
            <View style={styles.menuLine} />
          </Pressable>
          {showWorkspaceBrand && brandDetails}
        </View>
        <HeaderClock inRow compact={compactClock} />
        <View style={[styles.headerSide, styles.headerEnd]}>
          {showWorkspaceBrand && environment}
          {inbox && <WorkspaceNotifications email={inbox.email} header={header} edge={workspaceHeaderPadding} onOpenNote={inbox.onOpenNote} />}
        </View>
      </View> : <>
        <View style={styles.brandRow}>
          <Image source={require('../../assets/marchix-mark.png')} resizeMode="contain" aria-hidden style={styles.logo} />
          {brandDetails}
          {environment}
        </View>
        <HeaderClock />
      </>}
    </View>
  );
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  brand: { width: '100%', maxWidth: 560, gap: 6, paddingVertical: 8 },
  workspaceBrand: { maxWidth: '100%' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerSide: { flex: 1, minWidth: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerEnd: { justifyContent: 'flex-end' },
  clock: { alignItems: 'center', justifyContent: 'center', gap: 2 },
  clockInRow: { flexShrink: 1, minWidth: 0 },
  clockDate: { color: colors.muted, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  clockTime: { color: colors.ink, fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  headerButton: { width: 44, height: 44, borderRadius: 11, backgroundColor: colors.accentSoft,
    alignItems: 'center', justifyContent: 'center' },
  menuButton: { gap: 4 },
  menuLine: { width: 18, height: 2, borderRadius: 1, backgroundColor: colors.accent },
  logo: { width: 56, height: 56, transform: [{ scale: 1.4 }] },
  brandDetails: { flex: 1, minWidth: 76 },
  brandName: { fontSize: 19, fontWeight: '800', color: colors.ink },
}));
