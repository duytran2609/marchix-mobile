import type { NotificationTaskTarget } from '../features/notifications/notifications';

type TaskSelection = NotificationTaskTarget | { id: string; direct: true };

export type ProjectRoute = {
  screen: 'du-an';
  projectId?: string;
  section?: 'overview' | 'work' | 'finance';
  kanban?: boolean;
};

export type WorkspaceRoute =
  | { screen: 'tong-quan' }
  | { screen: 'cong-viec'; taskPopupId?: string }
  | { screen: 'cho-duyet'; detail?: { kind: 'cash' | 'request' | 'record'; id: string } }
  | { screen: 'ke-hoach-tuan' }
  | { screen: 'kpi' }
  | { screen: 'cham-cong' }
  | { screen: 'don-tu' }
  | { screen: 'thu-chi' }
  | { screen: 'luong' }
  | { screen: 'cai-dat' }
  | { screen: 'van-thu'; recordId?: string }
  | ProjectRoute
  | { screen: 'task-detail'; task: TaskSelection; backTo?: 'tong-quan' };

export const workspaceTabs = [
  { id: 'tong-quan', label: 'Tổng quan' },
  { id: 'cong-viec', label: 'Công việc' },
  { id: 'ke-hoach-tuan', label: 'Kế hoạch tuần' },
  { id: 'cho-duyet', label: 'Phê duyệt' },
  { id: 'kpi', label: 'KPI' },
  { id: 'cham-cong', label: 'Chấm công' },
  { id: 'thu-chi', label: 'Thu chi' },
  { id: 'don-tu', label: 'Đơn từ' },
  { id: 'luong', label: 'Phiếu lương' },
  { id: 'du-an', label: 'Dự án' },
  { id: 'van-thu', label: 'Văn thư' },
  { id: 'cai-dat', label: 'Cài đặt' },
] as const;

export type WorkspaceTab = typeof workspaceTabs[number]['id'];

export function workspaceTabForLink(link: string): WorkspaceTab {
  return workspaceTabs.find(tab => `#${tab.id}` === link)?.id ?? 'tong-quan';
}
