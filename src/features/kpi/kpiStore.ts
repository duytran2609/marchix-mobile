import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../services/firebase/firebase';
import { watchProjects } from '../projects/projects';
import type { Project } from '../projects/projects';
import type { Task } from '../tasks/tasks';
import type { KpiMember, LockedKpi } from './kpi';

export type KpiData = { tasks: Task[]; snapshots: LockedKpi[]; members: KpiMember[]; projects: Project[] };

export function watchKpi(member: KpiMember, isAdmin: boolean, onData: (data: KpiData) => void, onError: () => void) {
  let tasks: Task[] | undefined;
  let snapshots: LockedKpi[] | undefined;
  let members: KpiMember[] | undefined = isAdmin ? undefined : [member];
  let projects: Project[] | undefined;
  const taskCollection = collection(db, 'tasks');
  const kpiCollection = collection(db, 'kpi');
  const options = { includeMetadataChanges: true };

  function publish() {
    if (tasks && snapshots && members && projects) onData({ tasks, snapshots, members, projects });
  }

  const stopTasks = onSnapshot(isAdmin ? taskCollection : query(taskCollection, where('assigneeEmail', '==', member.email)),
    options, snapshot => {
      if (snapshot.metadata.fromCache) return;
      tasks = snapshot.docs.map(row => ({ ...row.data(), id: row.id }) as Task);
      publish();
    }, onError);
  const stopKpi = onSnapshot(isAdmin ? kpiCollection : query(kpiCollection, where('email', '==', member.email)),
    options, snapshot => {
      if (snapshot.metadata.fromCache) return;
      snapshots = snapshot.docs.map(row => row.data() as LockedKpi);
      publish();
    }, onError);
  const stopMembers = isAdmin ? onSnapshot(collection(db, 'members'), options, snapshot => {
    if (snapshot.metadata.fromCache) return;
    members = snapshot.docs.map(row => ({ email: row.get('email') || row.id, name: row.get('name') || '' }));
    publish();
  }, onError) : undefined;
  const stopProjects = watchProjects(items => {
    projects = items;
    publish();
  }, onError);
  return () => { stopTasks(); stopKpi(); stopMembers?.(); stopProjects(); };
}
