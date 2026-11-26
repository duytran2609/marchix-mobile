import type { NotificationTaskTarget, WorkspaceNotification } from '../features/notifications/notifications';

import type { ProjectExpenseSeed } from '../features/projects/financeStore';

type TaskSelection = Exclude<NotificationTaskTarget, { id: string }>
  | { id: string; direct?: true; notice?: Pick<WorkspaceNotification, 'title' | 'body'> };

export type ProjectRoute = {
  screen: 'du-an';
  projectId?: string;
  section?: 'work' | 'finance' | 'discussion' | 'library';
  kanban?: boolean;
};

export type WorkspaceRoute =
  | { screen: 'tong-quan' }
  | { screen: 'cong-viec'; taskPopupId?: string }
  | { screen: 'cho-duyet'; detail?: { kind: 'cash' | 'request' | 'record'; id: string } }
  | { screen: 'ke-hoach-tuan' }
  | { screen: 'kpi' }
  | { screen: 'cham-cong'; checkInDate?: string }
  | { screen: 'don-tu'; requestId?: string; fromNotification?: true; fromPayrollMonth?: string }
  | { screen: 'thu-chi'; cashId?: string; fromProject?: string; fromNotification?: true; projectExpense?: ProjectExpenseSeed }
  | { screen: 'luong'; month?: string }
  | { screen: 'cai-dat' }
  | { screen: 'ca-nhan' }
  | { screen: 'van-thu'; recordId?: string }
  | ProjectRoute
  | { screen: 'task-detail'; task: TaskSelection; backTo?: 'tong-quan' | 'cho-duyet' };

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

export function workspaceTabLabel(tab: typeof workspaceTabs[number], isAdmin: boolean) {
  return tab.id === 'luong' && isAdmin ? 'Nhân sự & lương' : tab.label;
}

export function workspaceTabForLink(link: string): WorkspaceTab {
  return workspaceTabs.find(tab => `#${tab.id}` === link)?.id ?? 'tong-quan';
}

export function workflowRouteForLink(link: string): WorkspaceRoute | undefined {
  const match = /^#(don-tu|thu-chi|luong)\/([^/\s]+)$/.exec(link);
  if (!match) return undefined;
  const [, screen, id] = match;
  if (id.length > 1500 || id === '.' || id === '..') return undefined;
  if (screen === 'don-tu') return { screen, requestId: id, fromNotification: true };
  if (screen === 'thu-chi') return { screen, cashId: id, fromNotification: true };
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(id)) return { screen: 'luong', month: id };
}
