import { GoogleAuthProvider, signInWithCredential, signOut } from 'firebase/auth';
import { useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { useToast } from '../components/Toast';
import { signInWithGoogle } from '../features/auth/google';
import type { Session } from '../features/auth/useSession';
import { auth, checkAuthEmulator, configError, emulatorHost, emulatorMode, pilotMode } from '../services/firebase/firebase';
import { createThemedStyles, useTheme } from '../theme/theme';
import { useScreenStyles } from '../theme/screenStyles';

const demoAccounts = {
  staff: { sub: 'marchix-mobile-demo-staff', email: 'nhanvien@example.test', name: 'Nhân viên demo' },
  reviewer: { sub: 'marchix-mobile-demo-reviewer', email: 'nguoigiao@example.test', name: 'Người giao việc demo' },
  admin: { sub: 'marchix-mobile-demo-admin', email: 'quantri@example.test', name: 'Quản trị demo' },
};

export function SignInScreen({ sessionKind }: { sessionKind: Session['kind'] }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const screenStyles = useScreenStyles();
  const showToast = useToast();
  const [busy, setBusy] = useState(false);
  const loginPending = useRef(false);

  async function login(account: keyof typeof demoAccounts = 'staff') {
    if (loginPending.current) return;
    loginPending.current = true;
    setBusy(true);
    try {
      if (emulatorMode) {
        if (Platform.OS !== 'web') await checkAuthEmulator();
        const mockGoogleToken = JSON.stringify({
          ...demoAccounts[account], email_verified: true,
        });
        await signInWithCredential(auth, GoogleAuthProvider.credential(mockGoogleToken));
      } else {
        await signInWithGoogle();
      }
    } catch (err) {
      showToast(emulatorMode ? `Không đăng nhập được qua ${emulatorHost}:9099. Kiểm tra Firebase Emulator đang chạy và điện thoại dùng cùng Wi-Fi với máy tính.`
        : err instanceof Error && !('code' in err) ? err.message : 'Đăng nhập Google chưa thành công. Vui lòng thử lại.', 'error');
    } finally {
      loginPending.current = false;
      setBusy(false);
    }
  }

  const googleLabel = busy ? 'Đang đăng nhập…'
    : emulatorMode ? 'Đăng nhập Google (mô phỏng)' : 'Đăng nhập bằng Google';

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
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
            <Pressable accessibilityRole="button" accessibilityLabel={googleLabel}
              accessibilityState={{ busy, disabled: busy }} disabled={busy} onPress={() => void login()}
              style={({ pressed }) => [styles.googleButton, pressed && styles.googlePressed]}>
              <Image source={require('../../assets/google-g.png')} resizeMode="contain" aria-hidden style={styles.googleIcon} />
              <Text style={styles.googleLabel}>{googleLabel}</Text>
            </Pressable>
            {emulatorMode && <View style={styles.demoButtons}>
              <Button label="Đăng nhập người giao việc (mô phỏng)" secondary
                onPress={() => void login('reviewer')} disabled={busy} />
              <Button label="Đăng nhập quản trị (mô phỏng)" secondary
                onPress={() => void login('admin')} disabled={busy} />
            </View>}
          </>}
      </View>
    </ScrollView>
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
