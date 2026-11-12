import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/Button';
import { canAct, cashStatus, displayDate, missingCashApproval, vnd, watchCash } from '../features/cash/cash';
import type { Cash, CashAccess } from '../features/cash/cash';
import { recordActions, recordSortTime, recordStates, watchRecords } from '../features/records/records';
import type { Correspondence } from '../features/records/records';
import { canActOnRequest, watchRequests } from '../features/requests/requests';
import type { StaffRequest } from '../features/requests/requests';
import { formatDue } from '../features/tasks/taskDates';
import { submissionVersion, watchReviewQueue } from '../features/tasks/tasks';
import type { ReviewQueueTasks, Task } from '../features/tasks/tasks';
import { taskAssignmentEnabled } from '../services/firebase/firebase';
import { createThemedStyles, useTheme } from '../theme/theme';
import { ReviewDetailScreen } from './ReviewDetailScreen';
import { useScreenStyles } from '../theme/screenStyles';

const reviewGroups = [
  { key: 'mine', title: 'Chờ tôi duyệt' },
  { key: 'needsReviewer', title: 'Chờ chỉ định người duyệt' },
] as const;

export function ReviewQueueScreen({
  cashAccess, hasReviewGrant, canReviewRequests, onScrollTop, onOpenCash, onOpenRequest, onOpenRecord,
}: {
  cashAccess: CashAccess; hasReviewGrant: boolean; canReviewRequests: boolean; onScrollTop: () => void;
  onOpenCash: (id: string) => void; onOpenRequest: (id: string) => void; onOpenRecord: (id: string) => void;
}) {
  const { email, isAdmin, canReadCash, canReviewCash } = cashAccess;
  const { colors } = useTheme();
  const styles = useStyles();
  const screenStyles = useScreenStyles();
  const [tasks, setTasks] = useState<ReviewQueueTasks | null>(null);
  const [selected, setSelected] = useState<{ task: Task; group: keyof ReviewQueueTasks }>();
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [cash, setCash] = useState<Cash[] | 'error' | null>(null);
  const [cashRetry, setCashRetry] = useState(0);
  const [requests, setRequests] = useState<StaffRequest[] | 'error' | null>(null);
  const [requestRetry, setRequestRetry] = useState(0);
  const [records, setRecords] = useState<Correspondence[] | 'error' | null>(null);
  const [recordRetry, setRecordRetry] = useState(0);

  useEffect(() => {
    return watchReviewQueue(email, isAdmin, hasReviewGrant, setTasks, () => setError(true));
  }, [email, isAdmin, hasReviewGrant, retry]);

  useEffect(() => {
    if (!isAdmin && !canReviewCash) return;
    const access = { email, isAdmin, canReadCash, canReviewCash };
    return watchCash(access, rows => setCash(rows.filter(row =>
      canAct('approve', row, access) || canAct('route', row, access) ||
      (isAdmin && missingCashApproval(row)))), () => setCash('error'));
  }, [email, isAdmin, canReadCash, canReviewCash, cashRetry]);

  useEffect(() => {
    if (!isAdmin && !canReviewRequests) return;
    const access = { email, isAdmin, canReviewRequests };
    return watchRequests(access, rows => setRequests(rows.filter(row =>
      canActOnRequest(row, 'approve', access) || canActOnRequest(row, 'route', access))),
    () => setRequests('error'));
  }, [email, isAdmin, canReviewRequests, requestRetry]);

  useEffect(() => {
    if (!isAdmin) return;
    return watchRecords(email, isAdmin, rows => setRecords(rows.filter(row =>
      row.direction === 'out' && (row.status === 'review' || row.status === 'signing') &&
      recordActions(row, email, isAdmin).length > 0)
      .sort((a, b) => recordSortTime(b, true) - recordSortTime(a, true))), () => setRecords('error'));
  }, [email, isAdmin, recordRetry]);

  function backToQueue() {
    setSelected(undefined);
    onScrollTop();
  }

  if (selected) {
    const live = tasks?.[selected.group]?.find(task => task.id === selected.task.id);
    const active = !!live && submissionVersion(live) === submissionVersion(selected.task);
    return <ReviewDetailScreen key={selected.task.id} task={active ? live : selected.task} active={active}
      needsReviewer={selected.group === 'needsReviewer'}
      onBack={backToQueue}
      onReviewed={() => {
        setTasks(current => current && {
          ...current,
          mine: current.mine.filter(task => task.id !== selected.task.id ||
            submissionVersion(task) !== submissionVersion(selected.task)),
        });
        backToQueue();
      }} />;
  }

  return (
    <View style={screenStyles.stack}>
      <PageHeader title="PHÊ DUYỆT" />
      {error ? (
        <View style={screenStyles.panel}>
          <Text accessibilityRole="alert" style={screenStyles.error}>
            {tasks?.mine.length || tasks?.needsReviewer?.length
              ? 'Một phần danh sách việc chờ duyệt chưa tải được.' : 'Không tải được việc chờ duyệt.'}
          </Text>
          <Button label="Thử lại" secondary onPress={() => {
            setError(false);
            setTasks(null);
            setRetry(value => value + 1);
          }} />
        </View>
      ) : null}
      {reviewGroups.map(({ key, title }) => {
        const rows = tasks?.[key];
        return (
          <View key={key} style={screenStyles.panel}>
            <View style={screenStyles.listHeader}>
              <Text accessibilityRole="header" style={[screenStyles.cardTitle, screenStyles.listHeading]}>{title}</Text>
              {rows ? <Text style={screenStyles.badge}>{rows.length}</Text> : null}
            </View>
            {!rows && !error ? <ActivityIndicator accessibilityLabel={`Đang tải: ${title}`} color={colors.accent} /> : null}
            {rows?.length === 0 && !error ? <Text style={screenStyles.muted}>Không có công việc.</Text> : null}
            {rows?.map(task => (
              <Pressable key={task.id} accessibilityRole="button"
                accessibilityLabel={`${key === 'mine' && taskAssignmentEnabled ? 'Duyệt' : 'Xem'} công việc: ${task.title}`}
                style={({ pressed }) => [styles.card, pressed && screenStyles.dimmed]}
                onPress={() => { setSelected({ task, group: key }); onScrollTop(); }}>
                <Text style={screenStyles.cardTitle} numberOfLines={2}>{task.title}</Text>
                <Text style={screenStyles.muted}>{task.assignee || task.assigneeEmail} · {formatDue(task.due)}</Text>
              </Pressable>
            ))}
          </View>
        );
      })}
      {(isAdmin || canReviewRequests) && <ApprovalSection title="Đơn từ chờ duyệt" rows={requests}
        onRetry={() => { setRequests(null); setRequestRetry(value => value + 1); }} onOpen={onOpenRequest}
        describe={row => ({
          title: row.reason ? `${row.type}: ${row.reason}` : row.type,
          detail: [row.createdBy, displayDate(row.createdAt), row.approverEmail
            ? `Người duyệt: ${row.approverEmail}` : 'Chưa chỉ định người duyệt'].join(' · '),
        })} />}
      {(isAdmin || canReviewCash) && <ApprovalSection title="Thu chi chờ duyệt" rows={Array.isArray(cash)
        ? cash.filter(row => !missingCashApproval(row)) : cash}
        onRetry={() => { setCash(null); setCashRetry(value => value + 1); }} onOpen={onOpenCash}
        describe={row => ({
          title: row.note || (row.type === 'chi' ? 'Khoản chi' : 'Khoản thu'),
          detail: [vnd.format(row.amount), displayDate(row.date), row.approverEmail
            ? `Người duyệt: ${row.approverEmail}` : 'Chưa chỉ định người duyệt'].join(' · '),
        })} />}
      {isAdmin && <ApprovalSection title="Văn thư chờ duyệt hoặc chờ ký" rows={records}
        onRetry={() => { setRecords(null); setRecordRetry(value => value + 1); }} onOpen={onOpenRecord}
        describe={row => ({ title: row.subject || 'Văn bản đi', detail: recordStates[row.status] })} />}
      {isAdmin && <ApprovalSection title="Thu chi cũ thiếu dấu vết duyệt" rows={Array.isArray(cash)
        ? cash.filter(missingCashApproval) : cash}
        onRetry={() => { setCash(null); setCashRetry(value => value + 1); }} onOpen={onOpenCash}
        describe={row => ({
          title: row.note || (row.type === 'chi' ? 'Khoản chi' : 'Khoản thu'),
          detail: `${cashStatus(row)} · ${vnd.format(row.amount)} · ${displayDate(row.date)}`,
        })} />}
    </View>
  );
}

