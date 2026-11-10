import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { ActivityIndicator } from 'react-native';
import type { MemberSession } from '../features/auth/useSession';
import { findNotificationTask } from '../features/notifications/notifications';
import { initialTaskBoardOptions } from '../features/tasks/TaskBoard';
import { watchTasks } from '../features/tasks/tasks';
import type { Task } from '../features/tasks/tasks';
import { ReviewQueueScreen } from '../screens/ReviewQueueScreen';
import { LinkedTaskDetail, TaskDetailScreen, TaskUnavailable } from '../screens/TaskDetailScreen';
import { TasksScreen } from '../screens/TasksScreen';
import { colors } from '../theme/theme';
import type { WorkspaceRoute } from './workspaceRoutes';

export function WorkspaceNavigator({
  email, name, isAdmin, hasReviewGrant, route, setRoute, showAssignment, setShowAssignment, onDragChange, onScrollTop,
}: Pick<MemberSession, 'email' | 'name' | 'isAdmin' | 'hasReviewGrant'> & {
  route: WorkspaceRoute;
  setRoute: Dispatch<SetStateAction<WorkspaceRoute>>;
  showAssignment: boolean;
  setShowAssignment: (open: boolean) => void;
  onDragChange: (dragging: boolean) => void;
  onScrollTop: () => void;
}) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [tasksComplete, setTasksComplete] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [options, setOptions] = useState(initialTaskBoardOptions);
  const [sentError, setSentError] = useState(false);
  useEffect(() => watchTasks(email, (items, complete) => {
    setTasks(items);
    setTasksComplete(complete);
  }, () => setError(true), () => setSentError(true)), [email, retry]);

  const selected = route.screen === 'task-detail' ? route.task : undefined;
  const matchedTaskId = selected && 'title' in selected && tasksComplete && tasks && !error
    ? findNotificationTask(selected, tasks, email)?.id : undefined;
  useEffect(() => {
    if (matchedTaskId) {
      setRoute(current => current.screen === 'task-detail' && current.task === selected
        ? { screen: 'task-detail', task: { id: matchedTaskId } }
        : current);
    }
  }, [matchedTaskId, selected, setRoute]);

  function retryTasks() {
    setTasks(null);
    setTasksComplete(false);
    setError(false);
    setSentError(false);
    setRetry(value => value + 1);
  }

  if (route.screen === 'cho-duyet') return <ReviewQueueScreen key={`${isAdmin}-${hasReviewGrant}`} email={email} isAdmin={isAdmin} hasReviewGrant={hasReviewGrant}
    onBack={() => setRoute({ screen: 'cong-viec' })} onScrollTop={onScrollTop} />;
  if (selected) {
    const onBack = () => setRoute({ screen: 'cong-viec' });
    if ('title' in selected) {
      if (error || (tasksComplete && !matchedTaskId)) {
        return <TaskUnavailable onBack={onBack} />;
      }
      return <ActivityIndicator accessibilityLabel="Đang tải công việc" color={colors.accent} />;
    }
    if ('direct' in selected) return <LinkedTaskDetail key={selected.id} id={selected.id} email={email} name={name} onBack={onBack} />;
    const liveTask = tasks?.find(task => task.id === selected.id);
    if (liveTask && !error) return <TaskDetailScreen key={liveTask.id} liveTask={liveTask} email={email} name={name} onBack={onBack} />;
  }

  return <TasksScreen email={email} name={name} tasks={tasks} error={error} sentError={sentError}
    onRetry={retryTasks} options={options} onOptionsChange={setOptions}
    onOpenTask={task => setRoute({ screen: 'task-detail', task: { id: task.id } })}
    showAssignment={showAssignment} setShowAssignment={setShowAssignment} onDragChange={onDragChange} />;
}
