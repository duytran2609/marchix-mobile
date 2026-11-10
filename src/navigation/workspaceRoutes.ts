import type { NotificationTaskTarget } from '../features/notifications/notifications';

type TaskSelection = NotificationTaskTarget | { id: string; direct: true };

export type WorkspaceRoute =
  | { screen: 'cong-viec' }
  | { screen: 'cho-duyet' }
  | { screen: 'task-detail'; task: TaskSelection };

export const workspaceTabs = [
  { id: 'tong-quan', label: 'Tổng quan', icon: '⌂' },
  { id: 'cong-viec', label: 'Công việc', icon: '☷', native: true },
  { id: 'ke-hoach-tuan', label: 'Kế hoạch tuần', icon: '▦' },
  { id: 'cho-duyet', label: 'Phê duyệt', icon: '✓', native: true },
  { id: 'kpi', label: 'KPI', icon: '↗' },
  { id: 'cham-cong', label: 'Chấm công', icon: '◷' },
  { id: 'thu-chi', label: 'Thu chi', icon: '₫' },
  { id: 'don-tu', label: 'Đơn từ', icon: '▤' },
  { id: 'luong', label: 'Phiếu lương', icon: '▧' },
  { id: 'du-an', label: 'Dự án', icon: '◇' },
  { id: 'cai-dat', label: 'Cài đặt', icon: '⚙' },
] as const;

export type WorkspaceTab = typeof workspaceTabs[number]['id'];
type NativeWorkspaceTab = Extract<typeof workspaceTabs[number], { native: true }>['id'];

export function workspaceTabForLink(link: string): WorkspaceTab {
  return workspaceTabs.find(tab => `#${tab.id}` === link)?.id ?? 'tong-quan';
}

export function isNativeTab(tab: WorkspaceTab): tab is NativeWorkspaceTab {
  return workspaceTabs.some(item => item.id === tab && 'native' in item);
}
