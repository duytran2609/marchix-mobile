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
  | { screen: 'cong-viec'; taskPopupId?: string; taskPopupBackTo?: 'ke-hoach-tuan' }
  | { screen: 'cho-duyet' }
  | { screen: 'ke-hoach-tuan' }
  | { screen: 'kpi' }
  | { screen: 'cham-cong' }
  | { screen: 'don-tu' }
  | { screen: 'thu-chi'; cashId?: string }
  | { screen: 'luong' }
  | { screen: 'cai-dat' }
  | { screen: 'van-thu'; recordId?: string }
  | ProjectRoute
  | { screen: 'task-detail'; task: TaskSelection; backTo?: 'tong-quan' };

export const workspaceTabs = [
  { id: 'tong-quan', label: 'Tổng quan', icon: '⌂', native: true },
  { id: 'cong-viec', label: 'Công việc', icon: '☷', native: true },
  { id: 'ke-hoach-tuan', label: 'Kế hoạch tuần', icon: '▦', native: true },
  { id: 'cho-duyet', label: 'Phê duyệt', icon: '✓', native: true },
  { id: 'kpi', label: 'KPI', icon: '↗', native: true },
  { id: 'cham-cong', label: 'Chấm công', icon: '◷', native: true },
  { id: 'thu-chi', label: 'Thu chi', icon: '₫', native: true },
  { id: 'don-tu', label: 'Đơn từ', icon: '▤', native: true },
  { id: 'luong', label: 'Phiếu lương', icon: '▧', native: true },
  { id: 'du-an', label: 'Dự án', icon: '◇', native: true },
  { id: 'van-thu', label: 'Văn thư', icon: '▤', native: true },
  { id: 'cai-dat', label: 'Cài đặt', icon: '⚙', native: true },
] as const;

export type WorkspaceTab = typeof workspaceTabs[number]['id'];
type NativeWorkspaceTab = Extract<typeof workspaceTabs[number], { native: true }>['id'];

export function workspaceTabForLink(link: string): WorkspaceTab {
  return workspaceTabs.find(tab => `#${tab.id}` === link)?.id ?? 'tong-quan';
}

export function isNativeTab(tab: WorkspaceTab): tab is NativeWorkspaceTab {
  return workspaceTabs.some(item => item.id === tab && 'native' in item);
}
