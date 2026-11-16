import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { ActivityIndicator } from 'react-native';
import type { MemberSession } from '../features/auth/useSession';
import { findNotificationTask } from '../features/notifications/notifications';
import { useReminderSettings } from '../features/settings/reminderSettings';
import { initialTaskBoardOptions } from '../features/tasks/TaskBoard';
import { watchTasks } from '../features/tasks/tasks';
import type { Task } from '../features/tasks/tasks';
import { usePlanningDrafts } from '../features/weekly-plan/usePlanningDrafts';
import { AttendanceScreen } from '../screens/AttendanceScreen';
import { CashScreen } from '../screens/CashScreen';
import { KpiScreen } from '../screens/KpiScreen';
import { OverviewScreen } from '../screens/OverviewScreen';
import { PayrollScreen } from '../screens/PayrollScreen';
import { ProjectsScreen } from '../screens/ProjectsScreen';
import { RequestsScreen } from '../screens/RequestsScreen';
import { ReviewQueueScreen } from '../screens/ReviewQueueScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { LinkedTaskDetail, TaskDetailPopup, TaskDetailScreen, TaskUnavailable } from '../screens/TaskDetailScreen';
import { TasksScreen } from '../screens/TasksScreen';
import { RecordsScreen } from '../screens/RecordsScreen';
import { WeeklyPlanScreen } from '../screens/WeeklyPlanScreen';
import { useTheme } from '../theme/theme';
import type { WorkspaceRoute } from './workspaceRoutes';

