import type { GanttRange } from './TaskGantt';
import { overdueTaskLabel, taskUnsetLabel } from './taskLabels';
import { taskPriorities, taskStatuses } from './tasks';

export const taskFilters = ['Tất cả', 'Chưa xong', overdueTaskLabel, ...taskStatuses] as const;
export const priorityFilters = ['', ...taskPriorities, taskUnsetLabel] as const;

export type TaskBoardOptions = {
  search: string; filter: typeof taskFilters[number]; assignee: string;
  priority: typeof priorityFilters[number]; project: string | null;
  view: 'list' | 'kanban' | 'gantt'; ganttRange: GanttRange;
};

export const initialTaskBoardOptions: TaskBoardOptions = {
  search: '', filter: 'Tất cả', assignee: '', priority: '', project: null, view: 'list', ganttRange: 'month',
};
