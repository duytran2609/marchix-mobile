import { collection, doc, onSnapshot, or, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../../services/firebase/firebase';
import type { Task } from '../tasks/tasks';

export const projectStatuses = ['Đang chạy', 'Tạm dừng', 'Xong'] as const;
export const projectTextFields = {
  name: 'Tên dự án', owner: 'Phụ trách', ownerEmail: 'Email người phụ trách',
  startDate: 'Ngày bắt đầu', deadline: 'Ngày kết thúc',
  goal: 'Mục tiêu / kết quả bàn giao', phase: 'Giai đoạn hiện tại',
  risks: 'Rủi ro / cần quyết định', note: 'Mô tả ngắn',
};
type ProjectTextField = keyof typeof projectTextFields;
export type ProjectProfile = Record<ProjectTextField, string> & { status: string; budget: number };
export type Project = ProjectProfile & { id: string };

export function watchProjects(onProjects: (projects: Project[]) => void, onError: () => void) {
  return onSnapshot(collection(db, 'projects'), { includeMetadataChanges: true }, snapshot => {
    if (snapshot.metadata.fromCache) return;
    onProjects(snapshot.docs.map(row => ({ ...row.data(), id: row.id }) as Project)
      .filter(project => typeof project.name === 'string' && project.name.trim())
      .sort((a, b) => a.name.localeCompare(b.name, 'vi')));
  }, onError);
}

export function watchPilotProjectTasks(email: string, isAdmin: boolean, onTasks: (tasks: Task[]) => void, onError: () => void) {
  const tasks = collection(db, 'tasks');
  const visible = isAdmin ? tasks : query(tasks, or(
    where('assignedBy', '==', email), where('assigneeEmail', '==', email),
    where('approverEmail', '==', email), where('watchers', 'array-contains', email),
  ));
  return onSnapshot(visible, { includeMetadataChanges: true }, snapshot => {
    if (snapshot.metadata.fromCache) return;
    onTasks(snapshot.docs.map(row => ({ ...row.data(), id: row.id }) as Task)
      .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.title.localeCompare(b.title, 'vi')));
  }, onError);
}

export function generateProjectId() {
  return doc(collection(db, 'projects')).id;
}

export async function saveProject(profile: ProjectProfile, id: string, mode: 'create' | 'edit') {
  const project = doc(db, 'projects', id);
  if (mode === 'create') await setDoc(project, profile);
  else await updateDoc(project, profile);
  return id;
}

const workDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });

export function projectMetrics(tasks: Task[], today = workDate.format(new Date())) {
  let weight = 0;
  let progress = 0;
  let done = 0;
  let review = 0;
  let overdue = 0;
  let blocked = 0;
  for (const task of tasks) {
    const priorityWeight = task.priority === 'Cao' ? 3 : task.priority === 'Thấp' ? 1 : 2;
    weight += priorityWeight;
    progress += priorityWeight * (task.status === 'Xong' ? 100 : Number(task.progress) || 0);
    if (task.status === 'Xong') done++;
    if (task.status === 'Chờ duyệt') review++;
    if (task.status !== 'Xong' && task.due && task.due < today) overdue++;
    if (task.status === 'Vướng') blocked++;
  }
  return { progress: weight ? Math.round(progress / weight) : null, done, review, overdue, blocked };
}
