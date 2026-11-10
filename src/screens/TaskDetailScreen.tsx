import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../components/Button';
import { useToast } from '../components/Toast';
import { formatTaskDate } from '../features/tasks/taskDates';
import { TaskAssignmentForm } from '../features/tasks/TaskAssignmentForm';
import { TaskDiscussion } from '../features/tasks/TaskDiscussion';
import { TaskProgress } from '../features/tasks/TaskProgress';
import {
  commentMaxLength, editableStatus, editableStatuses, listTaskAssignees, parseTaskProgress, reportTaskCompletion,
  saveProgress, setTaskChecklistItem, watchTask,
} from '../features/tasks/tasks';
import type { AssignmentProject, EditableStatus, Task, TaskAssignee } from '../features/tasks/tasks';
import { emulatorMode, pilotMode, taskAssignmentEnabled } from '../services/firebase/firebase';
import { colors } from '../theme/theme';
import { screenStyles } from '../theme/screenStyles';

type TaskDirectory = { members: TaskAssignee[]; projects?: AssignmentProject[] };

function TaskMetadata({ task, assigneeName, members, project }: {
  task: Task; assigneeName?: string; members: Map<string, TaskAssignee>; project?: string;
}) {
  const watchers = Array.isArray(task.watchers) ? task.watchers : [];
  const fields = [
    ['Hạn chót', task.due ? formatTaskDate(task.due) : 'Chưa đặt'],
    ['Mức độ ưu tiên', task.priority || 'Chưa đặt'],
    ['Ngày bắt đầu', task.startDate ? formatTaskDate(task.startDate) : 'Chưa đặt'],
    ['Người thực hiện', assigneeName || task.assignee || task.assigneeEmail || 'Chưa rõ'],
    ['Dự án', project || task.projectId || 'Chung toàn công ty'],
    ['Lặp lại', task.repeat || 'Không lặp'],
    ['Người theo dõi', watchers.map(email => members.get(email)?.name || email).join(', ') || 'Chưa chọn'],
    ['Người duyệt', task.approverEmail ? members.get(task.approverEmail)?.name || task.approverEmail : 'Chưa chỉ định'],
    ['Mốc bàn giao dự án', task.milestone ? 'Có' : 'Không'],
  ];

  return <View style={styles.taskMetadata}>
    {fields.map(([label, value], index) => (
      <View key={label} style={[styles.metadataField, index > 0 && styles.metadataDivider]}>
        <Text style={styles.metadataLabel}>{label}:</Text>
        <Text style={styles.metadataValue}>{value}</Text>
      </View>
    ))}
  </View>;
}

