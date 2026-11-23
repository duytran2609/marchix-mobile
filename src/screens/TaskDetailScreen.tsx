import { useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { EmptyState } from '../components/EmptyState';
import { TextInput } from '../components/TextInput';
import { NumberStepper } from '../components/NumberStepper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { doc, onSnapshot } from 'firebase/firestore';
import { KeyboardScrollView } from '../components/KeyboardScrollView';
import { KeyboardViewport } from '../components/KeyboardViewport';
import { Button } from '../components/Button';
import { ChoiceButtons } from '../components/ChoiceButtons';
import { FieldLabel } from '../components/FieldLabel';
import { PeopleSummary } from '../components/PeopleSummary';
import { PopupCloseButton } from '../components/PopupCloseButton';
import { SegmentedButtons } from '../components/SegmentedButtons';
import { ToastLayer, useToast } from '../components/Toast';
import { formatTaskDate } from '../features/tasks/taskDates';
import { taskUnsetLabel } from '../features/tasks/taskLabels';
import { TaskAssignmentForm } from '../features/tasks/TaskAssignmentForm';
import { TaskDiscussion } from '../features/tasks/TaskDiscussion';
import { TaskPriority } from '../features/tasks/TaskPriority';
import { statusTone, TaskProgress } from '../features/tasks/TaskProgress';
import { checklistWeight } from '../features/tasks/checklistProgress';
import {
  commentMaxLength, editableStatus, editableStatuses, listTaskAssignees, parseTaskProgress, remindTask, reportTaskCompletion,
  saveProgress, setTaskChecklistItem, taskCompletionModes, watchTask,
} from '../features/tasks/tasks';
import type { AssignmentProject, EditableStatus, Task, TaskAssignee } from '../features/tasks/tasks';
import { auth, db, emulatorMode, pilotMode, taskAssignmentEnabled } from '../services/firebase/firebase';
import { createThemedStyles, useTheme } from '../theme/theme';
import { useInformationStyles, useScreenStyles } from '../theme/screenStyles';

type TaskDirectory = { members: TaskAssignee[]; projects?: AssignmentProject[] };
const detailTabs = [
  { value: 'general', label: 'Chung' },
  { value: 'description', label: 'Mô tả' },
  { value: 'discussion', label: 'Trao đổi & tài liệu' },
] as const;

function TaskMetadata({ task, email, name, members, project }: {
  task: Task; email: string; name: string; members: Map<string, TaskAssignee>; project?: string;
}) {
  const styles = useStyles();
  const information = useInformationStyles();
  const textStyles = useScreenStyles();
  const personNameStyle = [styles.metadataName, textStyles.metadataValue];
  const watchers = Array.isArray(task.watchers) ? task.watchers : [];
  const assignee = task.assignee?.trim();
  const assigner = task.assignedBy?.trim();

  function person(personEmail: string, storedName?: string) {
    const member = members.get(personEmail);
    const self = personEmail === email;
    const displayName = (self && name.trim()) || storedName || member?.name?.trim() || personEmail;
    const photoURL = member?.photoURL || (self ? auth.currentUser?.photoURL : undefined);
    return { id: personEmail || displayName, name: displayName, photoURL };
  }

  const fields = [
    ['Hạng mục', task.category?.trim() || taskUnsetLabel],
    ['Người giao việc', assigner
      ? <PeopleSummary wrap wrapAlignEnd people={[person(assigner)]} textStyle={personNameStyle} /> : taskUnsetLabel],
    ['Người thực hiện', task.assigneeEmail || assignee
      ? <PeopleSummary wrap wrapAlignEnd people={[person(task.assigneeEmail, assignee)]} textStyle={personNameStyle} /> : taskUnsetLabel],
    ['Người duyệt', task.approverEmail
      ? <PeopleSummary wrap wrapAlignEnd people={[person(task.approverEmail)]} textStyle={personNameStyle} /> : taskUnsetLabel],
    ['Người theo dõi', watchers.length
      ? <PeopleSummary wrap wrapAlignEnd people={watchers.map(personEmail => person(personEmail))} textStyle={personNameStyle} /> : taskUnsetLabel],
    ['Dự án', project || (task.projectId === '' ? 'Chung toàn công ty' : task.projectId || taskUnsetLabel)],
    ['Ngày bắt đầu', task.startDate ? formatTaskDate(task.startDate) : taskUnsetLabel],
    ['Hạn chót', task.due ? formatTaskDate(task.due) : taskUnsetLabel],
    ['Mức độ ưu tiên', <Text style={information.value}><TaskPriority priority={task.priority} colored /></Text>],
    ['Chế độ hoàn thành', typeof task.requireReview === 'boolean' ? taskCompletionModes[task.requireReview ? 1 : 0].label : taskUnsetLabel],
    ['Lặp lại', task.repeat || taskUnsetLabel],
    ['Mốc bàn giao dự án', typeof task.milestone === 'boolean' ? (task.milestone ? 'Có' : 'Không') : taskUnsetLabel],
  ] as const;

  return <View style={information.panel}>
    {fields.map(([label, value], index) => (
      <View key={label} style={[information.row, index > 0 && information.divider]}>
        <Text style={information.label}>{label}</Text>
        {typeof value === 'string' ? <Text style={[information.value, value === taskUnsetLabel && textStyles.unsetValue]}>{value}</Text> : value}
      </View>
    ))}
  </View>;
}

export function TaskDetailScreen({ liveTask, email, name, onBack, backLabel = 'Danh sách công việc' }: {
  liveTask: Task; email: string; name: string; onBack?: () => void; backLabel?: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const screenStyles = useScreenStyles();
  const information = useInformationStyles();
  const showToast = useToast();
  const [tab, setTab] = useState<typeof detailTabs[number]['value']>('general');
  const [generalHeight, setGeneralHeight] = useState<number>();
  const scroll = useRef<ComponentRef<typeof KeyboardScrollView>>(null);
  const inPopup = !onBack;
  const isGeneral = tab === 'general';
  const checklist = liveTask.checklist ?? [];
  const checkedCount = checklist.filter(item => item.done === true).length;
  const lockedProgress = checklist.length > 0;
  const isAssignee = liveTask.assigneeEmail === email;
  const canEdit = isAssignee && (!pilotMode || taskAssignmentEnabled) && editableStatus(liveTask.status);
  const canReport = canEdit && (emulatorMode || pilotMode);
  const reportBlockReason = lockedProgress
    ? checkedCount < checklist.length && 'Đánh dấu xong tất cả việc con để báo hoàn thành.'
    : liveTask.progress !== 100 && 'Đặt và lưu tiến độ 100% để báo hoàn thành.';
  const canEditAssignment = taskAssignmentEnabled && liveTask.status !== 'Xong' && liveTask.assignedBy === email;
  const canRemind = canEditAssignment && editableStatus(liveTask.status) &&
    !!liveTask.assigneeEmail && !isAssignee;
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
  const [busy, setBusy] = useState<'progress' | 'checklist' | 'report' | 'reminder' | null>(null);
  const [reminded, setReminded] = useState<{ taskId: string; assigneeEmail: string }>();
  const reminderSent = reminded?.taskId === liveTask.id && reminded.assigneeEmail === liveTask.assigneeEmail;
  const [reportNote, setReportNote] = useState('');
  const [reportNoteRequired, setReportNoteRequired] = useState(false);
  const [directory, setDirectory] = useState<TaskDirectory>();
  const needsDirectory = taskAssignmentEnabled && Boolean(liveTask.assignedBy || liveTask.assigneeEmail || liveTask.projectId || liveTask.watchers?.length ||
    liveTask.approverEmail || liveTask.comments?.some(comment => comment.by !== email));
  const members = new Map(directory?.members.map(member => [member.email, member]));
  const project = directory?.projects?.find(item => item.id === liveTask.projectId)?.name;

  useEffect(() => {
    if (!canReport) return;
    return onSnapshot(doc(db, 'settings', 'work'),
      snapshot => setReportNoteRequired(snapshot.get('requireReportNote') === true),
      () => setReportNoteRequired(false));
  }, [canReport]);

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
      if (operation === 'report') showToast('Đã ghi nhận báo hoàn thành.');
    } catch (err) {
      const code = err && typeof err === 'object' && 'code' in err ? err.code : null;
        showToast(err instanceof Error && (!code || code === 'functions/failed-precondition')
        ? err.message : 'Chưa cập nhật được công việc. Kiểm tra kết nối rồi thử lại.', 'error');
    } finally {
      setBusy(null);
    }
  }

  async function sendReminder() {
    if (busy || !canRemind || reminderSent) return;
    const { id: taskId, assigneeEmail, remindedAt } = liveTask;
    setBusy('reminder');
    try {
      await remindTask({ taskId, assigneeEmail, previousReminder: remindedAt ?? null });
      setReminded({ taskId, assigneeEmail });
      showToast('Đã tạo thông báo. Email chờ lịch gửi.');
    } catch (err) {
      showToast(err instanceof Error && 'code' in err && err.code === 'functions/failed-precondition'
        ? err.message : 'Chưa tạo được thông báo nhắc việc. Vui lòng thử lại.', 'error');
    } finally {
      setBusy(null);
    }
  }

  const header = <>
    {(onBack || canEditAssignment) && <View style={styles.taskDetailHeader}>
      {onBack && <Text style={[screenStyles.eyebrow, styles.grow]}>CHI TIẾT CÔNG VIỆC</Text>}
      {canEditAssignment ? <Button label="Chỉnh sửa" secondary disabled={!!busy} onPress={() => {
        setSavedAssignment(undefined);
        setAssignmentDraft(liveTask);
      }} /> : null}
    </View>}
    <Text accessibilityRole="header" style={screenStyles.heading}>{liveTask.title}</Text>
    <SegmentedButtons label="Chi tiết công việc" choices={detailTabs} value={tab} onChange={next => {
      if (next !== tab) scroll.current?.scrollTo({ y: 0, animated: false });
      setTab(next);
    }} />
  </>;
  const description = tab === 'description' && <View style={screenStyles.stack}>
    <Text accessibilityRole="header" style={[screenStyles.cardTitle, screenStyles.metadataLabel]}>Mô tả / Yêu cầu bàn giao</Text>
    <View style={[information.panel, styles.taskNote]}>
      {liveTask.note ? <Text selectable style={[screenStyles.body, screenStyles.metadataValue]}>{liveTask.note}</Text>
        : <EmptyState icon="note" message={taskUnsetLabel} />}
    </View>
  </View>;
  const general = isGeneral && <>
    <TaskMetadata task={liveTask} email={email} name={name} members={members} project={project} />
    <TaskProgress task={liveTask} previewStatus={previewStatus} previewProgress={previewProgress} variant="detail" />
    {canRemind && <Button secondary
      label={busy === 'reminder' ? 'Đang tạo thông báo…' : reminderSent ? 'Đã nhắc việc' : 'Nhắc việc'}
      disabled={!!busy || reminderSent} onPress={() => void sendReminder()} />}
    {canEdit ? <>
      <Text style={screenStyles.label}>Trạng thái</Text>
      <ChoiceButtons label="Trạng thái" items={editableStatuses.map(value => ({
        value, label: value, tone: statusTone(value, colors),
      }))} value={status} disabled={!!busy} onChange={value => setProgressDraft(draft => ({ ...draft, status: value }))} />
      {!lockedProgress && <>
        <FieldLabel style={screenStyles.label} required>Tiến độ (%)</FieldLabel>
        <NumberStepper accessibilityLabel="Tiến độ (%)" inputMode="numeric" style={screenStyles.input} max={100}
            value={progress} editable={!busy} onChangeText={value => {
              if (value === '' || parseTaskProgress(value) !== undefined) {
                setProgressDraft(draft => ({ ...draft, progress: value }));
              }
            }} />
      </>}
      <Button label={busy === 'progress' ? 'Đang lưu…' : 'Lưu tiến độ'} onPress={save} disabled={!!busy} />
    </> : null}
  </>;
  const generalActions = isGeneral && <>
    {lockedProgress ? (
      <View style={screenStyles.panel}>
        <View style={styles.taskDetailHeader}>
          <Text accessibilityRole="header" style={screenStyles.cardTitle}>Việc con</Text>
          <Text accessibilityLiveRegion="polite" style={screenStyles.muted}>{checkedCount}/{checklist.length} đã xong</Text>
        </View>
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
              <Text style={[screenStyles.muted, screenStyles.metadataValue]}>
                <Text style={screenStyles.metadataLabel}>Khối lượng: </Text>{checklistWeight(item.weight)}
              </Text>
            </Pressable>
          );
        })}
        {busy === 'checklist' ? <Text style={screenStyles.muted}>Đang cập nhật checklist…</Text> : null}
      </View>
    ) : null}
    {canReport ? (
      <View style={screenStyles.panel}>
        <Text accessibilityRole="header" style={screenStyles.cardTitle}>Báo hoàn thành</Text>
        {reportBlockReason
          ? <Text style={screenStyles.muted}>{reportBlockReason}</Text>
          : <>
            <FieldLabel style={screenStyles.label} required={reportNoteRequired}>Kết quả thực hiện</FieldLabel>
            <TextInput accessibilityLabel="Kết quả thực hiện" placeholder="Ghi kết quả thực hiện"
              style={[screenStyles.input, screenStyles.messageInput]} multiline maxLength={commentMaxLength}
              value={reportNote} onChangeText={setReportNote} editable={!busy} />
          </>}
        <Button label={busy === 'report' ? 'Đang lưu…' : 'Báo hoàn thành'}
          disabled={!!busy || !!reportBlockReason}
          onPress={() => void changeWorkflow('report', () =>
            reportTaskCompletion({ taskId: liveTask.id, note: reportNote }))} />
      </View>
    ) : null}
    {liveTask.rating || liveTask.reviewNote ? (
      <View style={screenStyles.panel}>
        <Text accessibilityRole="header" style={screenStyles.cardTitle}>Kết quả duyệt</Text>
        {liveTask.rating ? <Text style={[screenStyles.body, screenStyles.metadataValue]}>{liveTask.rating}</Text> : null}
        {liveTask.reviewNote ? <Text style={[screenStyles.body, screenStyles.metadataValue]}>{liveTask.reviewNote}</Text> : null}
      </View>
    ) : null}
  </>;
  const discussion = <View style={[screenStyles.stack, tab !== 'discussion' && styles.hidden]}>
    <Text accessibilityRole="header" style={screenStyles.cardTitle}>Trao đổi</Text>
    <TaskDiscussion task={liveTask} email={email} name={name} members={members} />
  </View>;

  return (
    <View style={inPopup ? styles.popupBody : screenStyles.stack}>
      {inPopup ? <>
        <View style={[styles.popupSection, styles.popupTabs]}>{header}</View>
        <KeyboardScrollView ref={scroll} testID="task-detail-scroll"
          style={[styles.popupScroll, !isGeneral && { maxHeight: generalHeight }]}
          contentContainerStyle={[screenStyles.stack, styles.popupScrollContent]}
          onContentSizeChange={isGeneral ? (_, height) => setGeneralHeight(height) : undefined}
          keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
          {general && <View style={styles.popupSection}>{general}</View>}
          {generalActions}
          {description}
          {discussion}
        </KeyboardScrollView>
      </> : <>
        <Button label={`‹ ${backLabel}`} secondary onPress={onBack} disabled={!!busy} />
        <View style={screenStyles.panel}>
          {header}
          {general}
          {description}
        </View>
        {generalActions}
        {discussion}
      </>}
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

export function TaskUnavailable({ onBack, backLabel = 'Danh sách công việc' }: { onBack?: () => void; backLabel?: string }) {
  const screenStyles = useScreenStyles();
  return (
    <View style={screenStyles.panel}>
      <Text accessibilityRole="alert" style={screenStyles.error}>Không xác định được công việc hoặc bạn không còn quyền mở.</Text>
      {onBack && <Button label={backLabel} secondary onPress={onBack} />}
    </View>
  );
}

export function LinkedTaskDetail({ id, email, name, onBack, backLabel }: {
  id: string; email: string; name: string; onBack?: () => void; backLabel?: string;
}) {
  const { colors } = useTheme();
  const [task, setTask] = useState<Task | null>();
  useEffect(() => watchTask(id, setTask, () => setTask(null)), [id]);
  if (task === undefined) return <ActivityIndicator accessibilityLabel="Đang tải công việc" color={colors.accent} />;
  if (task === null) return <TaskUnavailable onBack={onBack} backLabel={backLabel} />;
  return <TaskDetailScreen liveTask={task} email={email} name={name} onBack={onBack} backLabel={backLabel} />;
}

export function TaskDetailPopup({ id, task, email, name, onClose }: {
  id: string; task?: Task; email: string; name: string; onClose: () => void;
}) {
  const styles = useStyles();
  const screenStyles = useScreenStyles();
  return <Modal transparent visible onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
    <SafeAreaView style={styles.popupOverlay}>
      <KeyboardViewport style={styles.popupCenter}>
        <View role="dialog" accessibilityLabel="Chi tiết công việc" accessibilityViewIsModal style={styles.popup}>
          <View style={styles.popupHeader}>
            <Text style={screenStyles.cardTitle}>Chi tiết công việc</Text>
            <PopupCloseButton label="Đóng chi tiết công việc" onPress={onClose} />
          </View>
          {task ? <TaskDetailScreen liveTask={task} email={email} name={name} />
            : <LinkedTaskDetail id={id} email={email} name={name} />}
        </View>
      </KeyboardViewport>
      <ToastLayer safeAreaApplied />
    </SafeAreaView>
  </Modal>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  grow: { flex: 1 },
  popupOverlay: { flex: 1, backgroundColor: 'rgba(33, 25, 53, 0.45)' },
  popupCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 12 },
  popup: { width: '100%', maxWidth: 560, flexShrink: 1, overflow: 'hidden', borderRadius: 16, backgroundColor: colors.paper },
  popupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.line },
  popupBody: { flexShrink: 1, minHeight: 0, paddingTop: 16, gap: 14 },
  popupTabs: { marginHorizontal: 16, flexShrink: 0 },
  popupSection: { gap: 14 },
  popupScroll: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  popupScrollContent: { paddingHorizontal: 16, paddingBottom: 16 },
  taskDetailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  taskNote: { paddingVertical: 20 },
  hidden: { display: 'none' },
  metadataName: { fontSize: 15, lineHeight: 22, textAlign: 'right' },
  checklistRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: { width: 24, height: 24, borderWidth: 1, borderColor: colors.line, borderRadius: 5,
    alignItems: 'center', justifyContent: 'center' },
}));
