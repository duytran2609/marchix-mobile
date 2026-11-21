import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { auth, configError, db } from '../../services/firebase/firebase';
import { rememberAccount } from './recentAccounts';

export type MemberSession = {
  kind: 'member'; email: string; name: string; photoURL: string | null; isAdmin: boolean; hasReviewGrant: boolean;
  canReadCash: boolean; canReviewCash: boolean; canReviewRequests: boolean; accountCreatedAt: string | undefined;
};
export type Session =
  | { kind: 'loading' | 'signed-out' | 'denied' | 'error' }
  | MemberSession;

export function useSession() {
  const [session, setSession] = useState<Session>({ kind: 'loading' });
  const [showLoginReminder, setShowLoginReminder] = useState(false);
  useEffect(() => {
    if (configError) return;
    let stopMembership: (() => void) | undefined;
    let previousUid: string | null | undefined;
    const stopAuth = onAuthStateChanged(auth, user => {
      stopMembership?.();
      const uid = user?.uid ?? null;
      // The first auth notification can restore a persisted session.
      if (uid !== previousUid) {
        setShowLoginReminder(previousUid !== undefined && uid !== null);
        previousUid = uid;
      }
      if (!user) {
        setSession({ kind: 'signed-out' });
      } else if (!user.email || !user.emailVerified) {
        setSession({ kind: 'denied' });
      } else {
        const email = user.email;
        setSession({ kind: 'loading' });
        let rememberedName: string | undefined;
        stopMembership = onSnapshot(doc(db, 'members', email), { includeMetadataChanges: true }, snapshot => {
          const member = snapshot.data();
          const isAdmin = member?.role === 'admin';
          const allowed = snapshot.exists() && member?.enabled !== false;
          const name = member?.name || email;
          if (allowed && !snapshot.metadata.fromCache && rememberedName !== name) {
            rememberAccount({ email, name, photoURL: user.photoURL });
            rememberedName = name;
          }
          setSession(allowed
            ? { kind: 'member', email, name, photoURL: user.photoURL, isAdmin, accountCreatedAt: user.metadata.creationTime,
                hasReviewGrant: isAdmin || (Array.isArray(member?.grants) && member.grants.includes('taskReview')),
                canReviewRequests: isAdmin || (Array.isArray(member?.grants) && member.grants.includes('requestReview')),
                canReadCash: isAdmin || (Array.isArray(member?.grants) && member.grants.includes('cashRecord')),
                canReviewCash: isAdmin || (Array.isArray(member?.grants) && member.grants.includes('cashReview')) }
            : { kind: !snapshot.exists() && snapshot.metadata.fromCache ? 'error' : 'denied' });
        }, () => setSession({ kind: 'error' }));
      }
    });
    return () => { stopAuth(); stopMembership?.(); };
  }, []);
  return { session, showLoginReminder, dismissLoginReminder: () => setShowLoginReminder(false) };
}
