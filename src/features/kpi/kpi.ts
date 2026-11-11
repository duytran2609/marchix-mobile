import { dateInVietnam } from '../tasks/taskDates';
import type { Task } from '../tasks/tasks';

export type KpiMember = { email: string; name: string };
export type KpiRow = {
  email: string;
  total: number;
  onTime: number;
  late: number;
  missed: number;
  pending: number;
  unverified?: number;
  pct: number | null;
  grade?: string;
};
export type LockedKpi = Omit<KpiRow, 'pct'> & {
  month: string;
  lockedAt?: string;
  pct?: number | string | null;
};

const weights = new Map([['Cao', 3], ['Trung bình', 2], ['Thấp', 1]]);
const ratings = new Map([['Xuất sắc', 1], ['Tốt', 1], ['Khá', 0.9], ['Trung bình', 0.75], ['Kém', 0.5]]);
const normalizedName = (name?: string) => (name || '').trim().toLowerCase();
export const kpiGrade = (pct: number | null) => pct === null ? '–' : pct >= 90 ? 'A' : pct >= 75 ? 'B' : pct >= 60 ? 'C' : 'D';

export function kpiMonths(today: string, tasks: Task[], snapshots: LockedKpi[]) {
  return [...new Set([
    today.slice(0, 7), ...tasks.map(task => task.due?.slice(0, 7) || ''), ...snapshots.map(row => row.month),
  ])].filter(month => /^\d{4}-(0[1-9]|1[0-2])$/.test(month)).sort().reverse();
}

export function kpiForMonth(month: string, projectId: string, today: string, tasks: Task[],
  snapshots: LockedKpi[], members: KpiMember[]) {
  const locked = projectId ? [] : snapshots.filter(row => row.month === month);
  const rows: KpiRow[] = locked.length ? locked.map(row => {
    const pct = row.pct === '' || row.pct == null ? null : Number(row.pct);
    return { ...row, pct: Number.isFinite(pct) ? pct : null };
  }) : calculateRows(month, projectId, today, tasks, members);
  rows.sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
  return { rows, locked: locked.length > 0, lockedAt: locked[0]?.lockedAt };
}

function calculateRows(month: string, projectId: string, today: string, tasks: Task[], members: KpiMember[]): KpiRow[] {
  const emailByName = new Map<string, string>();
  for (const member of members) {
    const name = normalizedName(member.name);
    if (name && !emailByName.has(name)) emailByName.set(name, member.email);
  }
  type Totals = Required<Pick<KpiRow, 'unverified'>> & KpiRow & { earned: number; possible: number };
  const rows = new Map<string, Totals>();
  for (const task of tasks) {
    const due = task.due;
    if (!due || due.slice(0, 7) !== month || (projectId && task.projectId !== projectId)) continue;
    const email = task.assigneeEmail || emailByName.get(normalizedName(task.assignee)) || `ten:${task.assignee || 'Chưa giao'}`;
    const row = rows.get(email) ?? {
      email, total: 0, onTime: 0, late: 0, missed: 0, pending: 0, unverified: 0, earned: 0, possible: 0, pct: null,
    };
    rows.set(email, row);
    row.total++;
    const weight = weights.get(task.priority || '') ?? 2;
    if (task.status === 'Xong' || task.status === 'Chờ duyệt') {
      const completedAt = new Date(task.doneAt || '');
      if (Number.isNaN(completedAt.getTime())) {
        row.unverified++;
        continue;
      }
      const onTime = dateInVietnam(completedAt) <= due;
      if (onTime) row.onTime++;
      else row.late++;
      row.possible += weight;
      row.earned += weight * (onTime ? 1 : 0.5) * (ratings.get(task.rating || '') ?? 1);
    } else if (due < today) {
      row.missed++;
      row.possible += weight;
    } else {
      row.pending++;
    }
  }
  return Array.from(rows.values(), ({ earned, possible, ...row }) => ({
    ...row, pct: possible ? Math.round(earned * 100 / possible) : null,
  }));
}
