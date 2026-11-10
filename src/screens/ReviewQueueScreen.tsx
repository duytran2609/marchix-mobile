import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { formatDue } from '../features/tasks/taskDates';
import { submissionVersion, watchReviewQueue } from '../features/tasks/tasks';
import type { ReviewQueueTasks, Task } from '../features/tasks/tasks';
import { taskAssignmentEnabled } from '../services/firebase/firebase';
import { colors } from '../theme/theme';
import { ReviewDetailScreen } from './ReviewDetailScreen';
import { screenStyles } from '../theme/screenStyles';

const reviewGroups = [
  { key: 'mine', title: 'Chờ tôi duyệt' },
  { key: 'needsReviewer', title: 'Chờ chỉ định người duyệt' },
] as const;

export function ReviewQueueScreen({ email, isAdmin, hasReviewGrant, onBack, onScrollTop }: {
  email: string; isAdmin: boolean; hasReviewGrant: boolean; onBack: () => void; onScrollTop: () => void;
}) {
  const [tasks, setTasks] = useState<ReviewQueueTasks | null>(null);
  const [selected, setSelected] = useState<{ task: Task; group: keyof ReviewQueueTasks }>();
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    return watchReviewQueue(email, isAdmin, hasReviewGrant, setTasks, () => setError(true));
  }, [email, isAdmin, hasReviewGrant, retry]);

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
      <View style={screenStyles.listHeader}>
        <Text accessibilityRole="header" style={[screenStyles.heading, screenStyles.listHeading]}>PHÊ DUYỆT</Text>
        <Button label="‹ Công việc" secondary onPress={onBack} />
      </View>
      <Text accessibilityRole="header" style={screenStyles.cardTitle}>Việc chờ duyệt</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 7, padding: 16, backgroundColor: colors.paper, borderRadius: 14,
    borderColor: colors.line, borderWidth: 1 },
});
