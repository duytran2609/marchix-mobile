import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '../../services/firebase/firebase';

export async function signInWithGoogle() {
  await signInWithPopup(auth, new GoogleAuthProvider());
}