export function WorkspaceNavigator({
  email, name, isAdmin, hasReviewGrant, canReadCash, canReviewCash, canReviewRequests, route, setRoute, showAssignment, setShowAssignment, onDragChange, onScrollTop,
}: Pick<MemberSession, 'email' | 'name' | 'isAdmin' | 'hasReviewGrant' | 'canReadCash' | 'canReviewCash' | 'canReviewRequests'> & {
  route: WorkspaceRoute;
  setRoute: Dispatch<SetStateAction<WorkspaceRoute>>;
  showAssignment: boolean;
  setShowAssignment: (open: boolean) => void;
  onDragChange: (dragging: boolean) => void;
  onScrollTop: () => void;
}) {
  const { colors } = useTheme();
  const reminders = useReminderSettings(email);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [tasksComplete, setTasksComplete] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [options, setOptions] = useState(initialTaskBoardOptions);
  const [planningWeek, setPlanningWeek] = useState<string>();
  const planningDrafts = usePlanningDrafts(email);
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

  function openReviewQueue() {
    setRoute({ screen: 'cho-duyet' });
  }

  if (route.screen === 'tong-quan') return <OverviewScreen
    key={JSON.stringify([email, isAdmin, canReadCash, canReviewCash, canReviewRequests])}
    email={email} isAdmin={isAdmin} canReadCash={canReadCash} canReviewCash={canReviewCash}
    canReviewRequests={canReviewRequests} personalTasks={tasksComplete ? tasks : null}
    tasksError={error || sentError} onRetryTasks={retryTasks} onNavigate={setRoute} />;
  if (route.screen === 'luong') return <PayrollScreen key={JSON.stringify([email, isAdmin, route.month])}
    email={email} isAdmin={isAdmin} initialMonth={route.month}
    onOpenAdvance={(requestId, month) => { setRoute({ screen: 'don-tu', requestId, fromPayrollMonth: month }); onScrollTop(); }} />;
  if (route.screen === 'cham-cong') return <AttendanceScreen key={`${email}-${isAdmin}`} email={email} name={name} isAdmin={isAdmin} />;
  if (route.screen === 'don-tu') return <RequestsScreen key={JSON.stringify([email, isAdmin, canReviewRequests, route.requestId])}
    email={email} name={name} isAdmin={isAdmin} canReviewRequests={canReviewRequests}
    initialRequestId={route.requestId}
    onBackToReview={route.fromPayrollMonth ? () => {
      setRoute({ screen: 'luong', month: route.fromPayrollMonth });
      onScrollTop();
    } : route.fromNotification ? () => setRoute({ screen: 'don-tu' }) : route.requestId ? openReviewQueue : undefined}
    tasks={tasksComplete ? tasks : null} tasksError={error || sentError} onRetryTasks={retryTasks} />;
  if (route.screen === 'thu-chi') return <CashScreen key={JSON.stringify([email, isAdmin, canReadCash, canReviewCash, route.cashId, route.projectExpense])}
    access={{ email, isAdmin, canReadCash, canReviewCash }} initialCashId={route.cashId} projectExpense={route.projectExpense}
    onBackToReview={route.fromProject ? () => {
      setRoute({ screen: 'du-an', projectId: route.fromProject, section: 'finance' });
      onScrollTop();
    }
      : route.fromNotification ? () => setRoute({ screen: 'thu-chi' }) : route.cashId ? openReviewQueue : undefined}
    backLabel={route.fromProject ? 'Về tài chính dự án' : route.fromNotification ? 'Về sổ thu chi' : undefined} />;
  if (route.screen === 'kpi') return <KpiScreen key={`${email}-${isAdmin}`} email={email} name={name} isAdmin={isAdmin} />;
  if (route.screen === 'ke-hoach-tuan') return <WeeklyPlanScreen key={`${email}-${isAdmin}`}
    email={email} name={name} isAdmin={isAdmin} tasks={tasksComplete ? tasks : null}
    selectedWeek={planningWeek} onSelectWeek={setPlanningWeek}
    draftStorage={planningDrafts}
    tasksError={error} onRetryTasks={retryTasks} />;
  if (route.screen === 'cai-dat') return <SettingsScreen key={String(isAdmin)} reminders={reminders}
    isAdmin={isAdmin} email={email} onScrollTop={onScrollTop} />;
  if (route.screen === 'van-thu') return <RecordsScreen key={JSON.stringify([email, isAdmin])}
    email={email} isAdmin={isAdmin} recordId={route.recordId}
    onSelect={recordId => setRoute({ screen: 'van-thu', recordId })} />;
  if (route.screen === 'cho-duyet') return <>
    <ReviewQueueScreen key={JSON.stringify([email, isAdmin, hasReviewGrant, canReadCash, canReviewCash, canReviewRequests])}
      cashAccess={{ email, isAdmin, canReadCash, canReviewCash }} hasReviewGrant={hasReviewGrant}
      canReviewRequests={canReviewRequests}
      onOpenCash={id => setRoute({ screen: 'cho-duyet', detail: { kind: 'cash', id } })}
      onOpenRequest={id => setRoute({ screen: 'cho-duyet', detail: { kind: 'request', id } })}
      onOpenRecord={id => setRoute({ screen: 'cho-duyet', detail: { kind: 'record', id } })} />
    {route.detail?.kind === 'cash' && <CashScreen key={route.detail.id}
      access={{ email, isAdmin, canReadCash, canReviewCash }} initialCashId={route.detail.id}
      onBackToReview={openReviewQueue} />}
    {route.detail?.kind === 'request' && <RequestsScreen key={route.detail.id}
      email={email} name={name} isAdmin={isAdmin} canReviewRequests={canReviewRequests}
      initialRequestId={route.detail.id} onBackToReview={openReviewQueue}
      tasks={tasksComplete ? tasks : null} tasksError={error || sentError} onRetryTasks={retryTasks} />}
    {route.detail?.kind === 'record' && <RecordsScreen key={route.detail.id}
      email={email} isAdmin={isAdmin} recordId={route.detail.id} onSelect={openReviewQueue}
      onBackToReview={openReviewQueue} />}
  </>;
  if (route.screen === 'du-an') return <ProjectsScreen key={String(isAdmin)} route={route}
    onNavigate={next => setRoute(current => current === route ? next : current)}
    email={email} name={name} isAdmin={isAdmin} canReadCash={canReadCash} tasks={tasksComplete ? tasks : null}
    tasksError={error || sentError} onRetryTasks={retryTasks} onDragChange={onDragChange}
    onProjectExpense={projectExpense => {
      setRoute({ screen: 'thu-chi', projectExpense, fromProject: projectExpense.projectId });
      onScrollTop();
    }}
    onProjectCash={(projectId, cashId) => {
      setRoute({ screen: 'thu-chi', cashId, fromProject: projectId });
      onScrollTop();
    }}
    onOpenTask={task => setRoute({ screen: 'cong-viec', taskPopupId: task.id })} />;
  if (selected) {
    const backTo = route.screen === 'task-detail' ? route.backTo : undefined;
    const onBack = () => setRoute({ screen: backTo ?? 'cong-viec' });
    if ('title' in selected) {
      if (error || (tasksComplete && !matchedTaskId)) {
        return <TaskUnavailable onBack={onBack} />;
      }
      return <ActivityIndicator accessibilityLabel="Đang tải công việc" color={colors.accent} />;
    }
    if ('direct' in selected) return <LinkedTaskDetail key={selected.id} id={selected.id} email={email} name={name}
      onBack={onBack} backLabel={backTo ? 'Tổng quan' : undefined} />;
    const liveTask = tasks?.find(task => task.id === selected.id);
    if (liveTask && !error) return <TaskDetailScreen key={liveTask.id} liveTask={liveTask} email={email} name={name} onBack={onBack} />;
  }

  return <>
    <TasksScreen key={String(isAdmin)} email={email} name={name} isAdmin={isAdmin}
      tasks={tasks} error={error} sentError={sentError} reminderWindow={reminders.value}
      onRetry={retryTasks} options={options} onOptionsChange={setOptions}
      onOpenTask={task => setRoute({
        screen: 'task-detail', task: isAdmin ? { id: task.id, direct: true } : { id: task.id },
      })}
      showAssignment={showAssignment} setShowAssignment={setShowAssignment} onDragChange={onDragChange} />
    {route.screen === 'cong-viec' && route.taskPopupId && <TaskDetailPopup key={route.taskPopupId}
      id={route.taskPopupId} email={email} name={name} onClose={() => setRoute({ screen: 'cong-viec' })} />}
  </>;
}
