import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { TextInput } from '../../components/TextInput';
import { NumberStepper } from '../../components/NumberStepper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { doc, onSnapshot } from 'firebase/firestore';
import { AttachmentLabel } from '../../components/AttachmentLabel';
import { AttachmentPreview } from '../../components/AttachmentPreview';
import { KeyboardScrollView } from '../../components/KeyboardScrollView';
import { KeyboardViewport } from '../../components/KeyboardViewport';
import { DateCalendarButton, DateCalendarField } from './CalendarDialog';
import { priorityTone } from './TaskPriority';
import { statusTone } from './TaskProgress';
import { editableStatuses, taskStatus } from './taskStatuses';
import { taskUnsetLabel } from './taskLabels';
import { shiftDay, todayInVietnam } from './taskDates';
import { checklistWeight, maxChecklistWeight, validChecklistWeight } from './checklistProgress';
import { auth, db, emulatorMode } from '../../services/firebase/firebase';
import { SearchableChoiceDropdown } from '../../components/SearchableChoiceList';
import { Button } from '../../components/Button';
import { SegmentedButtons } from '../../components/SegmentedButtons';
import { FieldLabel } from '../../components/FieldLabel';
import { ChoiceButtons as Choices } from '../../components/ChoiceButtons';
import { Dropdown } from '../../components/Dropdown';
import { DeleteIconButton } from '../../components/DeleteIconButton';
import { FilePickerButton } from '../../components/FilePickerButton';
import { PopupCloseButton } from '../../components/PopupCloseButton';
import { attachmentLimit, formatFileSize, pickTaskAttachments, readTaskAttachment, readTaskAttachments } from './taskAttachments';
import type { PickedAttachment } from './taskAttachments';
import {
  createTask, editableStatus, getAssignmentComment, listTaskAssignees, newTaskId, parseTaskProgress,
  taskCategoryMaxLength, taskCompletionModes, taskPriorities, taskRepeatOptions, taskTitleMaxLength, updateTask,
} from './tasks';
import type { AssignmentOptions, AssignmentProject, Task, TaskAssignee, TaskAttachment } from './tasks';
import { createThemedStyles, metadataValueStyle, useTheme } from '../../theme/theme';
import { useScreenStyles } from '../../theme/screenStyles';
import { ToastLayer, useToast } from '../../components/Toast';
import type { AttachmentFile } from '../../utils/attachmentFile';

const quickDates = [
  { label: 'Hôm nay', days: 0 }, { label: 'Ngày mai', days: 1 }, { label: 'Sau 7 ngày', days: 7 },
];
const initialOptions: AssignmentOptions = {
  priority: 'Trung bình', status: 'Chưa làm', repeat: 'Không lặp', projectId: '', milestone: false,
};

function functionError(error: unknown, fallback: string) {
  const code = error instanceof Error && 'code' in error ? error.code : '';
  return error instanceof Error && (!code || [
    'functions/failed-precondition', 'functions/permission-denied',
    'functions/invalid-argument', 'functions/already-exists',
  ].includes(String(code))) ? error.message : fallback;
}

function MemberPicker({ members, selected, email, disabled, title, label, emptyMessage, multiple, onToggle }: {
  members: TaskAssignee[]; selected: string[]; email: string; disabled: boolean; label: string; emptyMessage: string;
  title: string; multiple?: boolean;
  onToggle: (member: string) => void;
}) {
  const ui = useScreenStyles();
  return <SearchableChoiceDropdown title={title} multiple={multiple} placeholder={taskUnsetLabel}
    placeholderStyle={ui.unsetValue} items={members.map(member => ({
    id: member.email, name: member.name, self: member.email === email,
    photoURL: member.photoURL || (member.email === email ? auth.currentUser?.photoURL : null),
  }))} selected={selected} disabled={disabled} label={label} emptyMessage={emptyMessage} onToggle={onToggle} />;
}

