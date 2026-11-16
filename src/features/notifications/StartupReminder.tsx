import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createThemedStyles } from '../../theme/theme';
import { canAct, cashStatus, watchCash } from '../cash/cash';
import type { CashAccess } from '../cash/cash';
import { canActOnRequest, pendingRequest, watchRequests } from '../requests/requests';
import { todayInVietnam } from '../tasks/taskDates';
import { editableStatus, watchTasks, watchTeamTasks } from '../tasks/tasks';
import type { Task } from '../tasks/tasks';

type ReminderRow = { id: string; text: string; overdue?: boolean };
export function StartupReminder({
  name, email, isAdmin, canReadCash, canReviewCash, canReviewRequests, onClose,
}: CashAccess & { name: string; canReviewRequests: boolean; onClose: () => void }) {
  const styles = useStyles();
  const [rows, setRows] = useState<ReminderRow[] | null>(null);
  const loaded = rows !== null;

  useEffect(() => {
    if (loaded) return;
    const cashAccess = { email, isAdmin, canReadCash, canReviewCash };
    const requestAccess = { email, isAdmin, canReviewRequests };
    let tasks: Task[] | undefined;
    let cash = isAdmin || canReviewCash ? undefined : 0;
    let requests = isAdmin || canReviewRequests ? undefined : 0;

    function publish() {
      if (!tasks || cash === undefined || requests === undefined) return;
      const today = todayInVietnam();
      const open = tasks.filter(task => editableStatus(task.status) && task.due);
      const mine = open.filter(task => task.assigneeEmail === email);
      const dueToday = mine.filter(task => task.due === today);
      const personalOverdue = mine.filter(task => task.due && task.due < today);
      const next: ReminderRow[] = dueToday.slice(0, 3).map(task => ({
        id: `task-${task.id}`, text: `Đến hạn hôm nay: ${task.title}`,
      }));
      if (dueToday.length > 3) {
        next.push({ id: 'more-today', text: `Bạn còn ${dueToday.length - 3} việc đến hạn hôm nay.` });
      }
      if (personalOverdue.length) {
        next.push({ id: 'personal-overdue', overdue: true, text: `Bạn có ${personalOverdue.length} việc quá hạn.` });
      }
      const approvals = [cash ? `${cash} đề nghị thu chi` : '', requests ? `${requests} đơn từ` : ''].filter(Boolean);
      if (approvals.length) {
        next.push({ id: 'approvals', text: `${approvals.join(' và ')} chờ duyệt.` });
      }
      if (isAdmin) {
        const teamOverdue = open.filter(task => task.assigneeEmail && task.assigneeEmail !== email && task.due && task.due < today);
        if (teamOverdue.length) {
          const names = [...new Set(teamOverdue.map(task => task.assignee?.trim()).filter(Boolean))];
          const people = names.length ? ` (${names.slice(0, 3).join(', ')}${names.length > 3 ? ', …' : ''})` : '';
          next.push({ id: 'team-overdue', overdue: true, text: `Nhân viên đang có ${teamOverdue.length} việc quá hạn${people}.` });
        }
      }
      setRows(next);
    }

    function receiveTasks(items: Task[]) {
      tasks = items;
      publish();
    }
    const stopTasks = isAdmin
      ? watchTeamTasks(receiveTasks, () => receiveTasks([]))
      : watchTasks(email, (items, complete) => { if (complete) receiveTasks(items); },
        () => receiveTasks([]), () => {});
    const stopCash = cash === undefined ? watchCash(cashAccess, items => {
      cash = items.filter(row => isAdmin ? cashStatus(row) === 'Chờ duyệt' : canAct('approve', row, cashAccess)).length;
      publish();
    }, () => { cash = 0; publish(); }) : undefined;
    const stopRequests = requests === undefined ? watchRequests(requestAccess, items => {
      requests = items.filter(row => isAdmin ? row.status === pendingRequest : canActOnRequest(row, 'approve', requestAccess)).length;
      publish();
    }, () => { requests = 0; publish(); }) : undefined;
    return () => { stopTasks(); stopCash?.(); stopRequests?.(); };
  }, [email, isAdmin, canReadCash, canReviewCash, canReviewRequests, loaded]);

  useEffect(() => {
    if (rows?.length === 0) onClose();
  }, [rows, onClose]);

  if (!rows?.length) return null;
  const title = `Chào ${name} — cần chú ý hôm nay`;
  return <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
    <SafeAreaView style={styles.overlay}>
      <View role="dialog" accessibilityLabel={title} accessibilityViewIsModal style={styles.panel}>
        <Text accessibilityRole="header" style={styles.title}>{title}</Text>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.messages}>
          {rows.map(row => <View key={row.id} style={[styles.row, row.overdue && styles.overdue]}>
            <Text aria-hidden style={row.overdue ? styles.dangerIcon : styles.warningIcon}>
              {row.overdue ? '●' : '▲'}
            </Text>
            <Text style={styles.message}>{row.text}</Text>
          </View>)}
        </ScrollView>
        <Pressable accessibilityRole="button" onPress={onClose}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
          <Text style={styles.buttonLabel}>Đã xem</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  </Modal>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12,
    backgroundColor: 'rgba(33, 25, 53, 0.45)' },
  panel: { width: '100%', maxWidth: 448, maxHeight: '95%', flexShrink: 1, padding: 15, gap: 12,
    borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  title: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  scroll: { flexShrink: 1, minHeight: 0 },
  messages: { gap: 4 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 8,
    borderRadius: 8, backgroundColor: colors.warningSoft },
  overdue: { backgroundColor: colors.dangerSoft },
  warningIcon: { color: colors.warning, fontSize: 13, lineHeight: 18 },
  dangerIcon: { color: colors.danger, fontSize: 13, lineHeight: 18 },
  message: { flex: 1, color: colors.ink, fontSize: 13, lineHeight: 18 },
  button: { alignSelf: 'flex-end', justifyContent: 'center', paddingHorizontal: 12, minHeight: 44,
    borderWidth: 1, borderColor: colors.line, borderRadius: 8 },
  buttonLabel: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  pressed: { backgroundColor: colors.surfaceMuted },
}));
