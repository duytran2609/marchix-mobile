import type { WorkspaceTab } from './workspaceRoutes';

export const workspaceTabIcons = {
  'tong-quan': require('../../assets/sidebar/overview.png'),
  'cong-viec': require('../../assets/sidebar/tasks.png'),
  'ke-hoach-tuan': require('../../assets/sidebar/weekly-plan.png'),
  'cho-duyet': require('../../assets/sidebar/approval.png'),
  'kpi': require('../../assets/sidebar/kpi.png'),
  'cham-cong': require('../../assets/sidebar/attendance.png'),
  'thu-chi': require('../../assets/sidebar/cash.png'),
  'don-tu': require('../../assets/sidebar/requests.png'),
  'luong': require('../../assets/sidebar/payroll.png'),
  'du-an': require('../../assets/sidebar/projects.png'),
  'van-thu': require('../../assets/sidebar/records.png'),
  'cai-dat': require('../../assets/sidebar/settings.png'),
} satisfies Record<WorkspaceTab, number>;
