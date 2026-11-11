import { signOut } from 'firebase/auth';
import { useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { useToast } from '../components/Toast';
import type { MemberSession } from '../features/auth/useSession';
import { notificationTaskTarget } from '../features/notifications/notifications';
import type { WorkspaceNotification } from '../features/notifications/notifications';
import { WorkspaceDrawer } from '../navigation/WorkspaceDrawer';
import { WorkspaceNavigator } from '../navigation/WorkspaceNavigator';
import { isNativeTab, workspaceTabForLink } from '../navigation/workspaceRoutes';
import type { WorkspaceRoute, WorkspaceTab } from '../navigation/workspaceRoutes';
import { auth } from '../services/firebase/firebase';
import { useScreenStyles } from '../theme/screenStyles';
import { createThemedStyles } from '../theme/theme';
import { workspaceHeaderPadding, WorkspaceHeader } from './WorkspaceHeader';

export function MemberWorkspace({ email, name, photoURL, isAdmin, hasReviewGrant, canReadCash, canReviewCash, canReviewRequests }: Omit<MemberSession, 'kind'>) {
  const styles = useStyles();
  const screenStyles = useScreenStyles();
  const showToast = useToast();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [route, setRoute] = useState<WorkspaceRoute>({ screen: 'tong-quan' });
  const [showAssignment, setShowAssignment] = useState(false);
  const [draggingTask, setDraggingTask] = useState(false);

  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [route]);

  function openWeb(tab: WorkspaceTab) {
    void Linking.openURL(`https://quanly.marchix.vn/#${tab}`).catch(() =>
      showToast('Không mở được trang quản lý Marchix. Vui lòng thử lại.', 'error'));
  }

  function selectTab(tab: WorkspaceTab) {
    setMenuOpen(false);
    if (isNativeTab(tab)) {
      setShowAssignment(false);
      setRoute(current => current.screen === tab ? current : { screen: tab });
    } else {
      openWeb(tab);
    }
  }

  function openNote(note: WorkspaceNotification) {
    const recordId = /^#van-thu\/([A-Za-z0-9-]+)$/.exec(note.link)?.[1];
    if (recordId) {
      setShowAssignment(false);
      setRoute({ screen: 'van-thu', recordId });
      return;
    }
    const task = notificationTaskTarget(note);
    if (!task) {
      selectTab(workspaceTabForLink(note.link));
      return;
    }
    setShowAssignment(false);
    setRoute({ screen: 'task-detail', task: 'id' in task ? { id: task.id, direct: true } : task });
  }

  return (
    <>
      <View style={styles.workspaceHeader}>
        <WorkspaceHeader menuOpen={menuOpen} onOpenMenu={() => setMenuOpen(true)} inbox={{ email, onOpenNote: openNote }} />
      </View>
      <ScrollView ref={scroll} scrollEnabled={!draggingTask} keyboardShouldPersistTaps="handled" contentContainerStyle={screenStyles.scroll}>
        <View style={[screenStyles.page, route.screen === 'cham-cong' && styles.attendancePage,
          route.screen === 'tong-quan' && styles.overviewPage]}>
          <WorkspaceNavigator email={email} name={name} isAdmin={isAdmin} hasReviewGrant={hasReviewGrant}
            canReadCash={canReadCash} canReviewCash={canReviewCash} canReviewRequests={canReviewRequests}
            route={route} setRoute={setRoute}
            showAssignment={showAssignment} setShowAssignment={setShowAssignment} onDragChange={setDraggingTask}
            onScrollTop={() => scroll.current?.scrollTo({ y: 0, animated: false })} />
        </View>
      </ScrollView>
      <WorkspaceDrawer open={menuOpen} activeTab={route.screen === 'task-detail' ? route.backTo ?? 'cong-viec' : route.screen}
        isAdmin={isAdmin} name={name} photoURL={photoURL}
        onClose={() => setMenuOpen(false)} onSelect={selectTab} onLogout={() => signOut(auth)} />
    </>
  );
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  attendancePage: { maxWidth: 1450 },
  overviewPage: { maxWidth: 1000 },
  workspaceHeader: { paddingHorizontal: workspaceHeaderPadding, backgroundColor: colors.paper,
    borderBottomWidth: 1, borderBottomColor: colors.line },
}));
