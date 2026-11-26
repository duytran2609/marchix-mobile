import { signOut } from 'firebase/auth';
import { lazy, useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { KeyboardScrollView } from '../components/KeyboardScrollView';
import { DeferredContent } from '../components/DeferredContent';
import { useToast } from '../components/Toast';
import { watchMemberAvatar } from '../features/auth/memberAvatar';
import type { MemberSession } from '../features/auth/useSession';
import { notificationTaskTarget } from '../features/notifications/notifications';
import type { WorkspaceNotification } from '../features/notifications/notifications';
import { StartupReminder } from '../features/notifications/StartupReminder';
import { useWorkspacePush } from '../features/notifications/workspacePush';
import { useReminderSettings } from '../features/settings/reminderSettings';
import { useWorkspaceTasks } from '../features/tasks/useWorkspaceTasks';
import { WorkspaceDrawer } from '../navigation/WorkspaceDrawer';
import { WorkspaceBottomNav } from '../navigation/WorkspaceBottomNav';
import { WorkspaceNavigator } from '../navigation/WorkspaceNavigator';
import { maxPinnedTabs, usePinnedTabs, usePinningEnabled } from '../navigation/usePinnedTabs';
import type { PinnableTab } from '../navigation/usePinnedTabs';
import { workflowRouteForLink, workspaceTabForLink } from '../navigation/workspaceRoutes';
import type { WorkspaceRoute, WorkspaceTab } from '../navigation/workspaceRoutes';
import { auth } from '../services/firebase/firebase';
import { useScreenStyles } from '../theme/screenStyles';
import { createThemedStyles } from '../theme/theme';
import { workspaceHeaderPadding, WorkspaceHeader } from './WorkspaceHeader';

const SettingsScreen = lazy(() => import('../screens/SettingsScreen').then(module => ({ default: module.SettingsScreen })));

export function MemberWorkspace({ email, name, photoURL, isAdmin, hasReviewGrant, canReadCash, canReviewCash, canReviewRequests,
  canManageProjects, canReadTeamPlans, canReadTeamKpi, canManageRecords, accountCreatedAt,
  showLoginReminder, onDismissLoginReminder }: Omit<MemberSession, 'kind'> & {
  showLoginReminder: boolean;
  onDismissLoginReminder: () => void;
}) {
  const styles = useStyles();
  const screenStyles = useScreenStyles();
  const showToast = useToast();
  const reminders = useReminderSettings(email);
  const taskFeed = useWorkspaceTasks(email);
  const pinnedTabs = usePinnedTabs(email);
  const pinning = usePinningEnabled(email);
  const pinningEnabled = pinning.ready && pinning.value;
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [route, setRoute] = useState<WorkspaceRoute>({ screen: 'tong-quan' });
  const [showAssignment, setShowAssignment] = useState(false);
  const [draggingTask, setDraggingTask] = useState(false);
  const [customAvatar, setCustomAvatar] = useState<string | null>(null);
  const avatar = customAvatar ?? photoURL;
  const unregisterPush = useWorkspacePush(email, openNote);
  const activeTab = route.screen === 'task-detail' ? route.backTo ?? 'cong-viec' : route.screen;

  useEffect(() => watchMemberAvatar(email, setCustomAvatar), [email]);

  const scrollRoute = route.screen === 'cho-duyet' || route.screen === 'cong-viec' || route.screen === 'cham-cong'
    ? route.screen : route;
  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [scrollRoute]);

  function selectTab(tab: WorkspaceTab | 'ca-nhan') {
    setMenuOpen(false);
    setShowAssignment(false);
    setRoute(current => current.screen === tab ? current : { screen: tab });
  }

  function checkInFromReminder(date: string) {
    setMenuOpen(false);
    setShowAssignment(false);
    setRoute({ screen: 'cham-cong', checkInDate: date });
    onDismissLoginReminder();
  }

  function togglePin(tab: PinnableTab) {
    if (!pinningEnabled || !pinnedTabs.ready) return;
    const pins = pinnedTabs.value;
    const pinned = pins.includes(tab);
    if (!pinned && pins.length >= maxPinnedTabs) {
      showToast('Chỉ ghim được tối đa 3 tab. Bỏ ghim một tab để thêm tab khác.', 'neutral');
      return;
    }
    const next = pinned ? pins.filter(item => item !== tab) : [...pins, tab];
    void pinnedTabs.save(next).catch(() => showToast('Chưa lưu được thay đổi ghim. Vui lòng thử lại.', 'error'));
  }

  function openNote(note: WorkspaceNotification) {
    setMenuOpen(false);
    const workflow = workflowRouteForLink(note.link);
    if (workflow) {
      setShowAssignment(false);
      setRoute(workflow);
      return;
    }
    const recordId = /^#van-thu\/([A-Za-z0-9-]+)$/.exec(note.link)?.[1];
    if (recordId) {
      setShowAssignment(false);
      setRoute({ screen: 'van-thu', recordId });
      return;
    }
    if (note.link === '#du-an' && note.title === 'Bạn được nhắc trong dự án') {
      if (!note.projectId) {
        showToast('Thông báo cũ chưa có mã dự án. Vui lòng chọn dự án cần xem trong mục Dự án.', 'error');
        return;
      }
      setShowAssignment(false);
      setRoute({ screen: 'du-an', projectId: note.projectId, section: 'discussion' });
      return;
    }
    const task = notificationTaskTarget(note);
    if (!task) {
      selectTab(workspaceTabForLink(note.link));
      return;
    }
    setShowAssignment(false);
    setRoute({ screen: 'task-detail',
      task: 'id' in task ? { id: task.id, direct: true, notice: { title: note.title, body: note.body } } : task });
  }

  async function logout() {
    setMenuOpen(false);
    await unregisterPush();
    await signOut(auth);
  }

  return (
    <>
      <View style={styles.workspaceHeader}>
        <WorkspaceHeader menuOpen={menuOpen} onOpenMenu={() => setMenuOpen(true)}
          inbox={{ email, onOpenNote: openNote, reminderWindow: reminders.window,
            tasks: taskFeed.tasksComplete && !taskFeed.error ? taskFeed.tasks : null }} />
      </View>
      <KeyboardScrollView ref={scroll} scrollEnabled={!draggingTask} keyboardShouldPersistTaps="handled"
        style={route.screen === 'cai-dat' && styles.hidden} contentContainerStyle={screenStyles.scroll}>
        <View style={[screenStyles.page, route.screen === 'cham-cong' && styles.attendancePage,
          route.screen === 'tong-quan' && styles.overviewPage]}>
          <DeferredContent><WorkspaceNavigator email={email} name={name} photoURL={avatar} isAdmin={isAdmin} hasReviewGrant={hasReviewGrant}
            accountCreatedAt={accountCreatedAt}
            canReadCash={canReadCash} canReviewCash={canReviewCash} canReviewRequests={canReviewRequests}
            canManageProjects={canManageProjects} canReadTeamPlans={canReadTeamPlans}
            canReadTeamKpi={canReadTeamKpi} canManageRecords={canManageRecords}
            route={route} setRoute={setRoute} reminders={reminders} taskFeed={taskFeed}
            showAssignment={showAssignment} setShowAssignment={setShowAssignment} onDragChange={setDraggingTask}
            onScrollTop={() => scroll.current?.scrollTo({ y: 0, animated: false })} /></DeferredContent>
        </View>
      </KeyboardScrollView>
      {route.screen === 'cai-dat' && <DeferredContent><SettingsScreen key={String(isAdmin)} reminders={reminders}
        pinning={pinning} isAdmin={isAdmin} email={email} /></DeferredContent>}
      {pinningEnabled && (
        <WorkspaceBottomNav pins={pinnedTabs.value} activeTab={activeTab} isAdmin={isAdmin} onSelect={selectTab} />
      )}
      <WorkspaceDrawer open={menuOpen} activeTab={activeTab}
        isAdmin={isAdmin} name={name} photoURL={avatar}
        pins={pinnedTabs.value} onTogglePin={pinningEnabled && pinnedTabs.ready ? togglePin : undefined}
        onClose={() => setMenuOpen(false)} onSelect={selectTab} onLogout={logout} />
      {showLoginReminder && <StartupReminder key={JSON.stringify([isAdmin, canReadCash, canReviewCash, canReviewRequests])}
        email={email} name={name} isAdmin={isAdmin} canReadCash={canReadCash} canReviewCash={canReviewCash}
        canReviewRequests={canReviewRequests} onClose={onDismissLoginReminder} onCheckIn={checkInFromReminder} />}
    </>
  );
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  attendancePage: { maxWidth: 1450 },
  overviewPage: { maxWidth: 1000 },
  hidden: { display: 'none' },
  workspaceHeader: { paddingHorizontal: workspaceHeaderPadding, backgroundColor: colors.paper,
    borderBottomWidth: 1, borderBottomColor: colors.line },
}));
