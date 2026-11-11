import { GoogleAuthProvider, signInWithCredential, signOut } from 'firebase/auth';
import { useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { useToast } from '../components/Toast';
import { signInWithGoogle } from '../features/auth/google';
import type { Session } from '../features/auth/useSession';
import { auth, checkAuthEmulator, configError, emulatorHost, emulatorMode, pilotMode } from '../services/firebase/firebase';
import { useTheme } from '../theme/theme';
import { useScreenStyles } from '../theme/screenStyles';
import { WorkspaceHeader } from '../workspace/WorkspaceHeader';

const demoAccounts = {
  staff: { sub: 'marchix-mobile-demo-staff', email: 'nhanvien@example.test', name: 'Nhân viên demo' },
  reviewer: { sub: 'marchix-mobile-demo-reviewer', email: 'nguoigiao@example.test', name: 'Người giao việc demo' },
  admin: { sub: 'marchix-mobile-demo-admin', email: 'quantri@example.test', name: 'Quản trị demo' },
};

export function SignInScreen({ sessionKind }: { sessionKind: Session['kind'] }) {
  const { colors } = useTheme();
  const screenStyles = useScreenStyles();
  const showToast = useToast();
  const [busy, setBusy] = useState(false);

  async function login(account: keyof typeof demoAccounts = 'staff') {
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
      setBusy(false);
    }
  }

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={screenStyles.scroll}>
      <View style={screenStyles.page}>
        <WorkspaceHeader />
        {configError ? <Text accessibilityRole="alert" style={screenStyles.error}>{configError}</Text>
          : sessionKind === 'loading' ? <ActivityIndicator accessibilityLabel="Đang kiểm tra đăng nhập" color={colors.accent} />
          : <View style={screenStyles.panel}>
              <Text style={screenStyles.eyebrow}>QUẢN LÝ MARCHIX</Text>
              <Text accessibilityRole="header" style={screenStyles.heading}>Đăng nhập</Text>
              {sessionKind === 'denied' || sessionKind === 'error' ? <>
                <Text accessibilityRole="alert" style={screenStyles.error}>{sessionKind === 'denied'
                  ? 'Tài khoản chưa được cấp quyền hoặc email chưa xác minh.'
                  : 'Không kiểm tra được quyền truy cập. Vui lòng thử lại.'}</Text>
                <Button label="Đổi tài khoản" secondary onPress={() => void signOut(auth)} />
              </> : <>
                <Text style={screenStyles.body}>{emulatorMode
                  ? 'Bản thử dùng tài khoản Google mô phỏng và dữ liệu công việc giả.'
                  : pilotMode ? 'Dùng tài khoản Google đang dùng trên web để vào Quản lý Marchix.'
                    : 'Dùng tài khoản Google đã được quản trị Marchix cấp quyền trên staging.'}</Text>
                <Button label={busy ? 'Đang đăng nhập…' : emulatorMode
                  ? 'Đăng nhập Google (mô phỏng)' : 'Đăng nhập bằng Google'}
                  onPress={() => void login()} disabled={busy} />
                {emulatorMode && <>
                  <Button label="Đăng nhập người giao việc (mô phỏng)" secondary
                    onPress={() => void login('reviewer')} disabled={busy} />
                  <Button label="Đăng nhập quản trị (mô phỏng)" secondary
                    onPress={() => void login('admin')} disabled={busy} />
                </>}
              </>}
            </View>}
      </View>
    </ScrollView>
  );
}
