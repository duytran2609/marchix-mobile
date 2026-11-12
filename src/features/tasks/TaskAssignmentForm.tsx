import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DateCalendarButton, DateCalendarField } from './CalendarDialog';
import { shiftDay, todayInVietnam } from './taskDates';
import { auth, emulatorMode, pilotMode } from '../../services/firebase/firebase';
import { SearchableChoiceList } from '../../components/SearchableChoiceList';
import { Button } from '../../components/Button';
import { ChoiceButtons as Choices } from '../../components/ChoiceButtons';
import { Dropdown } from '../../components/Dropdown';
import { FilePickerButton } from '../../components/FilePickerButton';
import { PopupCloseButton } from '../../components/PopupCloseButton';
import { attachmentLimit, formatFileSize, pickTaskAttachments, readTaskAttachments } from './taskAttachments';
import type { PickedAttachment } from './taskAttachments';
import {
  createTask, editableStatus, editableStatuses, getAssignmentComment, listTaskAssignees, newTaskId, parseTaskProgress,
  taskPriorities, taskRepeatOptions, taskTitleMaxLength, updateTask,
} from './tasks';
import type { AssignmentOptions, AssignmentProject, Task, TaskAssignee } from './tasks';
import { createThemedStyles, useTheme } from '../../theme/theme';
import { ToastLayer, useToast } from '../../components/Toast';

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

function MemberPicker({ members, selected, email, disabled, label, emptyMessage, onToggle }: {
  members: TaskAssignee[]; selected: string[]; email: string; disabled: boolean; label: string; emptyMessage: string;
  onToggle: (member: string) => void;
}) {
  return <SearchableChoiceList items={members.map(member => ({
    id: member.email, name: member.name, self: member.email === email,
    photoURL: member.photoURL || (member.email === email ? auth.currentUser?.photoURL : null),
  }))} selected={selected} disabled={disabled} label={label} emptyMessage={emptyMessage} onToggle={onToggle} />;
}

function choices<T extends string>(values: readonly T[]) {
  return values.map(value => ({ value, label: value }));
}

