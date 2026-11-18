import { beforeAuthStateChanged, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '../../services/firebase/firebase';

export async function signInWithGoogle(email?: string) {
  const provider = new GoogleAuthProvider();
  if (!email) {
    provider.setCustomParameters({ prompt: 'select_account' });
    await signInWithPopup(auth, provider);
    return;
  }

  provider.setCustomParameters({ login_hint: email });
  let mismatchedAccount = false;
  // A login hint can be overridden in Google's UI. Block a mismatched user before Firebase publishes the session.
  const stopGuard = beforeAuthStateChanged(auth, user => {
    if (user && user.email?.toLowerCase() !== email.toLowerCase()) {
      mismatchedAccount = true;
      throw new Error('Google account mismatch.');
    }
  });
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    if (mismatchedAccount) throw new Error(`Hãy chọn đúng tài khoản Google ${email} hoặc dùng nút Đăng nhập bằng Google.`);
    throw error;
  } finally {
    stopGuard();
  }
}
