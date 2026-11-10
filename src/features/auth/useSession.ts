import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { auth, configError, db } from '../../services/firebase/firebase';

export type MemberSession = {
  kind: 'member'; email: string; name: string; photoURL: string | null; isAdmin: boolean; hasReviewGrant: boolean;
};
export type Session =
  | { kind: 'loading' | 'signed-out' | 'denied' | 'error' }
  | MemberSession;

export function useSession() {
  const [session, setSession] = useState<Session>({ kind: 'loading' });
  useEffect(() => {
    if (configError) return;
    let stopMembership: (() => void) | undefined;
    const stopAuth = onAuthStateChanged(auth, user => {
      stopMembership?.();
      if (!user) {
        setSession({ kind: 'signed-out' });
      } else if (!user.email || !user.emailVerified) {
        setSession({ kind: 'denied' });
      } else {
        const email = user.email;
        setSession({ kind: 'loading' });
        stopMembership = onSnapshot(doc(db, 'members', email), { includeMetadataChanges: true }, snapshot => {
          const member = snapshot.data();
          const isAdmin = member?.role === 'admin';
          setSession(snapshot.exists() && member?.enabled !== false
            ? { kind: 'member', email, name: member?.name || email, photoURL: user.photoURL, isAdmin,
                hasReviewGrant: isAdmin || (Array.isArray(member?.grants) && member.grants.includes('taskReview')) }
            : { kind: !snapshot.exists() && snapshot.metadata.fromCache ? 'error' : 'denied' });
        }, () => setSession({ kind: 'error' }));
      }
    });
    return () => { stopAuth(); stopMembership?.(); };
  }, []);
  return session;
}
