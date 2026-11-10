import { useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AssignmentCalendar, displayDay, shiftDay, todayInVietnam } from './AssignmentCalendar';
import { auth, emulatorMode, pilotMode } from '../../services/firebase/firebase';
import { MemberAvatar } from '../../components/MemberAvatar';
import { PopupCloseButton } from '../../components/PopupCloseButton';
import { SearchInput } from '../../components/SearchInput';
import { searchByName } from '../../utils/search';
import { attachmentLimit, formatFileSize, pickTaskAttachments, readTaskAttachments } from './taskAttachments';
import type { PickedAttachment } from './taskAttachments';
import {
  createTask, editableStatus, editableStatuses, getAssignmentComment, listTaskAssignees, newTaskId, parseTaskProgress,
  taskPriorities, taskRepeatOptions, taskTitleMaxLength, updateTask,
} from './tasks';
import type { AssignmentOptions, AssignmentProject, Task, TaskAssignee } from './tasks';
import { colors } from '../../theme/theme';
import { ToastLayer, useToast } from '../../components/Toast';

const quickDates = [
  { label: 'Hôm nay', days: 0 }, { label: 'Ngày mai', days: 1 }, { label: 'Sau 7 ngày', days: 7 },
];
const initialOptions: AssignmentOptions = {
  priority: 'Trung bình', status: 'Chưa làm', repeat: 'Không lặp', projectId: '', milestone: false,
};
const calendarMargin = 8;
const calendarGap = 6;
const calendarMaxHeight = 360;

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
  const [search, setSearch] = useState('');
  const matches = searchByName(members, search, member => member.name);
  const visible = matches.slice(0, 6);
  return (
    <View style={styles.field}>
      <SearchInput accessibilityLabel={label} style={styles.input} value={search} onChangeText={setSearch}
        editable={!disabled} placeholder="Tìm theo tên" autoCapitalize="none" />
      {visible.map(member => {
        const checked = selected.includes(member.email);
        return (
          <Pressable key={member.email} accessibilityRole="checkbox" aria-checked={checked} disabled={disabled}
            accessibilityLabel={member.name}
            onPress={() => onToggle(member.email)} style={[styles.person, checked && styles.highlight]}>
            <MemberAvatar name={member.name} photoURL={member.photoURL || (member.email === email ? auth.currentUser?.photoURL : null)} />
            <Text style={[styles.personLabel, styles.label, checked && styles.actionText]}>
              {member.name}{member.email === email ? ' (Bạn)' : ''}
            </Text>
            <Text style={[styles.mark, checked && styles.markChecked]}>{checked ? '✓' : ''}</Text>
          </Pressable>
        );
      })}
      {visible.length === 0 ? <Text accessibilityLiveRegion="polite" style={styles.muted}>{emptyMessage}</Text> : null}
      {matches.length > visible.length ? <Text style={styles.muted}>Tìm theo tên để xem thêm.</Text> : null}
      <View style={styles.quickDates}>
        {members.filter(member => selected.includes(member.email) && !visible.includes(member)).map(member => (
          <Pressable key={member.email} accessibilityRole="button" accessibilityLabel={`Bỏ chọn ${member.name}`}
            onPress={() => onToggle(member.email)} disabled={disabled} style={[styles.back, styles.personChip]}>
            <MemberAvatar name={member.name} photoURL={member.photoURL || (member.email === email ? auth.currentUser?.photoURL : null)} />
            <Text style={styles.actionText}>{member.name} ×</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Choices<T extends string>({ items, value, onChange, disabled }: {
  items: readonly { value: T; label: string }[]; value: T; onChange: (value: T) => void; disabled: boolean;
}) {
  return <View style={styles.quickDates}>{items.map(item => (
    <Pressable key={item.value} accessibilityRole="radio" aria-checked={value === item.value}
      onPress={() => onChange(item.value)} disabled={disabled}
      style={[styles.choice, value === item.value && styles.highlight]}>
      <Text style={[styles.label, value === item.value && styles.actionText]}>{item.label}</Text>
    </Pressable>
  ))}</View>;
}

function choices<T extends string>(values: readonly T[]) {
  return values.map(value => ({ value, label: value }));
}

export function TaskAssignmentForm({ email, task, onClose, onSaved }: {
  email: string; task?: Task; onClose: () => void; onSaved: (assignees: string[]) => void;
}) {
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
  const [approver, setApprover] = useState(task?.approverEmail ?? '');
  const [start, setStart] = useState(() => task ? task.startDate ?? '' : todayInVietnam());
  const [due, setDue] = useState(task?.due ?? '');
  const [calendar, setCalendar] = useState<{ field: 'start' | 'due'; top: number; bottom: number } | null>(null);
  const [formHeight, setFormHeight] = useState(0);
  const formBody = useRef<ComponentRef<typeof View>>(null);
  const startButton = useRef<ComponentRef<typeof Pressable>>(null);
  const dueButton = useRef<ComponentRef<typeof Pressable>>(null);
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
  const calendarHeight = Math.min(calendarMaxHeight, Math.max(0, formHeight - 2 * calendarMargin));
  const calendarBelow = (calendar?.bottom ?? 0) + calendarGap;
  const calendarPosition = calendar && calendarBelow + calendarHeight <= formHeight - calendarMargin
    ? { top: calendarBelow }
    : calendar && calendar.top >= calendarHeight + calendarGap + calendarMargin
      ? { bottom: formHeight - calendar.top + calendarGap } : { top: calendarMargin };

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

  function openCalendar(field: 'start' | 'due') {
    if (calendar?.field === field) {
      setCalendar(null);
      return;
    }
    const button = field === 'start' ? startButton : dueButton;
    formBody.current?.measureInWindow((_, formY) => {
      button.current?.measureInWindow((_, y, _width, height) => {
        setCalendar({ field, top: y - formY, bottom: y - formY + height });
      });
    });
  }

  function closeCalendar() {
    setCalendar(null);
    if (Platform.OS === 'web') {
      const button = calendar?.field === 'start' ? startButton : dueButton;
      button.current?.focus();
    }
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
    if (!newItem.trim() || items.length >= 30) return;
    setItems(current => [...current, newItem.trim()]);
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
        const result = await createTask({ ...data, approverEmail: emulatorMode ? undefined : approver });
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
    <Modal transparent visible onRequestClose={() => {
      if (calendar) closeCalendar();
      else if (!pending.current) onClose();
    }} statusBarTranslucent>
      <SafeAreaView style={styles.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
          <View style={styles.panel}>
            <View style={styles.modalHeader}>
              <Text accessibilityRole="header" style={styles.heading}>{task ? 'Chỉnh sửa công việc' : 'Giao việc mới'}</Text>
              <PopupCloseButton label={task ? 'Đóng chỉnh sửa' : 'Đóng giao việc'} onPress={onClose} disabled={saving} />
            </View>
            <View ref={formBody} collapsable={false} style={styles.formBody}
              onLayout={({ nativeEvent }) => setFormHeight(nativeEvent.layout.height)}>
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
                <View style={styles.field}>
                  <Text style={styles.label}>Mức độ ưu tiên</Text>
                  <Choices items={choices(taskPriorities)} value={options.priority} disabled={saving}
                    onChange={value => updateOption('priority', value)} />
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>Ngày bắt đầu</Text>
                  <Pressable ref={startButton} collapsable={false} accessibilityRole="button"
                    accessibilityLabel={`Ngày bắt đầu, ${start ? displayDay(start) : 'chọn ngày'}`}
                    aria-expanded={calendar?.field === 'start'} disabled={saving} style={styles.dateButton}
                    onPress={() => openCalendar('start')}>
                    <Text style={start ? styles.label : styles.muted}>{start ? displayDay(start) : 'Chọn ngày'}</Text>
                    <Text style={styles.actionText} aria-hidden>▦</Text>
                  </Pressable>
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>Hạn chót</Text>
                  <Pressable ref={dueButton} collapsable={false} accessibilityRole="button"
                    accessibilityLabel={`Hạn chót, ${due ? displayDay(due) : 'chọn ngày'}`}
                    aria-expanded={calendar?.field === 'due'} disabled={saving} style={styles.dateButton}
                    onPress={() => openCalendar('due')}>
                    <Text style={due ? styles.label : styles.muted}>{due ? displayDay(due) : 'Chọn ngày'}</Text>
                    <Text style={styles.actionText} aria-hidden>▦</Text>
                  </Pressable>
                  <View style={styles.quickDates}>
                    {quickDates.map(({ label, days }) => {
                      const day = shiftDay(today, days);
                      const disabled = saving || day < earliestDue;
                      return <Pressable key={label} accessibilityRole="button" aria-pressed={due === day}
                        style={[styles.back, disabled && styles.saving]} disabled={disabled}
                        onPress={() => { setDue(day); setCalendar(null); }}>
                        <Text style={styles.actionText}>{label}</Text>
                      </Pressable>;
                    })}
                  </View>
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>Tệp đính kèm{allFiles.length ? ` · ${allFiles.length}` : ''}</Text>
                  <Text style={styles.muted}>Tối đa 5 tệp, 5 MB mỗi tệp và 8 MB tính theo số bản gửi.</Text>
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
                  <Pressable accessibilityRole="button" style={[styles.choice, (saving || picking) && styles.saving]}
                    disabled={saving || picking} onPress={() => void chooseFiles()}>
                    <Text style={styles.actionText}>{picking ? 'Đang chọn tệp…' : '+ Chọn tệp'}</Text>
                  </Pressable>
                </View>
                <Pressable accessibilityRole="button" aria-expanded={advanced} onPress={() => setAdvanced(value => !value)}
                  style={[styles.choice, styles.advancedToggle]}>
                  <Text style={styles.actionText}>{advanced ? 'Thu gọn tùy chọn' : 'Tùy chọn thêm'}</Text>
                  <Text aria-hidden style={styles.actionText}>{advanced ? '▴' : '▾'}</Text>
                </Pressable>
                {advanced ? <>
                  <View style={styles.field}>
                    <Text style={styles.label}>Dự án</Text>
                    <Choices items={[{ value: '', label: 'Chung toàn công ty' }, ...projects.map(project => ({ value: project.id, label: project.name }))]}
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
                        onChangeText={setNewItem} placeholder="Nhập tên việc con" maxLength={160} />
                      <Pressable accessibilityRole="button" onPress={addItem} disabled={saving || !newItem.trim()}
                        style={styles.back}><Text style={styles.actionText}>+ Thêm việc con</Text></Pressable>
                    </> : null}
                  </View>
                  {members ? <View style={styles.field}>
                    <Text style={styles.label}>Người theo dõi · Đã chọn {watchers.length}</Text>
                    <MemberPicker members={members} email={email} selected={watchers} disabled={saving}
                      label="Tìm người theo dõi" emptyMessage="Không có người theo dõi phù hợp."
                      onToggle={member => toggleMember(member, watchers, setWatchers)} />
                  </View> : null}
                  {(!emulatorMode || task) && members ? <View style={styles.field}>
                    <Text style={styles.label}>Người duyệt</Text>
                    {!canChangeApprover ? <Text style={styles.muted}>{members.find(member => member.email === approver)?.name
                      || approver || 'Chưa chỉ định'}</Text> : <Choices items={[{ value: '', label: 'Chưa chỉ định' }, ...members
                      .filter(member => member.canReview && !assignees.includes(member.email))
                      .map(member => ({ value: member.email, label: member.name }))]}
                      value={approver} onChange={setApprover} disabled={saving} />}
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
              {calendar ? <View style={StyleSheet.absoluteFill}>
                <Pressable accessible={false} aria-hidden tabIndex={-1} style={StyleSheet.absoluteFill}
                  onPress={closeCalendar} />
                <View style={[styles.calendarPopover, calendarPosition]}>
                  <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: calendarHeight }}>
                    {calendar.field === 'start'
                      ? <AssignmentCalendar key="start" initialDay={start || due || today} value={start}
                          disabled={saving} onSelect={day => {
                            setStart(day);
                            if (due && day > due) setDue('');
                            closeCalendar();
                          }} />
                      : <AssignmentCalendar key="due" initialDay={due && due >= earliestDue ? due : earliestDue || today}
                          value={due} min={earliestDue} disabled={saving} onSelect={day => {
                            setDue(day);
                            closeCalendar();
                          }} />}
                  </ScrollView>
                </View>
              </View> : null}
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

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(33, 25, 53, 0.45)' },
  keyboard: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 12 },
  panel: { width: '100%', maxWidth: 560, flexShrink: 1, borderRadius: 16, backgroundColor: colors.paper, overflow: 'hidden' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    padding: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  heading: { fontSize: 23, fontWeight: '800', color: colors.ink, flexShrink: 1 },
  formBody: { flexShrink: 1, minHeight: 0 },
  calendarPopover: { position: 'absolute', left: 16, right: 16, borderRadius: 10, backgroundColor: colors.paper,
    boxShadow: '0 4px 16px rgba(33, 25, 53, 0.2)' },
  body: { gap: 16, padding: 16 },
  footer: { padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: colors.line },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  field: { gap: 7 },
  label: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  input: { minHeight: 46, paddingHorizontal: 12, borderWidth: 1, borderRadius: 9,
    borderColor: colors.line, color: colors.ink, fontSize: 16 },
  dateButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 46,
    paddingHorizontal: 12, borderWidth: 1, borderRadius: 9, borderColor: colors.line },
  person: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10,
    backgroundColor: colors.surfaceMuted, borderRadius: 9, minHeight: 48, borderWidth: 1, borderColor: colors.line },
  highlight: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  mark: { borderWidth: 1, borderColor: colors.line, width: 22, height: 22, lineHeight: 20, borderRadius: 5,
    color: colors.paper, textAlign: 'center', fontWeight: '800' },
  markChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
  personLabel: { flex: 1, gap: 2 },
  personChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  quickDates: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  choice: { minHeight: 44, justifyContent: 'center', borderRadius: 9, borderWidth: 1,
    borderColor: colors.line, paddingHorizontal: 10 },
  advancedToggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  back: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', borderRadius: 9,
    paddingHorizontal: 10, backgroundColor: colors.accentSoft },
  actionText: { color: colors.accent, fontSize: 13, fontWeight: '800' },
  submit: { backgroundColor: colors.accent, minHeight: 48, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  saving: { opacity: 0.65 },
  submitText: { color: colors.paper, fontSize: 15, fontWeight: '800' },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  multiline: { paddingVertical: 10, minHeight: 76, textAlignVertical: 'top' },
});
