import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { Platform } from 'react-native';
import { auth } from '../../services/firebase/firebase';

export async function signInWithGoogle() {
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  if (!webClientId || (Platform.OS === 'ios' && !iosClientId)) {
    throw new Error('Thiếu OAuth client ID cho bản staging.');
  }

  GoogleSignin.configure({ webClientId, iosClientId });
  if (Platform.OS === 'android') await GoogleSignin.hasPlayServices();
  const result = await GoogleSignin.signIn();
  if (!isSuccessResponse(result)) return;
  if (!result.data.idToken) throw new Error('Google chưa trả về ID token.');
  try {
    await signInWithCredential(auth, GoogleAuthProvider.credential(result.data.idToken));
  } finally {
    // The Firebase session owns app login. Let the next login choose a Google account.
    await GoogleSignin.signOut().catch(() => {});
  }
}
