import { GoogleAuthProvider, signInWithCredential, signOut } from 'firebase/auth';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardScrollView } from '../components/KeyboardScrollView';
import { Button } from '../components/Button';
import { DeleteIconButton } from '../components/DeleteIconButton';
import { MemberAvatar } from '../components/MemberAvatar';
import { useToast } from '../components/Toast';
import { signInWithGoogle } from '../features/auth/google';
import { clearRecentAccounts, loadRecentAccounts, removeRecentAccount } from '../features/auth/recentAccounts';
import type { RecentAccount } from '../features/auth/recentAccounts';
import type { Session } from '../features/auth/useSession';
import { auth, checkAuthEmulator, configError, emulatorHost, emulatorMode, pilotMode } from '../services/firebase/firebase';
import { createThemedStyles, useTheme } from '../theme/theme';
import { useScreenStyles } from '../theme/screenStyles';

const demoAccounts = {
  staff: { sub: 'marchix-mobile-demo-staff', email: 'nhanvien@example.test', name: 'Nhân viên demo' },
  reviewer: { sub: 'marchix-mobile-demo-reviewer', email: 'nguoigiao@example.test', name: 'Người giao việc demo' },
  admin: { sub: 'marchix-mobile-demo-admin', email: 'quantri@example.test', name: 'Quản trị demo' },
};
const demoAccountList = Object.values(demoAccounts);

