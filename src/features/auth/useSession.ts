import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { auth, configError, db } from '../../services/firebase/firebase';

export type MemberSession = {
  kind: 'member'; email: string; name: string; photoURL: string | null; isAdmin: boolean; hasReviewGrant: boolean;
  canReadCash: boolean; canReviewCash: boolean; canReviewRequests: boolean;
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
        stopMembership = onSnapshot(doc(db, 'members', email), { includeMetadataChanges: true }, snapshot => {
          const member = snapshot.data();
          const isAdmin = member?.role === 'admin';
          setSession(snapshot.exists() && member?.enabled !== false
            ? { kind: 'member', email, name: member?.name || email, photoURL: user.photoURL, isAdmin,
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
