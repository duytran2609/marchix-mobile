import { useEffect, useRef, useState } from 'react';
import { ToastLayer, useToast } from '../components/Toast';
import type { ComponentRef } from 'react';
import { Animated, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PopupCloseButton } from '../components/PopupCloseButton';
import { createThemedStyles } from '../theme/theme';

import { isNativeTab, workspaceTabs } from './workspaceRoutes';
import type { WorkspaceTab } from './workspaceRoutes';

export function WorkspaceDrawer({ open, activeTab, isAdmin, name, photoURL, onClose, onSelect, onLogout }: {
  open: boolean;
  activeTab: WorkspaceTab;
  isAdmin: boolean;
  name: string;
  photoURL: string | null;
  onClose: () => void;
  onSelect: (tab: WorkspaceTab) => void;
  onLogout: () => Promise<void>;
}) {
  const styles = useStyles();
  const { width } = useWindowDimensions();
  const drawerWidth = Math.min(width * 0.75, 280);
  const progress = useRef(new Animated.Value(0)).current;
  const logoutTrigger = useRef<ComponentRef<typeof Pressable>>(null);
  const cancelButton = useRef<ComponentRef<typeof Pressable>>(null);
  const [visible, setVisible] = useState(false);
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const [logout, setLogout] = useState<'closed' | 'confirm' | 'pending'>('closed');
  const showToast = useToast();
  const confirming = logout !== 'closed';
  const pending = logout === 'pending';
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

  useEffect(() => {
    if (confirming && Platform.OS === 'web') cancelButton.current?.focus();
  }, [confirming]);

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
        <Animated.View aria-hidden={confirming} importantForAccessibility={confirming ? 'no-hide-descendants' : 'auto'}
          style={[styles.drawer, { width: drawerWidth, transform: [{
          translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-drawerWidth, 0] }),
        }] }]}>
          <SafeAreaView style={styles.fill} edges={['top', 'bottom', 'left']}>
            <View style={styles.header}>
              <Image source={require('../../assets/marchix-mark.png')} resizeMode="contain"
                accessible accessibilityLabel="Logo Marchix" style={styles.logo} />
              <PopupCloseButton label="Đóng menu" onPress={onClose} disabled={confirming} />
            </View>
            <ScrollView contentContainerStyle={styles.list}>
              {workspaceTabs.map(item => {
                const selected = item.id === activeTab;
                const external = !isNativeTab(item.id);
                const label = item.id === 'luong' && isAdmin ? 'Nhân sự & lương' : item.label;
                return (
                  <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={label}
                    accessibilityHint={external ? 'Mở trên trang quản lý Marchix' : undefined}
                    accessibilityState={{ selected }} disabled={confirming} onPress={() => onSelect(item.id)}
                    style={({ pressed }) => [styles.item, selected && styles.selected, pressed && styles.pressed]}>
                    <Text style={[styles.icon, selected && styles.selectedIcon]}>{item.icon}</Text>
                    <Text style={[styles.label, selected && styles.selectedLabel]}>{label}</Text>
                    {external ? <Text style={styles.webTag}>Web ↗</Text> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.footer}>
              <View style={styles.profile}>
                <View style={styles.avatar} aria-hidden>
                  {photoURL && photoURL !== failedPhoto
                    ? <Image source={{ uri: photoURL }} style={styles.avatarImage} onError={() => setFailedPhoto(photoURL)} />
                    : <Text style={styles.initials}>{initials}</Text>}
                </View>
                <View style={styles.profileDetails}>
                  <Text style={styles.profileName}>{name}</Text>
                  <Text style={styles.role}>{isAdmin ? 'Quản trị viên' : 'Nhân viên'}</Text>
                </View>
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
        {confirming ? (
          <View style={styles.confirmBackdrop}>
            <View role="alertdialog" accessibilityLabel="Xác nhận đăng xuất" accessibilityViewIsModal
              style={styles.confirmPanel}>
              <Text accessibilityRole="header" style={styles.confirmTitle}>Đăng xuất?</Text>
              <Text style={styles.confirmText}>Bạn có muốn đăng xuất khỏi Marchix không?</Text>
              <View style={styles.confirmActions}>
                <Pressable ref={cancelButton} accessibilityRole="button" disabled={pending} onPress={dismiss}
                  style={({ pressed }) => [styles.confirmButton, pressed && styles.pressed, pending && styles.dimmed]}>
                  <Text style={styles.cancelText}>Hủy</Text>
                </Pressable>
                <Pressable accessibilityRole="button" disabled={pending} onPress={() => void confirmLogout()}
                  style={({ pressed }) => [styles.confirmButton, styles.dangerButton, (pressed || pending) && styles.dimmed]}>
                  <Text style={styles.dangerLabel}>{pending ? 'Đang đăng xuất…' : 'Đăng xuất'}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: colors.line },
  logo: { width: 56, height: 56 },
  logoutButton: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.background },
  list: { padding: 12, gap: 4 },
  item: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10,
    paddingVertical: 6, borderRadius: 10 },
  selected: { backgroundColor: colors.accentSoft },
  pressed: { backgroundColor: colors.surfaceMuted },
  icon: { width: 30, height: 30, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.background,
    color: colors.muted, fontSize: 17, lineHeight: 30, textAlign: 'center', textAlignVertical: 'center' },
  selectedIcon: { backgroundColor: colors.accent, color: colors.onAccent },
  label: { flexShrink: 1, color: colors.ink, fontSize: 15, fontWeight: '600' },
  selectedLabel: { color: colors.accent, fontWeight: '800' },
  webTag: { marginLeft: 'auto', color: colors.muted, fontSize: 11, fontWeight: '700' },
  footer: { padding: 12, backgroundColor: colors.background,
    borderTopWidth: 1, borderTopColor: colors.line },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  avatar: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.accentSoft },
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
  confirmBackdrop: { ...StyleSheet.absoluteFill, zIndex: 2, elevation: 16, justifyContent: 'center', alignItems: 'center',
    padding: 20, backgroundColor: 'rgba(33, 25, 53, 0.48)' },
  confirmPanel: { width: '100%', maxWidth: 360, padding: 20, gap: 12, borderRadius: 16, backgroundColor: colors.paper },
  confirmTitle: { color: colors.ink, fontSize: 20, fontWeight: '800' },
  confirmText: { color: colors.muted, fontSize: 15 },
  confirmActions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8 },
  confirmButton: { minHeight: 44, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center',
    justifyContent: 'center', backgroundColor: colors.background },
  cancelText: { color: colors.ink, fontWeight: '700' },
  dangerButton: { backgroundColor: colors.danger },
  dangerLabel: { color: colors.onAccent, fontWeight: '700' },
  dimmed: { opacity: 0.65 },
}));