export function SignInScreen({ sessionKind }: { sessionKind: Session['kind'] }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const screenStyles = useScreenStyles();
  const showToast = useToast();
  const [busy, setBusy] = useState(false);
  const [removingAccounts, setRemovingAccounts] = useState(false);
  const [recentAccounts, setRecentAccounts] = useState<RecentAccount[]>([]);
  const actionPending = useRef(false);
  const controlsDisabled = busy || removingAccounts;

  useEffect(() => {
    if (sessionKind !== 'signed-out' || configError) return;
    let active = true;
    void loadRecentAccounts().then(accounts => {
      if (active) setRecentAccounts(emulatorMode
        ? accounts.filter(account => demoAccountList.some(demo => demo.email === account.email))
        : accounts);
    });
    return () => { active = false; };
  }, [sessionKind]);

  async function login(email?: string) {
    if (actionPending.current) return;
    actionPending.current = true;
    setBusy(true);
    try {
      if (emulatorMode) {
        const account = email ? demoAccountList.find(demo => demo.email === email) : demoAccounts.staff;
        if (!account) return;
        if (Platform.OS !== 'web') await checkAuthEmulator();
        const mockGoogleToken = JSON.stringify({
          ...account, email_verified: true,
        });
        await signInWithCredential(auth, GoogleAuthProvider.credential(mockGoogleToken));
      } else {
        await signInWithGoogle(email);
      }
    } catch (err) {
      showToast(emulatorMode ? `Không đăng nhập được qua ${emulatorHost}:9099. Kiểm tra Firebase Emulator đang chạy và điện thoại dùng cùng Wi-Fi với máy tính.`
        : err instanceof Error && !('code' in err) ? err.message : 'Đăng nhập Google chưa thành công. Vui lòng thử lại.', 'error');
    } finally {
      actionPending.current = false;
      setBusy(false);
    }
  }

  async function removeAccounts(email?: string) {
    if (actionPending.current) return;
    actionPending.current = true;
    setRemovingAccounts(true);
    try {
      if (email) {
        await removeRecentAccount(email);
        setRecentAccounts(accounts => accounts.filter(account => account.email.toLowerCase() !== email.toLowerCase()));
      } else {
        await clearRecentAccounts();
        setRecentAccounts([]);
      }
    } catch {
      showToast('Không xóa được tài khoản gần đây. Vui lòng thử lại.', 'error');
    } finally {
      actionPending.current = false;
      setRemovingAccounts(false);
    }
  }

  const googleLabel = busy ? 'Đang đăng nhập…' : 'Đăng nhập bằng Google';

  return (
    <KeyboardScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
      <View style={styles.card}>
        <View style={styles.title}>
          <View style={styles.mark}>
            <Image source={require('../../assets/marchix-mark.png')} resizeMode="contain" aria-hidden style={styles.logo} />
          </View>
          <Text style={[screenStyles.eyebrow, styles.centered]}>QUẢN LÝ MARCHIX</Text>
          <Text accessibilityRole="header" style={styles.heading}>Đăng nhập</Text>
        </View>
        {configError ? <Text accessibilityRole="alert" style={[screenStyles.error, styles.centered]}>{configError}</Text>
          : sessionKind === 'loading' ? <ActivityIndicator accessibilityLabel="Đang kiểm tra đăng nhập" color={colors.accent} />
          : sessionKind === 'denied' || sessionKind === 'error' ? <>
            <Text accessibilityRole="alert" style={[screenStyles.error, styles.centered]}>{sessionKind === 'denied'
              ? 'Tài khoản chưa được cấp quyền hoặc email chưa xác minh.'
              : 'Không kiểm tra được quyền truy cập. Vui lòng thử lại.'}</Text>
            <Button label="Đổi tài khoản" secondary onPress={() => void signOut(auth)} />
          </> : <>
            <Text style={[screenStyles.muted, styles.centered]}>{emulatorMode
              ? 'Bản thử dùng tài khoản Google mô phỏng và dữ liệu công việc giả.'
              : pilotMode ? 'Dùng tài khoản Google đang dùng trên web để vào Quản lý Marchix.'
                : 'Dùng tài khoản Google đã được quản trị Marchix cấp quyền trên staging.'}</Text>
            {recentAccounts.length > 0 && <View style={styles.recentList}>
              <Text accessibilityRole="header" style={screenStyles.label}>Tài khoản gần đây</Text>
              {recentAccounts.map(account => (
                <View key={account.email} style={styles.account}>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Đăng nhập với ${account.email}`}
                    accessibilityState={{ disabled: controlsDisabled }} disabled={controlsDisabled}
                    onPress={() => void login(account.email)}
                    style={({ pressed }) => [styles.accountLogin, pressed && styles.accountPressed,
                      controlsDisabled && screenStyles.dimmed]}>
                    <MemberAvatar name={account.name} photoURL={account.photoURL} />
                    <View style={styles.accountDetails}>
                      <Text numberOfLines={1} style={screenStyles.label}>{account.name}</Text>
                      <Text numberOfLines={2} style={screenStyles.muted}>{account.email}</Text>
                    </View>
                  </Pressable>
                  <DeleteIconButton label={`Xóa ${account.email} khỏi tài khoản gần đây`}
                    disabled={controlsDisabled} onPress={() => void removeAccounts(account.email)} />
                </View>
              ))}
            </View>}
            {recentAccounts.length > 0 && <Button label="Đăng xuất tất cả tài khoản" danger
              style={styles.clearAccountsButton} disabled={controlsDisabled} onPress={() => void removeAccounts()} />}
            <Pressable accessibilityRole="button" accessibilityLabel={googleLabel}
              accessibilityState={{ busy, disabled: controlsDisabled }} disabled={controlsDisabled} onPress={() => void login()}
              style={({ pressed }) => [styles.googleButton, pressed && styles.googlePressed]}>
              <Image source={require('../../assets/google-g.png')} resizeMode="contain" aria-hidden style={styles.googleIcon} />
              <Text style={styles.googleLabel}>{googleLabel}</Text>
            </Pressable>
            {emulatorMode && <View style={styles.demoButtons}>
              <Button label="Đăng nhập người giao việc (mô phỏng)" secondary
                onPress={() => void login(demoAccounts.reviewer.email)} disabled={controlsDisabled} />
              <Button label="Đăng nhập quản trị (mô phỏng)" secondary
                onPress={() => void login(demoAccounts.admin.email)} disabled={controlsDisabled} />
            </View>}
          </>}
      </View>
    </KeyboardScrollView>
  );
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: {
    width: '100%', maxWidth: 420, gap: 22, paddingHorizontal: 24, paddingVertical: 32,
    backgroundColor: colors.paper, borderColor: colors.line, borderWidth: 1, borderRadius: 24,
    boxShadow: '0 10px 32px rgba(25, 16, 46, 0.10)',
  },
  title: { alignItems: 'center', gap: 8 },
  mark: {
    width: 68, height: 68, borderRadius: 20, marginBottom: 8,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft,
  },
  logo: { width: 64, height: 64 },
  heading: { color: colors.ink, fontSize: 30, fontWeight: '800', textAlign: 'center' },
  centered: { textAlign: 'center' },
  recentList: { gap: 8 },
  account: {
    paddingRight: 4, borderRadius: 12,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.background,
    flexDirection: 'row', alignItems: 'center',
  },
  accountLogin: {
    flex: 1, minWidth: 0, minHeight: 56, paddingLeft: 12, paddingVertical: 8,
    borderTopLeftRadius: 11, borderBottomLeftRadius: 11, flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  accountPressed: { backgroundColor: colors.surfaceMuted },
  accountDetails: { flex: 1, minWidth: 0 },
  clearAccountsButton: { backgroundColor: '#C14946', borderColor: '#C14946' },
  googleButton: {
    minHeight: 48, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12,
    borderWidth: 1, borderColor: '#747775', backgroundColor: '#FFFFFF',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  googlePressed: { backgroundColor: '#F1F3F4' },
  googleIcon: { width: 18, height: 18 },
  googleLabel: {
    color: '#1F1F1F', fontSize: 14, fontWeight: '500', flexShrink: 1, textAlign: 'center',
    fontFamily: Platform.select({ android: 'sans-serif', web: 'Roboto, Arial, sans-serif' }),
  },
  demoButtons: { gap: 8 },
}));
