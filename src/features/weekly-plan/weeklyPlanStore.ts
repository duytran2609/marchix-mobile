import { collection, doc, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { db } from '../../services/firebase/firebase';
import type { WeekCommitment } from './weeklyPlan';

type TeamMember = { email: string; name: string };
export type WeekPlans = Map<string, WeekCommitment>;

export function watchWeekPlans(week: string, email: string, isAdmin: boolean,
  onPlans: (plans: WeekPlans) => void, onError: () => void) {
  const plans = query(collection(db, 'weekPlans'), where('week', '==', week));
  const visible = isAdmin ? plans : query(plans, where('email', '==', email));
  return onSnapshot(visible, { includeMetadataChanges: true }, snapshot => {
    if (snapshot.metadata.fromCache) return;
    const byEmail: WeekPlans = new Map();
    for (const row of snapshot.docs) {
      const data = row.data();
      if (typeof data.email !== 'string') continue;
      byEmail.set(data.email, {
        priorities: typeof data.priorities === 'string' ? data.priorities : '',
        blockers: typeof data.blockers === 'string' ? data.blockers : '',
      });
    }
    onPlans(byEmail);
  }, onError);
}

export function watchPlanningTeam(onTeam: (team: TeamMember[]) => void, onError: () => void) {
  return onSnapshot(collection(db, 'members'), { includeMetadataChanges: true }, snapshot => {
    if (snapshot.metadata.fromCache) return;
    const team = snapshot.docs.flatMap(row => {
      const data = row.data();
      return data.enabled === false ? [] : [{ email: data.email || row.id, name: data.name || row.id }];
    });
    onTeam(team.sort((a, b) => a.name.localeCompare(b.name, 'vi')));
  }, onError);
}

export function saveWeekPlan(email: string, week: string, commitment: WeekCommitment) {
  return setDoc(doc(db, 'weekPlans', email + '_' + week), {
    email, week, priorities: commitment.priorities.trim(), blockers: commitment.blockers.trim(),
    updatedAt: new Date().toISOString(),
  });
}