export function TaskAssignmentForm({ email, task, onClose, onSaved }: {
  email: string; task?: Task; onClose: () => void; onSaved: (assignees: string[]) => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const showToast = useToast();
  const [taskId] = useState(() => task?.id ?? newTaskId());
  const assignment = task ? getAssignmentComment(task) : undefined;
  const workflowLocked = !!task && !editableStatus(task.status);
  const canChangeApprover = !workflowLocked || (pilotMode && task?.status === 'Chờ duyệt');
  const [members, setMembers] = useState<TaskAssignee[] | null>(null);
  const [projects, setProjects] = useState<AssignmentProject[]>([]);
  const [directoryError, setDirectoryError] = useState('');
  const [reload, setReload] = useState(0);
  const [title, setTitle] = useState(task?.title ?? '');
  const [assignees, setAssignees] = useState(task?.assigneeEmail ? [task.assigneeEmail] : []);
  const [watchers, setWatchers] = useState(task?.watchers ?? []);
  const [approver, setApprover] = useState<string | undefined>(task?.approverEmail ?? (emulatorMode && !task ? undefined : ''));
  const [start, setStart] = useState(() => task ? task.startDate ?? '' : todayInVietnam());
  const [due, setDue] = useState(task?.due ?? '');
  const [retained, setRetained] = useState(assignment?.files ?? []);
  const [files, setFiles] = useState<PickedAttachment[]>([]);
  const [picking, setPicking] = useState(false);
  const [options, setOptions] = useState<AssignmentOptions>(() => ({
    priority: taskPriorities.find(value => value === task?.priority) ?? initialOptions.priority,
    status: task && editableStatus(task.status) ? task.status : initialOptions.status,
    repeat: taskRepeatOptions.find(value => value === task?.repeat) ?? initialOptions.repeat,
    projectId: task?.projectId ?? initialOptions.projectId,
    milestone: task?.milestone === true,
  }));
  const [progressText, setProgressText] = useState(String(task?.progress ?? 0));
  const [note, setNote] = useState(task?.note ?? '');
  const [message, setMessage] = useState(assignment?.text ?? '');
  const [items, setItems] = useState(() => task?.checklist?.map(item => item.t || item.text || '').filter(Boolean) ?? []);
  const [newItem, setNewItem] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const today = todayInVietnam();
  const earliestDue = task || start > today ? start : today;
  const allFiles = [...retained, ...files];
  const fileLimit = attachmentLimit(allFiles, assignees.length);

  useEffect(() => {
    let active = true;
    void listTaskAssignees().then(({ data }) => {
      if (!active) return;
      setMembers(data.members.sort((a, b) => a.name.localeCompare(b.name, 'vi') || a.email.localeCompare(b.email)));
      setProjects((data.projects ?? []).sort((a, b) => a.name.localeCompare(b.name, 'vi')));
    }).catch(err => {
      if (active) setDirectoryError(functionError(err, 'Không tải được danh sách thành viên.'));
    });
    return () => { active = false; };
  }, [reload]);

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
    if (!item || saving || workflowLocked) return;
    setItems(current => current.length < 30 ? [...current, item] : current);
    setNewItem('');
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
    const checklist = newItem.trim() && items.length < 30 ? [...items, newItem.trim()] : items;
    const progress = checklist.length || workflowLocked ? 0 : parseTaskProgress(progressText);
    if (!taskTitle) return showToast('Nhập tên công việc.', 'error');
    if (!assignees.length) return showToast('Chọn ít nhất một người thực hiện.', 'error');
    if (!due && (!task || task.due)) return showToast('Chọn hạn chót trên lịch.', 'error');
    if (due && due < earliestDue) return showToast(task
      ? 'Hạn chót không được sớm hơn ngày bắt đầu.' : 'Hạn chót phải từ hôm nay và không sớm hơn ngày bắt đầu.', 'error');
    if (fileLimit) return showToast(fileLimit, 'error');
    if (progress === undefined) return showToast('Nhập số nguyên từ 0 đến 100.', 'error');
    pending.current = true;
    setSaving(true);
    try {
      let attachments;
      try {
        attachments = await readTaskAttachments(files);
      } catch {
        showToast('Không đọc được tệp đính kèm. Hãy bỏ tệp lỗi và chọn lại.', 'error');
        return;
      }
      const data = {
        ...options, progress, taskId, title: taskTitle, assigneeEmails: assignees, due, startDate: start,
        note, message, checklist, watchers, attachments,
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

  return (
    <Modal transparent visible onRequestClose={() => { if (!pending.current) onClose(); }} statusBarTranslucent>
      <SafeAreaView style={styles.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
          <View style={styles.panel}>
            <View style={styles.modalHeader}>
              <Text accessibilityRole="header" style={styles.heading}>{task ? 'Chỉnh sửa công việc' : 'Giao việc mới'}</Text>
              <PopupCloseButton label={task ? 'Đóng chỉnh sửa' : 'Đóng giao việc'} onPress={onClose} disabled={saving} />
            </View>
            <View style={styles.formBody}>
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
                {!task ? <Text style={styles.muted}>Mỗi người được chọn sẽ nhận một công việc riêng.</Text> : null}
                <View style={styles.field}>
                  <Text style={styles.label}>Tên công việc</Text>
                  <TextInput accessibilityLabel="Tên công việc" style={styles.input} value={title} editable={!saving}
                    onChangeText={setTitle} maxLength={taskTitleMaxLength} placeholder="Nhập tên việc cần làm" />
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>{task ? 'Người thực hiện' : `Người thực hiện · Đã chọn ${assignees.length}`}</Text>
                  {task ? <Text style={styles.muted}>{members?.find(member => member.email === assignees[0])?.name
                    || (assignees[0] === task.assigneeEmail ? task.assignee || task.assigneeEmail : assignees[0])
                    || 'Chưa chọn'}</Text> : null}
                  {workflowLocked ? null : directoryError ? <View style={styles.field}>
                    <Text accessibilityRole="alert" style={styles.error}>{directoryError}</Text>
                    <Pressable accessibilityRole="button" style={styles.back}
                      onPress={() => { setDirectoryError(''); setReload(value => value + 1); }}>
                      <Text style={styles.actionText}>Tải lại thành viên</Text>
                    </Pressable>
                  </View> : !members ? <ActivityIndicator accessibilityLabel="Đang tải thành viên" color={colors.accent} />
                    : <MemberPicker members={members} email={email} selected={assignees} disabled={saving} label="Tìm thành viên"
                        emptyMessage="Không có thành viên phù hợp."
                        onToggle={member => {
                          if (task) setAssignees([member]);
                          else toggleMember(member, assignees, updateAssignees);
                          if (approver === member) setApprover('');
                        }} />}
                </View>
                {members ? <View style={styles.field}>
                  <Text style={styles.label}>Người duyệt</Text>
                  {!canChangeApprover ? <Text style={styles.muted}>{members.find(member => member.email === approver)?.name
                    || approver || 'Chưa chỉ định'}</Text> : <MemberPicker
                    members={members.filter(member => member.canReview && !assignees.includes(member.email))}
                    email={email} selected={approver ? [approver] : []} disabled={saving}
                    label="Tìm người duyệt" emptyMessage="Không có người duyệt phù hợp."
                    onToggle={member => {
                      if (member !== approver) setApprover(member);
                      else if (!workflowLocked) setApprover('');
                    }} />}
                </View> : null}
                <View style={styles.field}>
                  <Text style={styles.label}>Mức độ ưu tiên</Text>
                  <Choices items={choices(taskPriorities)} value={options.priority} disabled={saving}
                    onChange={value => updateOption('priority', value)} />
                </View>
                <DateCalendarField label="Ngày bắt đầu" value={start} initialDay={start || due || today}
                  disabled={saving} onChange={day => {
                    setStart(day);
                    if (due && day > due) setDue('');
                  }} />
                <View style={styles.field}>
                  <Text style={styles.label}>Hạn chót</Text>
                  <DateCalendarButton label="Hạn chót" value={due} min={earliestDue}
                    initialDay={due && due >= earliestDue ? due : earliestDue || today} disabled={saving} onChange={setDue} />
                  <View style={styles.quickDates}>
                    {quickDates.map(({ label, days }) => {
                      const day = shiftDay(today, days);
                      const disabled = saving || day < earliestDue;
                      return <Pressable key={label} accessibilityRole="button" aria-pressed={due === day}
                        style={[styles.back, disabled && styles.saving]} disabled={disabled}
                        onPress={() => setDue(day)}>
                        <Text style={styles.actionText}>{label}</Text>
                      </Pressable>;
                    })}
                  </View>
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>Tệp đính kèm{allFiles.length ? ` · ${allFiles.length}` : ''}</Text>
                  <FilePickerButton disabled={saving} picking={picking} onPress={() => void chooseFiles()}
                    hint="Tối đa 5 tệp, 5 MB mỗi tệp và 8 MB tính theo số bản gửi." />
                  {allFiles.map((file, index) => <View key={'id' in file ? file.id : index - retained.length} style={styles.person}>
                    <View style={styles.personLabel}>
                      <Text style={styles.label}>{file.name}</Text>
                      <Text style={styles.muted}>{formatFileSize(file.size)}</Text>
                    </View>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Bỏ tệp ${file.name}`}
                      style={styles.back} disabled={saving || picking} onPress={() => {
                        if ('id' in file) setRetained(current => current.filter(item => item.id !== file.id));
                        else setFiles(current => current.filter((_, position) => position !== index - retained.length));
                      }}>
                      <Text style={styles.actionText}>Bỏ</Text>
                    </Pressable>
                  </View>)}
                </View>
                <Pressable accessibilityRole="button" aria-expanded={advanced} onPress={() => setAdvanced(value => !value)}
                  style={[styles.choice, styles.advancedToggle]}>
                  <Text style={styles.actionText}>{advanced ? 'Thu gọn tùy chọn' : 'Tùy chọn thêm'}</Text>
                  <Text aria-hidden style={styles.actionText}>{advanced ? '▴' : '▾'}</Text>
                </Pressable>
                {advanced ? <>
                  <View style={styles.field}>
                    <Text style={styles.label}>Dự án</Text>
                    <Dropdown label="Dự án" hideLabel singleLineValue
                      choices={[{ value: '', label: 'Chung toàn công ty' }, ...projects.map(project => ({ value: project.id, label: project.name }))]}
                      value={options.projectId} onChange={value => updateOption('projectId', value)} disabled={saving} />
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.label}>{task ? 'Trạng thái' : 'Tình trạng ban đầu'}</Text>
                    {workflowLocked ? <Text style={styles.muted}>{task.status}</Text>
                      : <Choices items={choices(editableStatuses)} value={options.status} disabled={saving}
                          onChange={value => updateOption('status', value)} />}
                    <Text style={styles.label}>Tiến độ (%)</Text>
                    {workflowLocked ? <Text style={styles.muted}>{task.progress ?? 0}%</Text>
                      : items.length || newItem.trim() ? <Text style={styles.muted}>{task ? 'Tự tính theo checklist.' : '0% · Tự tính theo checklist.'}</Text>
                      : <TextInput accessibilityLabel={task ? 'Tiến độ (%)' : 'Tiến độ ban đầu (%)'} inputMode="numeric" style={styles.input}
                          value={progressText} editable={!saving} onChangeText={value => {
                            if (value === '' || parseTaskProgress(value) !== undefined) setProgressText(value);
                          }} />}
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.label}>Lặp lại</Text>
                    <Choices items={choices(taskRepeatOptions)} value={options.repeat} disabled={saving}
                      onChange={value => updateOption('repeat', value)} />
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.label}>Việc con (checklist)</Text>
                    {items.map((item, index) => <View key={index} style={styles.person}>
                      <Text style={[styles.personLabel, styles.label]}>{item}</Text>
                      {!workflowLocked ? <Pressable accessibilityRole="button" accessibilityLabel={`Bỏ việc con ${index + 1}`}
                        disabled={saving} onPress={() => setItems(current => current.filter((_, position) => position !== index))}
                        style={styles.back}><Text style={styles.actionText}>Bỏ</Text></Pressable> : null}
                    </View>)}
                    {!workflowLocked && items.length < 30 ? <>
                      <TextInput accessibilityLabel="Tên việc con" style={styles.input} value={newItem} editable={!saving}
                        onChangeText={setNewItem} onSubmitEditing={addItem} returnKeyType="done"
                        submitBehavior="submit" blurOnSubmit={false} placeholder="Nhập tên việc con" maxLength={160} />
                      <Button label="+ Thêm việc con" onPress={addItem} disabled={saving || !newItem.trim()} style={styles.addItem} />
                    </> : null}
                  </View>
                  {members ? <View style={styles.field}>
                    <Text style={styles.label}>Người theo dõi · Đã chọn {watchers.length}</Text>
                    <MemberPicker members={members} email={email} selected={watchers} disabled={saving}
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
                    <Text style={styles.label}>Mô tả / chỗ vướng</Text>
                    <TextInput accessibilityLabel="Mô tả / chỗ vướng" multiline style={[styles.input, styles.multiline]}
                      value={note} onChangeText={setNote} editable={!saving} maxLength={2000} />
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.label}>Lời nhắn khi giao việc</Text>
                    <TextInput accessibilityLabel="Lời nhắn khi giao việc" multiline style={[styles.input, styles.multiline]}
                      value={message} onChangeText={setMessage} editable={!saving} maxLength={1000} />
                  </View>
                </> : null}
              </ScrollView>
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
        </KeyboardAvoidingView>
      </SafeAreaView>
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
  formBody: { flexShrink: 1, minHeight: 0 },
  body: { gap: 16, padding: 16 },
  footer: { padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: colors.line },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  field: { gap: 7 },
  addItem: { alignSelf: 'flex-end' },
  label: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  input: { minHeight: 46, paddingHorizontal: 12, borderWidth: 1, borderRadius: 9,
    borderColor: colors.line, color: colors.ink, fontSize: 16 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10,
    backgroundColor: colors.surfaceMuted, borderRadius: 9, minHeight: 48, borderWidth: 1, borderColor: colors.line },
  highlight: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  mark: { borderWidth: 1, borderColor: colors.line, width: 22, height: 22, lineHeight: 20, borderRadius: 5,
    color: colors.onAccent, textAlign: 'center', fontWeight: '800' },
  markChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
  personLabel: { flex: 1, gap: 2 },
  quickDates: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  choice: { minHeight: 44, justifyContent: 'center', borderRadius: 9, borderWidth: 1,
    borderColor: colors.line, paddingHorizontal: 10 },
  advancedToggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  back: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', borderRadius: 9,
    paddingHorizontal: 10, backgroundColor: colors.accentSoft },
  actionText: { color: colors.accent, fontSize: 13, fontWeight: '800' },
  submit: { backgroundColor: colors.accent, minHeight: 48, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  saving: { opacity: 0.65 },
  submitText: { color: colors.onAccent, fontSize: 15, fontWeight: '800' },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  multiline: { paddingVertical: 10, minHeight: 76, textAlignVertical: 'top' },
}));