function ApprovalSection<T extends { id: string }>({ title, rows, onRetry, onOpen, describe }: {
  title: string; rows: T[] | 'error' | null; onRetry: () => void; onOpen: (id: string) => void;
  describe: (row: T) => { title: string; detail: string };
}) {
  const { colors } = useTheme();
  const screenStyles = useScreenStyles();
  const styles = useStyles();
  return <View style={screenStyles.panel}>
    <View style={screenStyles.listHeader}>
      <Text accessibilityRole="header" style={[screenStyles.cardTitle, screenStyles.listHeading]}>{title}</Text>
      {Array.isArray(rows) && <Text style={screenStyles.badge}>{rows.length}</Text>}
    </View>
    {rows === null ? <ActivityIndicator accessibilityLabel={`Đang tải: ${title}`} color={colors.accent} />
      : rows === 'error' ? <>
        <Text accessibilityRole="alert" style={screenStyles.error}>Không tải được danh sách.</Text>
        <Button label={`Thử tải lại: ${title}`} secondary onPress={onRetry} />
      </> : rows.length === 0 ? <Text style={screenStyles.muted}>Không có hồ sơ.</Text>
      : rows.map(row => {
        const item = describe(row);
        return <Pressable key={row.id} accessibilityRole="button" accessibilityLabel={`Mở hồ sơ: ${item.title}`}
          style={({ pressed }) => [styles.card, pressed && screenStyles.dimmed]} onPress={() => onOpen(row.id)}>
          <Text style={screenStyles.cardTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={screenStyles.muted}>{item.detail}</Text>
        </Pressable>;
      })}
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  card: { gap: 7, padding: 16, backgroundColor: colors.paper, borderRadius: 14,
    borderColor: colors.line, borderWidth: 1 },
}));