function WeightField({ label, value, disabled, onChange, onSubmit }: {
  label: string; value: string; disabled: boolean; onChange: (value: string) => void; onSubmit?: () => void;
}) {
  const styles = useStyles();
  return (
    <View style={styles.weightField}>
      <Text style={styles.weightLabel}>Khối lượng</Text>
      <NumberStepper accessibilityLabel={label} style={styles.weightInput} value={value} placeholder="1"
        editable={!disabled} inputMode="numeric" maxLength={15} min={1} max={maxChecklistWeight} emptyValue={1}
        onChangeText={next => { if (/^\d*$/.test(next)) onChange(next); }}
        onSubmitEditing={onSubmit} returnKeyType={onSubmit ? 'done' : undefined}
        submitBehavior={onSubmit ? 'submit' : undefined} blurOnSubmit={onSubmit ? false : undefined} />
    </View>
  );
}

function choices<T extends string>(values: readonly T[]) {
  return values.map(value => ({ value, label: value }));
}

export function TaskAssignmentForm({ email, task, initial, onClose, onSaved }: {
  email: string; task?: Task; onClose: () => void; onSaved: (assignees: string[]) => void;
  initial?: { title: string; note: string; projectId: string };
}) {
  const ui = useScreenStyles();
  const { colors } = useTheme();
  const styles = useStyles();
  const showToast = useToast();
  const [taskId] = useState(() => task?.id ?? newTaskId());
  const assignment = task ? getAssignmentComment(task) : undefined;
  const dueRequired = !task || Boolean(task.due);
  const workflowLocked = !!task && !editableStatus(task.status);
  const canChangeApprover = !workflowLocked || task?.status === 'Chờ duyệt';
  const [members, setMembers] = useState<TaskAssignee[] | null>(null);
  const [projects, setProjects] = useState<AssignmentProject[] | undefined>();
  const [directoryError, setDirectoryError] = useState('');
  const [reload, setReload] = useState(0);
  const [title, setTitle] = useState(task?.title ?? initial?.title ?? '');
  const [category, setCategory] = useState(task?.category ?? '');
  const [assignees, setAssignees] = useState(task?.assigneeEmail ? [task.assigneeEmail] : []);
  const [watchers, setWatchers] = useState(task?.watchers ?? []);
  const [approver, setApprover] = useState<string | undefined>(task?.approverEmail ?? (emulatorMode && !task ? undefined : ''));
  const [start, setStart] = useState(() => task ? task.startDate ?? '' : todayInVietnam());
  const [due, setDue] = useState(task?.due ?? '');
  const [retained, setRetained] = useState(assignment?.files ?? []);
  const [files, setFiles] = useState<PickedAttachment[]>([]);
  const [openingFileId, setOpeningFileId] = useState('');
  const [preview, setPreview] = useState<AttachmentFile>();
  const [picking, setPicking] = useState(false);
  const [options, setOptions] = useState<AssignmentOptions>(() => ({
    priority: taskPriorities.find(value => value === task?.priority) ?? initialOptions.priority,
    status: task && editableStatus(task.status) ? task.status : initialOptions.status,
    repeat: taskRepeatOptions.find(value => value === task?.repeat) ?? initialOptions.repeat,
    projectId: task?.projectId ?? initial?.projectId ?? initialOptions.projectId,
    milestone: task?.milestone === true,
    requireReview: task?.requireReview,
  }));
  const statusLabel = task ? 'Trạng thái' : 'Tình trạng ban đầu';
  const lockedStatus = workflowLocked ? taskStatus(task) : undefined;
  const [defaultRequireReview, setDefaultRequireReview] = useState(true);
  const requiresReview = options.requireReview ?? defaultRequireReview;
  const [progressText, setProgressText] = useState(String(task?.progress ?? 0));
  const [note, setNote] = useState(task?.note ?? initial?.note ?? '');
  const [message, setMessage] = useState(assignment?.text ?? '');
  const [items, setItems] = useState(() => (task?.checklist ?? []).map((item, index) => ({
    t: item.t || item.text || '', weight: String(checklistWeight(item.weight)), done: item.done === true,
    sourceIndex: index as number | null,
  })).filter(item => item.t));
  const [newItem, setNewItem] = useState('');
  const [newWeight, setNewWeight] = useState('');
  const [tab, setTab] = useState<'main' | 'options'>('main');
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const today = todayInVietnam();
  const earliestDue = task || start > today ? start : today;
  const allFiles = [...retained, ...files];
  const fileLimit = attachmentLimit(allFiles, assignees.length);
  const draftItems = newItem.trim() && items.length < 30
    ? [...items, { t: newItem.trim(), weight: newWeight, done: false, sourceIndex: null }] : items;
  const checklist = draftItems.map(item => ({ ...item, t: item.t.trim(), weight: item.weight ? Number(item.weight) : 1 }));
  const validWeights = checklist.every(item => validChecklistWeight(item.weight));
  const assigneeName = members?.find(member => member.email === assignees[0])?.name ||
    (task && assignees[0] === task.assigneeEmail ? task.assignee || task.assigneeEmail : assignees[0]);
  const approverName = members?.find(member => member.email === approver)?.name || approver;

  useEffect(() => {
    if (task?.requireReview !== undefined) return;
    return onSnapshot(doc(db, 'settings', 'work'),
      snapshot => setDefaultRequireReview(snapshot.get('requireReview') !== false),
      () => setDefaultRequireReview(true));
  }, [task?.requireReview]);

  useEffect(() => {
    let active = true;
    void listTaskAssignees().then(({ data }) => {
      if (!active) return;
      setMembers(data.members.sort((a, b) => a.name.localeCompare(b.name, 'vi') || a.email.localeCompare(b.email)));
      setProjects(data.projects?.sort((a, b) => a.name.localeCompare(b.name, 'vi')));
    }).catch(err => {
      if (active) setDirectoryError(functionError(err, 'Không tải được danh sách thành viên.'));
    });
    return () => { active = false; };
  }, [reload]);

  function reloadDirectory() {
    setDirectoryError('');
    setReload(value => value + 1);
  }

  const memberLoadingFeedback = directoryError ? <View style={styles.field}>
    <Text accessibilityRole="alert" style={styles.error}>{directoryError}</Text>
    <Pressable accessibilityRole="button" style={styles.back} onPress={reloadDirectory}>
      <Text style={styles.actionText}>Tải lại thành viên</Text>
    </Pressable>
  </View> : <ActivityIndicator accessibilityLabel="Đang tải thành viên" color={colors.accent} />;

  function updateOption<K extends keyof AssignmentOptions>(key: K, value: AssignmentOptions[K]) {
    setOptions(current => ({ ...current, [key]: value }));
  }

  function toggleMember(member: string, selected: string[], update: (value: string[]) => void) {
    if (selected.includes(member)) return update(selected.filter(value => value !== member));
    if (selected.length >= 30) return showToast('Mỗi danh sách chọn tối đa 30 người.', 'error');
    update([...selected, member]);
  }

  function updateAssignees(next: string[]) {
    setAssignees(next);
    const limit = attachmentLimit(allFiles, next.length);
    if (limit) showToast(limit, 'error');
  }

  function addItem() {
    const item = newItem.trim();
    if (!item || saving || workflowLocked || items.length >= 30) return;
    const weight = newWeight || '1';
    if (!validChecklistWeight(Number(weight))) {
      showToast('Khối lượng việc con phải là số nguyên dương hợp lệ.', 'error');
      return;
    }
    setItems(current => current.length < 30 ? [...current, { t: item, weight, done: false, sourceIndex: null }] : current);
    setNewItem('');
    setNewWeight('');
  }

  async function chooseFiles() {
    setPicking(true);
    try {
      const selected = await pickTaskAttachments();
      if (!selected.length) return;
      const next = [...files, ...selected];
      const limit = attachmentLimit([...retained, ...next], assignees.length);
      if (limit) showToast(limit, 'error');
      else setFiles(next);
    } catch {
      showToast('Không đọc được tệp đã chọn. Vui lòng chọn lại.', 'error');
    } finally {
      setPicking(false);
    }
  }

  async function submit() {
    if (pending.current) return;
    const taskTitle = title.trim();
    const progress = checklist.length || workflowLocked ? 0 : parseTaskProgress(progressText);
    function showFieldError(fieldTab: typeof tab, message: string) {
      setTab(fieldTab);
      showToast(message, 'error');
    }
    if (!taskTitle) return showFieldError('main', 'Nhập tên công việc.');
    if (!assignees.length) return showFieldError('main', 'Chọn ít nhất một người thực hiện.');
    if (!due && dueRequired) return showFieldError('main', 'Chọn hạn chót trên lịch.');
    if (due && due < earliestDue) return showFieldError('main', task
      ? 'Hạn chót không được sớm hơn ngày bắt đầu.' : 'Hạn chót phải từ hôm nay và không sớm hơn ngày bắt đầu.');
    if (fileLimit) return showFieldError('main', fileLimit);
    if (!workflowLocked && checklist.some(item => !item.t)) return showFieldError('options', 'Nhập tên cho từng việc con.');
    if (!validWeights) return showFieldError('options', 'Khối lượng việc con phải là số nguyên dương hợp lệ.');
    if (progress === undefined) return showFieldError('options', 'Nhập số nguyên từ 0 đến 100.');
    pending.current = true;
    setSaving(true);
    try {
      let attachments;
      try {
        attachments = await readTaskAttachments(files);
      } catch {
        showFieldError('main', 'Không đọc được tệp đính kèm. Hãy bỏ tệp lỗi và chọn lại.');
        return;
      }
      const { requireReview, ...assignmentOptions } = options;
      const completionMode = workflowLocked ? undefined : requireReview ?? (task ? undefined : requiresReview);
      const data = {
        ...assignmentOptions, progress, taskId, title: taskTitle, assigneeEmails: assignees, due, startDate: start,
        ...(completionMode !== undefined && { requireReview: completionMode }),
        category: category.trim(),
        note, message, checklist: checklist.map(({ t, weight, sourceIndex }) =>
          task ? { t, weight, sourceIndex } : { t, weight }), watchers, attachments,
      };
      if (task) {
        await updateTask({ ...data, revision: task.updatedAt ?? '', retainedFileIds: retained.map(file => file.id),
          approverEmail: canChangeApprover ? approver : undefined });
        onSaved(assignees);
      } else {
        const result = await createTask({ ...data, approverEmail: approver });
        onSaved(result.data.assignments.map(item => item.assignee));
      }
    } catch (err) {
      showToast(functionError(err, task ? 'Chưa xác nhận được thay đổi. Mở lại công việc để kiểm tra.'
        : 'Chưa xác nhận được việc đã tạo. Bấm Tạo công việc để thử lại.'), 'error');
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  async function openFile(file: TaskAttachment) {
    if (!task || openingFileId) return;
    setOpeningFileId(file.id);
    try {
      setPreview(await readTaskAttachment(task.id, file));
    } catch {
      showToast('Không mở được tệp. Kiểm tra kết nối và thử lại.', 'error');
    } finally {
      setOpeningFileId('');
    }
  }

  return (
    <Modal transparent visible onRequestClose={() => { if (!pending.current) onClose(); }} statusBarTranslucent>
      <SafeAreaView style={styles.overlay}>
        <KeyboardViewport style={styles.keyboard}>
          <View style={styles.panel}>
            <View style={styles.modalHeader}>
              <Text accessibilityRole="header" style={styles.heading}>{task ? 'Chỉnh sửa công việc' : 'Giao việc mới'}</Text>
              <PopupCloseButton label={task ? 'Đóng chỉnh sửa' : 'Đóng giao việc'} onPress={onClose} disabled={saving} />
            </View>
            <View style={styles.formTabs}>
              <SegmentedButtons label="Thông tin công việc" value={tab} onChange={setTab}
                choices={[{ value: 'main', label: 'Thông tin chính' }, { value: 'options', label: 'Tùy chọn' }]} />
            </View>
            <View style={styles.formBody}>
              <KeyboardScrollView key={tab} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
                {tab === 'main' ? <>
                {!task ? <Text style={styles.muted}>Mỗi người được chọn sẽ nhận một công việc riêng.</Text> : null}
                <View style={styles.field}>
                  <FieldLabel style={styles.label} required>Tên công việc</FieldLabel>
                  <TextInput accessibilityLabel="Tên công việc" style={styles.input} value={title} editable={!saving}
                    onChangeText={setTitle} maxLength={taskTitleMaxLength} placeholder="Nhập tên việc cần làm" />
                </View>
                <View style={styles.field}>
                  <FieldLabel style={styles.label}>Hạng mục</FieldLabel>
                  <TextInput accessibilityLabel="Hạng mục" style={styles.input} value={category} editable={!saving}
                    onChangeText={setCategory} maxLength={taskCategoryMaxLength} placeholder="Nhập hạng mục công việc" />
                </View>
                <View style={styles.field}>
                  <FieldLabel style={styles.label} required={!workflowLocked}>Người thực hiện</FieldLabel>
                  {task && (workflowLocked || !members) ? <Text style={[styles.muted, !assigneeName && ui.unsetValue]}>
                    {assigneeName || taskUnsetLabel}</Text> : null}
                  {workflowLocked ? null : !members ? memberLoadingFeedback
                    : <MemberPicker title="Người thực hiện" multiple={!task} members={members} email={email} selected={assignees} disabled={saving} label="Tìm thành viên"
                        emptyMessage="Không có thành viên phù hợp."
                        onToggle={member => {
                          if (task) setAssignees([member]);
                          else toggleMember(member, assignees, updateAssignees);
                          if (approver === member) setApprover('');
                        }} />}
                </View>
                <View style={styles.field}>
                  <FieldLabel style={styles.label} required>Mức độ ưu tiên</FieldLabel>
                  <Choices label="Mức độ ưu tiên" items={taskPriorities.map(value => ({ value, label: value, tone: priorityTone(value, colors) }))}
                    value={options.priority} disabled={saving}
                    onChange={value => updateOption('priority', value)} />
                </View>
                <DateCalendarField label="Ngày bắt đầu" value={start} initialDay={start || due || today} emptyLabel={taskUnsetLabel}
                  disabled={saving} onChange={day => {
                    setStart(day);
                    if (due && day > due) setDue('');
                  }} />
                <View style={styles.field}>
                  <FieldLabel style={styles.label} required={dueRequired}>Hạn chót</FieldLabel>
                  <DateCalendarButton label="Hạn chót" value={due} min={earliestDue} emptyLabel={taskUnsetLabel}
                    initialDay={due && due >= earliestDue ? due : earliestDue || today} disabled={saving} onChange={setDue} />
                  <Choices items={quickDates.map(({ label, days }) => {
                    const value = shiftDay(today, days);
                    return { value, label, disabled: value < earliestDue };
                  })} value={due} disabled={saving} onChange={setDue} />
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>Tệp đính kèm{allFiles.length ? ` · ${allFiles.length}` : ''}</Text>
                  <FilePickerButton disabled={saving} picking={picking} onPress={() => void chooseFiles()}
                    hint="Tối đa 5 tệp, 5 MB mỗi tệp và 8 MB tính theo số bản gửi." />
                  {allFiles.map((file, index) => {
                    const content = <AttachmentLabel file={file}>
                      <Text style={[styles.label, styles.attachmentValue]}>{file.name}</Text>
                      <Text style={[styles.muted, styles.attachmentValue]}>
                        {'id' in file && openingFileId === file.id ? 'Đang mở…' : formatFileSize(file.size)}
                      </Text>
                    </AttachmentLabel>;
                    return <View key={'id' in file ? file.id : index - retained.length} style={styles.person}>
                      {'id' in file ? <Pressable style={styles.personLabel} accessibilityRole="button"
                        accessibilityLabel={`Xem tệp ${file.name}`} disabled={saving || picking || !!openingFileId}
                        onPress={() => void openFile(file)}>{content}</Pressable> : <View style={styles.personLabel}>{content}</View>}
                      <Pressable accessibilityRole="button" accessibilityLabel={`Bỏ tệp ${file.name}`}
                        style={styles.back} disabled={saving || picking} onPress={() => {
                          if ('id' in file) setRetained(current => current.filter(item => item.id !== file.id));
                          else setFiles(current => current.filter((_, position) => position !== index - retained.length));
                        }}>
                        <Text style={styles.actionText}>Bỏ</Text>
                      </Pressable>
                    </View>;
                  })}
                </View>
                </> : <>
                  <View style={styles.field}>
                    <Text style={styles.label}>Dự án</Text>
                    {projects ? <Dropdown label="Dự án" hideLabel singleLineValue
                      choices={[{ value: '', label: 'Chung toàn công ty' }, ...projects.map(project => ({ value: project.id, label: project.name }))]}
                      value={options.projectId} onChange={value => updateOption('projectId', value)} disabled={saving} />
                      : members ? <Pressable accessibilityRole="button" style={styles.back} onPress={reloadDirectory}>
                        <Text style={styles.actionText}>Tải lại danh sách dự án</Text>
                      </Pressable> : null}
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.label}>Chế độ hoàn thành</Text>
                    <Dropdown label="Chế độ hoàn thành" hideLabel choices={taskCompletionModes} highlightSelection={false}
                      value={requiresReview || task?.status === 'Chờ duyệt' ? 'review' : 'report'}
                      disabled={saving || workflowLocked} onChange={value => updateOption('requireReview', value === 'review')} />
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.label}>Người duyệt</Text>
                    {canChangeApprover && members ? <MemberPicker
                      members={members.filter(member => member.canReview && !assignees.includes(member.email))}
                      email={email} selected={approver ? [approver] : []} disabled={saving}
                      title="Người duyệt" label="Tìm người duyệt" emptyMessage="Không có người duyệt phù hợp."
                      onToggle={member => {
                        if (member !== approver) setApprover(member);
                        else if (!workflowLocked) setApprover('');
                      }} /> : <>
                        {approverName || !canChangeApprover ? <Text style={[styles.muted, !approverName && ui.unsetValue]}>
                          {approverName || taskUnsetLabel}
                        </Text> : null}
                        {canChangeApprover ? memberLoadingFeedback : null}
                      </>}
                  </View>
                  <View style={styles.field}>
                    <FieldLabel style={styles.label} required={!workflowLocked}>
                      {statusLabel}
                    </FieldLabel>
                    {lockedStatus ? <Text style={[styles.label, { color: statusTone(lockedStatus, colors).text }]}>{lockedStatus}</Text>
                      : <Choices label={statusLabel} items={editableStatuses.map(value => ({
                        value, label: value, tone: statusTone(value, colors),
                      }))} value={options.status} disabled={saving} onChange={value => updateOption('status', value)} />}
                    <FieldLabel style={[styles.label, styles.progressLabel]} required={!workflowLocked && !items.length && !newItem.trim()}>
                      Tiến độ (%)
                    </FieldLabel>
                    {checklist.length ? <Text style={styles.progressHint}>{validWeights
                        ? 'Tự tính theo khối lượng việc con.'
                        : 'Nhập khối lượng hợp lệ để tính tiến độ.'}</Text>
                      : workflowLocked ? <Text style={styles.muted}>{task.progress ?? 0}%</Text>
                      : <NumberStepper accessibilityLabel={task ? 'Tiến độ (%)' : 'Tiến độ ban đầu (%)'} inputMode="numeric" style={styles.input} max={100}
                          value={progressText} editable={!saving} onChangeText={value => {
                            if (value === '' || parseTaskProgress(value) !== undefined) setProgressText(value);
                          }} />}
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.label}>Lặp lại</Text>
                    <Choices items={choices(taskRepeatOptions)} value={options.repeat} disabled={saving}
                      onChange={value => updateOption('repeat', value)} />
                    {task?.recurrenceOn
                      ? <Text style={styles.muted}>Chỉnh lịch lặp ở kỳ mới nhất. Các kỳ vẫn tính từ ngày giao việc gốc.</Text>
                      : options.repeat !== 'Không lặp' &&
                        <Text style={styles.muted}>Kỳ mới được tạo theo ngày giao, kể cả khi kỳ trước chưa xong.</Text>}
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.label}>Việc con (checklist)</Text>
                    {items.map((item, index) => <View key={index} style={[styles.person, styles.checklistRow]}>
                      {workflowLocked ? <Text style={[styles.personLabel, styles.label, styles.lockedItemName]}>{item.t}</Text>
                        : <TextInput accessibilityLabel={`Tên việc con ${index + 1}`}
                          style={[styles.input, styles.personLabel, styles.itemNameInput]} value={item.t} editable={!saving}
                          placeholder="Nhập tên việc con" maxLength={160}
                          onChangeText={t => setItems(current => current.map((entry, position) =>
                            position === index ? { ...entry, t } : entry))} />}
                      <View style={styles.itemControls}>
                        <WeightField label={`Khối lượng việc con ${index + 1}`} value={item.weight}
                          disabled={saving || workflowLocked} onChange={weight => setItems(current => current.map((entry, position) =>
                            position === index ? { ...entry, weight } : entry))} />
                        {!workflowLocked ? <View style={styles.deleteItem}>
                          <DeleteIconButton label={`Bỏ việc con ${index + 1}`} disabled={saving}
                            onPress={() => setItems(current => current.filter((_, position) => position !== index))} />
                        </View> : null}
                      </View>
                    </View>)}
                    {!workflowLocked && items.length < 30 ? <>
                      <View style={styles.newItemRow}>
                        <TextInput accessibilityLabel="Tên việc con" style={[styles.input, styles.personLabel, styles.itemNameInput]}
                          value={newItem} editable={!saving} onChangeText={setNewItem} onSubmitEditing={addItem}
                          returnKeyType="done" submitBehavior="submit" blurOnSubmit={false}
                          placeholder="Nhập tên việc con" maxLength={160} />
                        <WeightField label="Khối lượng việc con mới" value={newWeight}
                          disabled={saving} onChange={setNewWeight} onSubmit={addItem} />
                      </View>
                      <Button label="+ Thêm việc con" onPress={addItem} disabled={saving || !newItem.trim()} style={styles.addItem} />
                    </> : null}
                  </View>
                  {members ? <View style={styles.field}>
                    <Text style={styles.label}>Người theo dõi</Text>
                    <MemberPicker title="Người theo dõi" multiple members={members} email={email} selected={watchers} disabled={saving}
                      label="Tìm người theo dõi" emptyMessage="Không có người theo dõi phù hợp."
                      onToggle={member => toggleMember(member, watchers, setWatchers)} />
                  </View> : null}
                  <Pressable accessibilityRole="checkbox" aria-checked={options.milestone} disabled={saving}
                    onPress={() => updateOption('milestone', !options.milestone)}
                    style={[styles.person, options.milestone && styles.highlight]}>
                    <Text style={[styles.mark, options.milestone && styles.markChecked]}>{options.milestone ? '✓' : ''}</Text>
                    <Text style={styles.label}>Mốc bàn giao dự án</Text>
                  </Pressable>
                  <View style={styles.field}>
                    <Text style={styles.label}>Mô tả / Yêu cầu bàn giao</Text>
                    <TextInput accessibilityLabel="Mô tả / Yêu cầu bàn giao" multiline style={[styles.input, styles.multiline]}
                      value={note} onChangeText={setNote} editable={!saving} maxLength={2000} />
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.label}>Lời nhắn khi giao việc</Text>
                    <TextInput accessibilityLabel="Lời nhắn khi giao việc" multiline style={[styles.input, styles.multiline]}
                      value={message} onChangeText={setMessage} editable={!saving} maxLength={1000} />
                  </View>
                </>}
              </KeyboardScrollView>
            </View>
            <View style={styles.footer}>
              <Pressable accessibilityRole="button" disabled={saving || picking}
                style={[styles.submit, (saving || picking) && styles.saving]} onPress={() => void submit()}>
                <Text style={styles.submitText}>{task ? (saving ? 'Đang lưu…' : 'Lưu thay đổi')
                  : (saving ? 'Đang tạo…' : 'Tạo công việc')}</Text>
              </Pressable>
            </View>
          </View>
          <ToastLayer safeAreaApplied />
        </KeyboardViewport>
      </SafeAreaView>
      {preview && <AttachmentPreview file={preview} onClose={() => setPreview(undefined)} />}
    </Modal>
  );
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(33, 25, 53, 0.45)' },
  keyboard: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 12 },
  panel: { width: '100%', maxWidth: 560, flexShrink: 1, borderRadius: 16, backgroundColor: colors.paper, overflow: 'hidden' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    padding: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  heading: { fontSize: 23, fontWeight: '800', color: colors.ink, flexShrink: 1 },
  formTabs: { paddingHorizontal: 16, paddingTop: 12 },
  formBody: { flexShrink: 1, minHeight: 0 },
  body: { gap: 16, padding: 16 },
  footer: { padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: colors.line },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  progressLabel: { marginTop: 4 },
  progressHint: { color: colors.muted, fontSize: 15, lineHeight: 21 },
  field: { gap: 7 },
  addItem: { alignSelf: 'flex-end' },
  newItemRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  label: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  attachmentValue: metadataValueStyle(colors),
  input: { minHeight: 46, paddingHorizontal: 12, borderWidth: 1, borderRadius: 9,
    borderColor: colors.line, fontSize: 16 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10,
    backgroundColor: colors.surfaceMuted, borderRadius: 9, minHeight: 48, borderWidth: 1, borderColor: colors.line },
  highlight: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  mark: { borderWidth: 1, borderColor: colors.line, width: 22, height: 22, lineHeight: 20, borderRadius: 5,
    color: colors.onAccent, textAlign: 'center', fontWeight: '800' },
  markChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
  personLabel: { flex: 1, gap: 2 },
  checklistRow: { alignItems: 'flex-end' },
  lockedItemName: { alignSelf: 'center' },
  itemNameInput: { height: 42, minHeight: 42, paddingVertical: 0, borderWidth: 1.5 },
  weightField: { width: 84, gap: 3 },
  weightLabel: { color: colors.muted, fontSize: 11 },
  weightInput: { height: 42, borderWidth: 1, borderRadius: 9, borderColor: colors.line, paddingLeft: 5,
    textAlign: 'center', color: colors.ink, fontSize: 15, fontWeight: '700' },
  itemControls: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  deleteItem: { height: 42, justifyContent: 'center' },
  back: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', borderRadius: 9,
    paddingHorizontal: 10, backgroundColor: colors.accentSoft },
  actionText: { color: colors.accent, fontSize: 13, fontWeight: '800' },
  submit: { backgroundColor: colors.accent, minHeight: 48, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  saving: { opacity: 0.65 },
  submitText: { color: colors.onAccent, fontSize: 15, fontWeight: '800' },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  multiline: { paddingVertical: 10, minHeight: 76, textAlignVertical: 'top' },
}));
