import { collection, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, pilotMode, taskFunctions } from '../../services/firebase/firebase';

export type DirectoryMember = { email: string; name: string; canReview: boolean; canReviewTasks: boolean };
const listMembers = httpsCallable<void, DirectoryMember[]>(taskFunctions, 'listMobileRequestMembers', { timeout: 12000 });

export function watchMemberDirectory(isAdmin: boolean, onData: (members: DirectoryMember[]) => void,
  onError: () => void, refresh = true) {
  if (isAdmin || pilotMode) {
    return onSnapshot(collection(db, 'members'), { includeMetadataChanges: true }, snapshot => {
      if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
      onData(snapshot.docs.map(row => {
        const member = row.data();
        const hasGrant = (grant: string) => member.enabled !== false && (member.role === 'admin' ||
          (Array.isArray(member.grants) && member.grants.includes(grant)));
        return { email: row.id, name: typeof member.name === 'string' && member.name.trim() ? member.name : row.id,
          canReview: hasGrant('requestReview'), canReviewTasks: hasGrant('taskReview') };
      }));
    }, onError);
  }

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  async function update() {
    try {
      const { data } = await listMembers();
      if (!stopped) onData(data);
    } catch {
      if (!stopped) onError();
    } finally {
      if (!stopped && refresh) timer = setTimeout(update, 5000);
    }
  }
  void update();
  return () => { stopped = true; clearTimeout(timer); };
}
