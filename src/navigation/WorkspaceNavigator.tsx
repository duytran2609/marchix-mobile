import { lazy, useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { ActivityIndicator } from 'react-native';
import { DeferredContent } from '../components/DeferredContent';
import type { MemberSession } from '../features/auth/useSession';
import { findNotificationTask } from '../features/notifications/notifications';
import type { useReminderSettings } from '../features/settings/reminderSettings';
import { initialTaskBoardOptions } from '../features/tasks/taskBoardOptions';
import type { useWorkspaceTasks } from '../features/tasks/useWorkspaceTasks';
import { usePlanningDrafts } from '../features/weekly-plan/usePlanningDrafts';
import { OverviewScreen } from '../screens/OverviewScreen';
import { useTheme } from '../theme/theme';
import type { WorkspaceRoute } from './workspaceRoutes';

const AttendanceScreen = lazy(() => import('../screens/AttendanceScreen').then(module => ({ default: module.AttendanceScreen })));
const CashScreen = lazy(() => import('../screens/CashScreen').then(module => ({ default: module.CashScreen })));
const KpiScreen = lazy(() => import('../screens/KpiScreen').then(module => ({ default: module.KpiScreen })));
const PayrollScreen = lazy(() => import('../screens/PayrollScreen').then(module => ({ default: module.PayrollScreen })));
const ProfileScreen = lazy(() => import('../screens/ProfileScreen').then(module => ({ default: module.ProfileScreen })));
const ProjectsScreen = lazy(() => import('../screens/ProjectsScreen').then(module => ({ default: module.ProjectsScreen })));
const RequestsScreen = lazy(() => import('../screens/RequestsScreen').then(module => ({ default: module.RequestsScreen })));
const ReviewQueueScreen = lazy(() => import('../screens/ReviewQueueScreen').then(module => ({ default: module.ReviewQueueScreen })));
const TasksScreen = lazy(() => import('../screens/TasksScreen').then(module => ({ default: module.TasksScreen })));
const RecordsScreen = lazy(() => import('../screens/RecordsScreen').then(module => ({ default: module.RecordsScreen })));
const WeeklyPlanScreen = lazy(() => import('../screens/WeeklyPlanScreen').then(module => ({ default: module.WeeklyPlanScreen })));
const LinkedTaskDetail = lazy(() => import('../screens/TaskDetailScreen').then(module => ({ default: module.LinkedTaskDetail })));
const TaskDetailPopup = lazy(() => import('../screens/TaskDetailScreen').then(module => ({ default: module.TaskDetailPopup })));
const TaskDetailScreen = lazy(() => import('../screens/TaskDetailScreen').then(module => ({ default: module.TaskDetailScreen })));
const TaskUnavailable = lazy(() => import('../screens/TaskDetailScreen').then(module => ({ default: module.TaskUnavailable })));

export function WorkspaceNavigator({
  email, name, photoURL, isAdmin, hasReviewGrant, canReadCash, canReviewCash, canReviewRequests, accountCreatedAt,
  canManageProjects, canReadTeamPlans, canReadTeamKpi, canManageRecords,
  route, setRoute, reminders, taskFeed, showAssignment, setShowAssignment, onDragChange, onScrollTop,
}: Omit<MemberSession, 'kind'> & {
  route: WorkspaceRoute;
  setRoute: Dispatch<SetStateAction<WorkspaceRoute>>;
  reminders: ReturnType<typeof useReminderSettings>;
  taskFeed: ReturnType<typeof useWorkspaceTasks>;
  showAssignment: boolean;
  setShowAssignment: (open: boolean) => void;
  onDragChange: (dragging: boolean) => void;
  onScrollTop: () => void;
}) {
  const { colors } = useTheme();
  const { tasks, tasksComplete, error, sentError, retryTasks } = taskFeed;
  const [options, setOptions] = useState(initialTaskBoardOptions);
  const [planningWeek, setPlanningWeek] = useState<string>();
  const planningDrafts = usePlanningDrafts(email);

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

  function openReviewQueue() {
    setRoute({ screen: 'cho-duyet' });
  }

  if (route.screen === 'ca-nhan') return <ProfileScreen email={email} name={name} photoURL={photoURL} isAdmin={isAdmin}
    accountCreatedAt={accountCreatedAt} />;
  if (route.screen === 'tong-quan') return <OverviewScreen
    key={JSON.stringify([email, isAdmin, canReadCash, canReviewCash, canReviewRequests])}
    email={email} name={name} isAdmin={isAdmin} canReadCash={canReadCash} canReviewCash={canReviewCash}
    canReviewRequests={canReviewRequests} personalTasks={tasksComplete ? tasks : null}
    tasksError={error || sentError} onRetryTasks={retryTasks} onNavigate={setRoute} />;
  if (route.screen === 'luong') return <PayrollScreen key={JSON.stringify([email, isAdmin, route.month])}
    email={email} isAdmin={isAdmin} initialMonth={route.month}
    onOpenAdvance={(requestId, month) => { setRoute({ screen: 'don-tu', requestId, fromPayrollMonth: month }); onScrollTop(); }} />;
  if (route.screen === 'cham-cong') return <AttendanceScreen key={`${email}-${isAdmin}`} email={email} name={name}
    isAdmin={isAdmin} checkInDate={route.checkInDate}
    onCheckInHandled={() => setRoute(current => current === route ? { screen: 'cham-cong' } : current)} />;
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
  if (route.screen === 'kpi') return <KpiScreen key={`${email}-${canReadTeamKpi}`} email={email} name={name} canReadTeam={canReadTeamKpi} />;
  if (route.screen === 'ke-hoach-tuan') return <WeeklyPlanScreen key={`${email}-${canReadTeamPlans}`}
    email={email} name={name} canReadTeam={canReadTeamPlans} tasks={tasksComplete ? tasks : null}
    selectedWeek={planningWeek} onSelectWeek={setPlanningWeek}
    draftStorage={planningDrafts}
    tasksError={error} onRetryTasks={retryTasks} />;
  if (route.screen === 'cai-dat') return null;
  if (route.screen === 'van-thu') return <RecordsScreen key={JSON.stringify([email, canManageRecords])}
    email={email} canManageRecords={canManageRecords} recordId={route.recordId}
    onSelect={recordId => setRoute({ screen: 'van-thu', recordId })} />;
  if (route.screen === 'cho-duyet') return <>
    <ReviewQueueScreen key={JSON.stringify([email, isAdmin, hasReviewGrant, canReadCash, canReviewCash, canReviewRequests, canManageRecords])}
      cashAccess={{ email, isAdmin, canReadCash, canReviewCash }} hasReviewGrant={hasReviewGrant}
      canReviewRequests={canReviewRequests} canManageRecords={canManageRecords}
      onAssignTaskReviewer={id => setRoute({ screen: 'task-detail', task: { id, direct: true }, backTo: 'cho-duyet' })}
      onOpenCash={id => setRoute({ screen: 'cho-duyet', detail: { kind: 'cash', id } })}
      onOpenRequest={id => setRoute({ screen: 'cho-duyet', detail: { kind: 'request', id } })}
      onOpenRecord={id => setRoute({ screen: 'cho-duyet', detail: { kind: 'record', id } })} />
    {route.detail && <DeferredContent key={`${route.detail.kind}-${route.detail.id}`}>
      {route.detail.kind === 'cash' && <CashScreen
        access={{ email, isAdmin, canReadCash, canReviewCash }} initialCashId={route.detail.id}
        onBackToReview={openReviewQueue} />}
      {route.detail.kind === 'request' && <RequestsScreen
        email={email} name={name} isAdmin={isAdmin} canReviewRequests={canReviewRequests}
        initialRequestId={route.detail.id} onBackToReview={openReviewQueue}
        tasks={tasksComplete ? tasks : null} tasksError={error || sentError} onRetryTasks={retryTasks} />}
      {route.detail.kind === 'record' && <RecordsScreen key={String(canManageRecords)}
        email={email} canManageRecords={canManageRecords} recordId={route.detail.id} onSelect={openReviewQueue}
        onBackToReview={openReviewQueue} />}
    </DeferredContent>}
  </>;
  if (route.screen === 'du-an') return <ProjectsScreen key={`${isAdmin}-${canManageProjects}`} route={route}
    onNavigate={next => setRoute(current => current === route ? next : current)}
    email={email} name={name} isAdmin={isAdmin} canManageProjects={canManageProjects} canReadCash={canReadCash} tasks={tasksComplete ? tasks : null}
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
    if (selected.direct) return <LinkedTaskDetail key={selected.id} id={selected.id} email={email} name={name}
      onBack={onBack} notice={selected.notice} backLabel={backTo === 'cho-duyet' ? 'Phê duyệt' : backTo ? 'Tổng quan' : undefined} />;
    const liveTask = tasks?.find(task => task.id === selected.id);
    if (liveTask && !error) return <TaskDetailScreen key={liveTask.id} liveTask={liveTask} email={email} name={name} onBack={onBack} />;
  }

  const taskPopupId = route.screen === 'cong-viec' ? route.taskPopupId : undefined;
  const popupTask = taskPopupId && !isAdmin && !error ? tasks?.find(task => task.id === taskPopupId) : undefined;

  return <>
    <TasksScreen key={String(isAdmin)} email={email} name={name} isAdmin={isAdmin}
      tasks={tasks} error={error} sentError={sentError} reminderWindow={reminders.window}
      onRetry={retryTasks} options={options} onOptionsChange={setOptions}
      onOpenTask={task => setRoute({ screen: 'cong-viec', taskPopupId: task.id })}
      showAssignment={showAssignment} setShowAssignment={setShowAssignment} onDragChange={onDragChange} />
    {taskPopupId && <DeferredContent key={taskPopupId}>
      <TaskDetailPopup id={taskPopupId} task={popupTask} email={email} name={name}
        onClose={() => setRoute(current =>
          current.screen === 'cong-viec' && current.taskPopupId === taskPopupId ? { screen: 'cong-viec' } : current)} />
    </DeferredContent>}
  </>;
}