export function TaskDetailScreen({ liveTask, email, name, onBack }: {
  liveTask: Task; email: string; name: string; onBack: () => void;
}) {
  const showToast = useToast();
  const checklist = liveTask.checklist ?? [];
  const checkedCount = checklist.filter(item => item.done === true).length;
  const lockedProgress = checklist.length > 0;
  const isAssignee = liveTask.assigneeEmail === email;
  const canEdit = isAssignee && (!pilotMode || taskAssignmentEnabled) && editableStatus(liveTask.status);
  const canReport = canEdit && (emulatorMode || pilotMode);
  const canEditAssignment = taskAssignmentEnabled && liveTask.assignedBy === email;
  const [assignmentDraft, setAssignmentDraft] = useState<Task>();
  const [savedAssignment, setSavedAssignment] = useState<Task>();
  const [progressBaseline, setProgressBaseline] = useState(liveTask);
  const [progressDraft, setProgressDraft] = useState<{ status?: EditableStatus; progress?: string }>();
  const [savedProgress, setSavedProgress] = useState<{ previousRevision?: string }>();
  const awaitingProgress = savedProgress && savedProgress.previousRevision === liveTask.updatedAt;
  const baselineProgress = String(progressBaseline.progress ?? 0);
  const status = progressDraft?.status ?? (editableStatus(progressBaseline.status) ? progressBaseline.status : 'Chưa làm');
  const progress = progressDraft?.progress ?? (parseTaskProgress(baselineProgress) === undefined ? '' : baselineProgress);
  const previewProgress = canEdit && !lockedProgress && (progressDraft?.progress !== undefined || awaitingProgress)
    ? parseTaskProgress(progress) : undefined;
  const previewStatus = canEdit ? progressDraft?.status ?? (awaitingProgress ? status : undefined) : undefined;
  const [busy, setBusy] = useState<'progress' | 'checklist' | 'report' | null>(null);
  const [reportNote, setReportNote] = useState('');
  const [directory, setDirectory] = useState<TaskDirectory>();
  const needsDirectory = taskAssignmentEnabled && Boolean(liveTask.projectId || liveTask.watchers?.length ||
    liveTask.approverEmail || liveTask.comments?.some(comment => comment.by !== email));
  const members = new Map(directory?.members.map(member => [member.email, member]));
  const project = directory?.projects?.find(item => item.id === liveTask.projectId)?.name;

  useEffect(() => {
    if (!needsDirectory) return;
    let active = true;
    void listTaskAssignees().then(({ data }) => {
      if (active) setDirectory(data);
    }).catch(() => { /* Stored identifiers are available when the directory is unreachable. */ });
    return () => { active = false; };
  }, [needsDirectory]);

  if (savedAssignment && savedAssignment.updatedAt !== liveTask.updatedAt && progressBaseline === savedAssignment) {
    setProgressBaseline(liveTask);
    setProgressDraft(undefined);
  }

  async function save() {
    if (busy || !canEdit) return;
    const value = lockedProgress ? undefined : parseTaskProgress(progress);
    if (!lockedProgress && value === undefined) {
      showToast('Nhập số nguyên từ 0 đến 100.', 'error');
      return;
    }
    setBusy('progress');
    try {
      const baseline = lockedProgress
        ? { ...progressBaseline, updatedAt: liveTask.updatedAt, progress: liveTask.progress }
        : progressBaseline;
      const updated = await saveProgress(baseline, email, status, value);
      setProgressBaseline(updated);
      setProgressDraft(undefined);
      setSavedProgress({ previousRevision: liveTask.updatedAt });
      showToast('Đã lưu tiến độ.');
    } catch (err) {
      showToast(err instanceof Error && !('code' in err)
        ? err.message : 'Chưa lưu được. Kiểm tra kết nối hoặc mở lại công việc rồi thử lại.', 'error');
    } finally {
      setBusy(null);
    }
  }

  async function changeWorkflow(operation: 'checklist' | 'report', update: () => Promise<unknown>) {
    if (busy || !canEdit) return;
    setBusy(operation);
    try {
      await update();
      if (operation === 'report') showToast('Đã gửi công việc để duyệt.');
    } catch (err) {
      const code = err && typeof err === 'object' && 'code' in err ? err.code : null;
        showToast(err instanceof Error && (!code || code === 'functions/failed-precondition')
        ? err.message : 'Chưa cập nhật được công việc. Kiểm tra kết nối rồi thử lại.', 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={screenStyles.stack}>
      <Button label="‹ Danh sách công việc" secondary onPress={onBack} disabled={!!busy} />
      <View style={screenStyles.panel}>
        <View style={styles.taskDetailHeader}>
          <Text style={[screenStyles.eyebrow, styles.grow]}>CHI TIẾT CÔNG VIỆC</Text>
          {canEditAssignment ? <Button label="Chỉnh sửa" secondary disabled={!!busy} onPress={() => {
            setSavedAssignment(undefined);
            setAssignmentDraft(liveTask);
          }} /> : null}
        </View>
        <Text accessibilityRole="header" style={screenStyles.heading}>{liveTask.title}</Text>
        <TaskMetadata task={liveTask} assigneeName={isAssignee ? name : undefined} members={members} project={project} />
        <TaskProgress task={liveTask} previewStatus={previewStatus} previewProgress={previewProgress} />
        {liveTask.note ? <View style={screenStyles.detailRow}>
          <Text style={screenStyles.label}>Mô tả / chỗ vướng</Text>
          <Text style={screenStyles.body}>{liveTask.note}</Text>
        </View> : null}
        {canEdit ? <>
          <Text style={screenStyles.label}>Trạng thái</Text>
          <View style={screenStyles.choices}>
            {editableStatuses.map(value => (
              <Pressable key={value} accessibilityRole="radio"
                accessibilityState={{ checked: value === status, disabled: !!busy }}
                onPress={() => setProgressDraft(draft => ({ ...draft, status: value }))}
                disabled={!!busy}
                style={[screenStyles.choice, value === status && screenStyles.selected]}>
                <Text style={screenStyles.label}>{value}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={screenStyles.label}>Tiến độ (%)</Text>
          {lockedProgress ? <Text style={screenStyles.muted}>{liveTask.progress ?? 0}% · Tự tính theo checklist.</Text>
            : <TextInput accessibilityLabel="Tiến độ (%)" inputMode="numeric" style={screenStyles.input}
                value={progress} editable={!busy} onChangeText={value => {
                  if (value === '' || parseTaskProgress(value) !== undefined) {
                    setProgressDraft(draft => ({ ...draft, progress: value }));
                  }
                }} />}
          <Button label={busy === 'progress' ? 'Đang lưu…' : 'Lưu tiến độ'} onPress={save} disabled={!!busy} />
        </> : null}
      </View>
      {lockedProgress ? (
        <View style={screenStyles.panel}>
          <Text accessibilityRole="header" style={screenStyles.cardTitle}>Việc con</Text>
          <Text accessibilityLiveRegion="polite" style={screenStyles.muted}>{checkedCount}/{checklist.length} đã xong</Text>
          {checklist.map((item, index) => {
            const label = item.t || item.text || '';
            const checked = item.done === true;
            const disabled = !!busy || !canReport;
            return (
              <Pressable key={index} accessibilityRole="checkbox" accessibilityState={{ checked, disabled }}
                aria-checked={checked} aria-disabled={disabled}
                accessibilityLabel={label || `Việc con ${index + 1}`} disabled={disabled}
                style={styles.checklistRow} onPress={() => void changeWorkflow('checklist', () =>
                  setTaskChecklistItem({ taskId: liveTask.id, index, label, done: !checked }))}>
                <View style={[styles.checkbox, checked && screenStyles.selected]}>
                  <Text style={screenStyles.label}>{checked ? '✓' : ''}</Text>
                </View>
                <Text style={[screenStyles.body, styles.grow]}>{label || `Việc con ${index + 1}`}</Text>
              </Pressable>
            );
          })}
          {busy === 'checklist' ? <Text style={screenStyles.muted}>Đang cập nhật checklist…</Text> : null}
        </View>
      ) : null}
      {canReport ? (
        <View style={screenStyles.panel}>
          <Text accessibilityRole="header" style={screenStyles.cardTitle}>Báo hoàn thành</Text>
          {checkedCount < checklist.length
            ? <Text style={screenStyles.muted}>Đánh dấu xong tất cả việc con để gửi duyệt.</Text>
            : <TextInput accessibilityLabel="Kết quả thực hiện" placeholder="Ghi kết quả thực hiện"
                style={[screenStyles.input, screenStyles.messageInput]} multiline maxLength={commentMaxLength}
                value={reportNote} onChangeText={setReportNote} editable={!busy} />}
          <Button label={busy === 'report' ? 'Đang gửi duyệt…' : 'Báo hoàn thành'}
            disabled={!!busy || checkedCount < checklist.length}
            onPress={() => void changeWorkflow('report', () =>
              reportTaskCompletion({ taskId: liveTask.id, note: reportNote }))} />
        </View>
      ) : null}
      {liveTask.rating || liveTask.reviewNote ? (
        <View style={screenStyles.panel}>
          <Text accessibilityRole="header" style={screenStyles.cardTitle}>Kết quả duyệt</Text>
          {liveTask.rating ? <Text style={screenStyles.label}>{liveTask.rating}</Text> : null}
          {liveTask.reviewNote ? <Text style={screenStyles.body}>{liveTask.reviewNote}</Text> : null}
        </View>
      ) : null}
      <TaskDiscussion task={liveTask} email={email} name={name} members={members} />
      {canEditAssignment && assignmentDraft ? <TaskAssignmentForm email={email} task={assignmentDraft}
        onClose={() => setAssignmentDraft(undefined)} onSaved={() => {
          setAssignmentDraft(undefined);
          setProgressBaseline(assignmentDraft);
          setProgressDraft(undefined);
          setSavedProgress(undefined);
          setSavedAssignment(assignmentDraft);
          showToast('Đã lưu thay đổi công việc.');
        }} /> : null}
    </View>
  );
}

export function TaskUnavailable({ onBack }: { onBack: () => void }) {
  return (
    <View style={screenStyles.panel}>
      <Text accessibilityRole="alert" style={screenStyles.error}>Không xác định được công việc hoặc bạn không còn quyền mở.</Text>
      <Button label="Danh sách công việc" secondary onPress={onBack} />
    </View>
  );
}

export function LinkedTaskDetail({ id, email, name, onBack }: { id: string; email: string; name: string; onBack: () => void }) {
  const [task, setTask] = useState<Task | null>();
  useEffect(() => watchTask(id, setTask, () => setTask(null)), [id]);
  if (task === undefined) return <ActivityIndicator accessibilityLabel="Đang tải công việc" color={colors.accent} />;
  if (task === null) return <TaskUnavailable onBack={onBack} />;
  return <TaskDetailScreen liveTask={task} email={email} name={name} onBack={onBack} />;
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  taskDetailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  taskMetadata: { paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.line,
    backgroundColor: colors.surfaceMuted },
  metadataField: { flexDirection: 'row', alignItems: 'baseline', gap: 12, paddingVertical: 9 },
  metadataDivider: { borderTopWidth: 1, borderTopColor: colors.line },
  metadataLabel: { width: '44%', color: colors.ink, fontSize: 15, lineHeight: 21, fontWeight: '700' },
  metadataValue: { flex: 1, minWidth: 0, color: colors.ink, fontSize: 17, lineHeight: 24 },
  checklistRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: { width: 24, height: 24, borderWidth: 1, borderColor: colors.line, borderRadius: 5,
    alignItems: 'center', justifyContent: 'center' },
});
