import { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } from '@react-native-google-signin/google-signin';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { Platform } from 'react-native';
import { auth } from '../../services/firebase/firebase';

export async function signInWithGoogle() {
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  if (!webClientId || (Platform.OS === 'ios' && !iosClientId)) {
    throw new Error('Bản cài đặt này thiếu cấu hình đăng nhập Google.');
  }

  GoogleSignin.configure({ webClientId, iosClientId });
  let result;
  try {
    if (Platform.OS === 'android') {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    }
    result = await GoogleSignin.signIn();
  } catch (error) {
    if (isErrorWithCode(error)) {
      if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw new Error('Google Play Services chưa sẵn sàng. Hãy cập nhật rồi thử lại.');
      }
      if (error.code === '10' || error.code === 'DEVELOPER_ERROR') {
        throw new Error('Google từ chối cấu hình đăng nhập của bản APK này (mã 10).');
      }
    }
    throw error;
  }
  if (!isSuccessResponse(result)) return;
  const { idToken } = result.data;
  // Clear the Google account selection before Firebase changes the active screen.
  await GoogleSignin.signOut().catch(() => {});
  if (!idToken) throw new Error('Google chưa trả về ID token.');
  await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
}
