import { useEffect, useRef, useState } from 'react';
import { ToastLayer, useToast } from '../components/Toast';
import type { ComponentRef } from 'react';
import { Animated, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { avatarBorderStyle } from '../components/MemberAvatar';
import { PopupCloseButton } from '../components/PopupCloseButton';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { createThemedStyles } from '../theme/theme';

import { workspaceTabLabel, workspaceTabs } from './workspaceRoutes';
import type { WorkspaceTab } from './workspaceRoutes';
import type { PinnableTab } from './usePinnedTabs';
import { workspaceTabIcons } from './workspaceTabIcons';

export function WorkspaceDrawer({ open, activeTab, isAdmin, name, photoURL, pins, onTogglePin,
  onClose, onSelect, onOpenWeb, onLogout }: {
  open: boolean;
  activeTab: WorkspaceTab | 'ca-nhan';
  isAdmin: boolean;
  name: string;
  photoURL: string | null;
  pins: readonly PinnableTab[];
  onTogglePin?: (tab: PinnableTab) => void;
  onClose: () => void;
  onSelect: (tab: WorkspaceTab | 'ca-nhan') => void;
  onOpenWeb: () => void;
  onLogout: () => Promise<void>;
}) {
  const styles = useStyles();
  const { width } = useWindowDimensions();
  const drawerWidth = width < 600 ? Math.min(width * 0.65, 248) : 280;
  const progress = useRef(new Animated.Value(0)).current;
  const logoutTrigger = useRef<ComponentRef<typeof Pressable>>(null);
  const [visible, setVisible] = useState(false);
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const [logout, setLogout] = useState<'closed' | 'confirm' | 'pending'>('closed');
  const showToast = useToast();
  const confirming = logout !== 'closed';
  const pending = logout === 'pending';
  const profileActive = activeTab === 'ca-nhan';
  const initials = name.trim().split(/\s+/).slice(-2).map(part => Array.from(part)[0]).join('').toLocaleUpperCase('vi');

  useEffect(() => {
    if (open) setVisible(true);
    const animation = Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished && !open) setVisible(false);
    });
    return () => animation.stop();
  }, [open, progress]);

  function dismiss() {
    if (pending) return;
    if (!confirming) {
      onClose();
      return;
    }
    setLogout('closed');
    if (Platform.OS === 'web') requestAnimationFrame(() => logoutTrigger.current?.focus());
  }

  async function confirmLogout() {
    if (pending) return;
    setLogout('pending');
    try {
      await onLogout();
      onClose();
      setLogout('closed');
    } catch {
      setLogout('confirm');
      showToast('Chưa đăng xuất được. Vui lòng thử lại.', 'error');
    }
  }

  return (
    <Modal transparent visible={open || visible} onRequestClose={dismiss} statusBarTranslucent navigationBarTranslucent>
      <View style={styles.overlay}>
        <Animated.View testID="workspace-drawer" aria-hidden={confirming}
          importantForAccessibility={confirming ? 'no-hide-descendants' : 'auto'}
          style={[styles.drawer, { width: drawerWidth, transform: [{
          translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-drawerWidth, 0] }),
        }] }]}>
          <SafeAreaView style={styles.fill} edges={['top', 'bottom', 'left']}>
            <View style={styles.header}>
              <View style={styles.brandRow}>
                <Image source={require('../../assets/marchix-mark.png')} resizeMode="contain"
                  accessible accessibilityLabel="Logo Marchix" style={styles.logo} />
                <PopupCloseButton label="Đóng menu" onPress={onClose} disabled={confirming} tone="accent" />
              </View>
              <Button label="Web Quản lý Marchix ↗" secondary disabled={confirming} onPress={onOpenWeb} />
            </View>
            <ScrollView contentContainerStyle={styles.list}>
              {onTogglePin && <Text style={styles.pinHint}>Nhấn giữ một mục để ghim hoặc bỏ ghim khỏi thanh dưới.</Text>}
              {workspaceTabs.map(item => {
                const selected = item.id === activeTab;
                const label = workspaceTabLabel(item, isAdmin);
                const id = item.id;
                const togglePin = id !== 'tong-quan' && onTogglePin ? () => onTogglePin(id) : undefined;
                const pinned = !!togglePin && id !== 'tong-quan' && pins.includes(id);
                const pinActionLabel = pinned ? 'Bỏ ghim khỏi thanh dưới' : 'Ghim vào thanh dưới';
                return (
                  <Pressable key={id} accessibilityRole="button" accessibilityLabel={label}
                    accessibilityHint={togglePin ? `Nhấn giữ để ${pinActionLabel.toLocaleLowerCase('vi')}.` : undefined}
                    accessibilityActions={togglePin ? [{ name: 'togglePin', label: pinActionLabel }] : undefined}
                    onAccessibilityAction={togglePin ? event => {
                      if (!confirming && event.nativeEvent.actionName === 'togglePin') togglePin();
                    } : undefined}
                    accessibilityState={{ selected }} disabled={confirming} onPress={() => onSelect(id)}
                    onLongPress={togglePin}
                    style={({ pressed }) => [styles.item, selected && styles.selected, pressed && styles.pressed]}>
                    <View aria-hidden style={[styles.iconTile, selected && styles.selectedIconTile]}>
                      <Image source={workspaceTabIcons[id]} resizeMode="contain"
                        style={[styles.icon, selected && styles.selectedIcon]} />
                    </View>
                    <Text selectable={false} style={[styles.label, selected && styles.selectedLabel]}>{label}</Text>
                    {pinned && <Image source={require('../../assets/sidebar/pin.png')} resizeMode="contain"
                      aria-hidden style={styles.pinIcon} />}
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.footer}>
              <View style={styles.profile}>
                <Pressable accessibilityRole="button" accessibilityLabel="Thông tin cá nhân"
                  accessibilityState={{ selected: profileActive }} disabled={confirming}
                  {...(Platform.OS === 'web' && profileActive ? { 'aria-current': 'page' } : {})}
                  onPress={() => onSelect('ca-nhan')}
                  style={({ pressed }) => [styles.profileButton, profileActive && styles.selected, pressed && styles.pressed]}>
                  <View style={styles.avatar} testID="member-avatar" aria-hidden>
                    {photoURL && photoURL !== failedPhoto
                      ? <Image source={{ uri: photoURL }} style={styles.avatarImage} onError={() => setFailedPhoto(photoURL)} />
                      : <Text style={styles.initials}>{initials}</Text>}
                  </View>
                  <View style={styles.profileDetails}>
                    <Text style={styles.profileName}>{name}</Text>
                    <Text style={styles.role}>{isAdmin ? 'Quản trị viên' : 'Nhân viên'}</Text>
                  </View>
                </Pressable>
                <Pressable ref={logoutTrigger} accessibilityRole="button" accessibilityLabel="Đăng xuất"
                  disabled={confirming} onPress={() => setLogout('confirm')}
                  style={({ pressed }) => [styles.logoutButton, pressed && styles.pressed]}>
                  <View aria-hidden style={styles.logoutIcon}>
                    <View style={styles.logoutDoor} />
                    <View style={styles.logoutShaft} />
                    <View style={styles.logoutArrow} />
                  </View>
                </Pressable>
              </View>
            </View>
          </SafeAreaView>
        </Animated.View>
        <Animated.View style={[styles.backdrop, { opacity: progress }]}>
          <Pressable style={styles.fill} onPress={onClose} accessible={false}
            importantForAccessibility="no" tabIndex={-1} />
        </Animated.View>
        {confirming && <ConfirmDialog label="Xác nhận đăng xuất" title="Đăng xuất?"
          message="Bạn có muốn đăng xuất khỏi Marchix không?" action="Đăng xuất" pendingAction="Đang đăng xuất…"
          pending={pending} onCancel={dismiss} onConfirm={() => void confirmLogout()} />}
      </View>
      {open || visible ? <ToastLayer /> : null}
    </Modal>
  );
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  overlay: { flex: 1, flexDirection: 'row' },
  fill: { flex: 1 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(33, 25, 53, 0.54)' },
  drawer: { zIndex: 1, backgroundColor: colors.paper, elevation: 12, boxShadow: '8px 0 24px rgba(33, 25, 53, 0.15)' },
  header: { gap: 8, paddingHorizontal: 20, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: colors.line },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  logo: { width: 56, height: 56, transform: [{ scale: 1.4 }] },
  logoutButton: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.background },
  list: { padding: 12, gap: 4 },
  pinHint: { color: colors.muted, fontSize: 12, lineHeight: 17, paddingHorizontal: 10, paddingBottom: 4 },
  item: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10,
    paddingVertical: 6, borderRadius: 10 },
  selected: { backgroundColor: colors.accentSoft },
  pressed: { backgroundColor: colors.surfaceMuted },
  iconTile: { width: 32, height: 32, borderRadius: 9, backgroundColor: colors.background,
    alignItems: 'center', justifyContent: 'center' },
  selectedIconTile: { backgroundColor: colors.accent },
  icon: { width: 22, height: 22, tintColor: colors.muted },
  selectedIcon: { tintColor: colors.onAccent },
  label: { flex: 1, minWidth: 0, color: colors.ink, fontSize: 15, fontWeight: '600' },
  pinIcon: { width: 16, height: 16, tintColor: colors.accent },
  selectedLabel: { color: colors.accent, fontWeight: '800' },
  footer: { padding: 12, backgroundColor: colors.background,
    borderTopWidth: 1, borderTopColor: colors.line },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 6, borderRadius: 12,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  profileButton: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center',
    gap: 8, paddingVertical: 5, paddingHorizontal: 6, borderRadius: 10 },
  avatar: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.accentSoft, ...avatarBorderStyle },
  avatarImage: { width: '100%', height: '100%' },
  initials: { color: colors.accent, fontSize: 16, fontWeight: '800' },
  profileDetails: { flex: 1, minWidth: 0, gap: 2 },
  profileName: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  role: { color: colors.muted, fontSize: 12 },
  logoutIcon: { width: 22, height: 20 },
  logoutDoor: { position: 'absolute', left: 0, top: 1, width: 10, height: 18,
    borderWidth: 2, borderRightWidth: 0, borderRadius: 3, borderColor: colors.danger },
  logoutShaft: { position: 'absolute', left: 6, top: 9, width: 14, height: 2, backgroundColor: colors.danger },
  logoutArrow: { position: 'absolute', right: 2, top: 6, width: 8, height: 8,
    borderTopWidth: 2, borderRightWidth: 2, borderColor: colors.danger, transform: [{ rotate: '45deg' }] },
}));
