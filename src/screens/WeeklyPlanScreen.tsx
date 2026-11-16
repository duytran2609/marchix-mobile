import { PaginatedList } from '../components/PaginatedList';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ClickableCardHeader } from '../components/CardChevron';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/Button';
import { AssignmentCalendar } from '../features/tasks/AssignmentCalendar';
import { CalendarDialog } from '../features/tasks/CalendarDialog';
import { formatTaskDate, shiftDay, todayInVietnam } from '../features/tasks/taskDates';
import { TaskPriority } from '../features/tasks/TaskPriority';
import { taskStatus } from '../features/tasks/TaskProgress';
import type { Task } from '../features/tasks/tasks';
import { mondayOf, planContent, suggestWeekTasks, weeklyPlanTextLimit } from '../features/weekly-plan/weeklyPlan';
import { saveWeekPlan, watchPlanningTeam, watchWeekPlans } from '../features/weekly-plan/weeklyPlanStore';
import type { WeekPlans } from '../features/weekly-plan/weeklyPlanStore';
import type { usePlanningDrafts } from '../features/weekly-plan/usePlanningDrafts';
import { useScreenStyles } from '../theme/screenStyles';
import { createThemedStyles, useTheme } from '../theme/theme';
import { TaskDetailPopup } from './TaskDetailScreen';

type WeeklyPlanProps = {
  email: string;
  isAdmin: boolean;
  tasks: Task[] | null;
  tasksError: boolean;
  onRetryTasks: () => void;
};

type DraftStorage = ReturnType<typeof usePlanningDrafts>;

export function WeeklyPlanScreen({ name, selectedWeek, onSelectWeek, draftStorage, ...props }: WeeklyPlanProps & {
  name: string;
  selectedWeek?: string;
  onSelectWeek: (week: string) => void;
  draftStorage: DraftStorage;
}) {
  const ui = useScreenStyles();
  const styles = useStyles();
  const [saving, setSaving] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [taskId, setTaskId] = useState<string>();
  const closeTask = () => setTaskId(undefined);
  const currentWeek = mondayOf(todayInVietnam());
  const week = selectedWeek ?? currentWeek;
  const calendarSelected = week < shiftDay(currentWeek, -7) || week > shiftDay(currentWeek, 7);
  const sunday = shiftDay(week, 6);
  return <>
    <View style={ui.stack}>
      <PageHeader title="Kế hoạch tuần" />
      <Text style={[ui.body, styles.weekRange]}>{formatTaskDate(week)} – {formatTaskDate(sunday)}</Text>
      <View style={styles.weekControls}>
        <View style={styles.weekSteps}>
          <WeekArrow label="Tuần trước" direction="left" disabled={saving} onPress={() => onSelectWeek(shiftDay(week, -7))} />
          <Button secondary style={styles.weekStep} label="Tuần này" selected={week === currentWeek}
            disabled={saving} onPress={() => onSelectWeek(currentWeek)} />
          <WeekArrow label="Tuần sau" direction="right" disabled={saving} onPress={() => onSelectWeek(shiftDay(week, 7))} />
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Chọn tuần trên lịch" disabled={saving}
          accessibilityState={{ disabled: saving, expanded: calendarOpen }} aria-pressed={calendarSelected}
          onPress={() => {
            if (Keyboard.isVisible()) Keyboard.dismiss();
            setCalendarOpen(true);
          }}
          style={({ pressed }) => [ui.secondary, styles.calendarButton, calendarSelected && ui.selected,
            (pressed || saving) && ui.dimmed]}>
          <Text aria-hidden style={styles.calendarIcon}>▦</Text>
        </Pressable>
      </View>
    </View>
    <WeekContent key={week} {...props} week={week} saving={saving} onSavingChange={setSaving}
      draftStorage={draftStorage} onOpenTask={setTaskId} />
    {taskId && <TaskDetailPopup id={taskId} email={props.email} name={name}
      onClose={closeTask} onBackToWeeklyPlan={closeTask} />}
    {calendarOpen && <CalendarDialog title="Chọn tuần" onClose={() => setCalendarOpen(false)}>
      <Text style={ui.muted}>Chọn một ngày để xem cả tuần.</Text>
      <AssignmentCalendar initialDay={week} value={week} rangeEnd={sunday} disabled={saving} onSelect={day => {
        onSelectWeek(mondayOf(day));
        setCalendarOpen(false);
      }} />
    </CalendarDialog>}
  </>;
}

function WeekArrow({ label, direction, disabled, onPress }: {
  label: string; direction: 'left' | 'right'; disabled: boolean; onPress: () => void;
}) {
  const ui = useScreenStyles();
  const styles = useStyles();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }}
    disabled={disabled} onPress={onPress}
    style={({ pressed }) => [ui.secondary, styles.calendarButton, (pressed || disabled) && ui.dimmed]}>
    <Text aria-hidden style={[styles.calendarIcon, direction === 'left' && styles.mirroredArrow]}>→</Text>
  </Pressable>;
}

function WeekContent({ email, isAdmin, tasks, tasksError, onRetryTasks, onOpenTask, week, saving, onSavingChange, draftStorage }:
  WeeklyPlanProps & {
    week: string; saving: boolean; onSavingChange: (saving: boolean) => void;
    draftStorage: DraftStorage; onOpenTask: (id: string) => void;
  }) {
  const ui = useScreenStyles();
  const styles = useStyles();
  const { colors } = useTheme();
  const [plans, setPlans] = useState<WeekPlans | null>(null);
  const [planError, setPlanError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const savingRef = useRef(false);

  useEffect(() => watchWeekPlans(week, email, isAdmin, setPlans, () => setPlanError(true)), [week, email, isAdmin, retry]);

  const suggested = suggestWeekTasks(tasks ?? [], email, week, shiftDay(week, 6));
  const existing = plans?.get(email);
  const { drafts, storageError, updateDraft } = draftStorage;
  const draft = drafts?.get(week);
  const content = draft ?? planContent(existing);
  const tooLong = content.trim().length > weeklyPlanTextLimit;
  const canSave = !!plans && !planError && !tooLong;

  async function save() {
    if (!canSave || savingRef.current) return;
    savingRef.current = true;
    onSavingChange(true);
    setSaveStatus('idle');
    try {
      await saveWeekPlan(email, week, { priorities: content, blockers: '' });
      updateDraft(week, undefined, draft);
      setSaveStatus('saved');
    } catch {
      setSaveStatus('error');
    } finally {
      savingRef.current = false;
      onSavingChange(false);
    }
  }

  return <>
    <View style={ui.panel}>
      <Text accessibilityRole="header" style={ui.cardTitle}>Công việc gợi ý</Text>
      {tasksError ? <>
        <Text accessibilityRole="alert" style={ui.error}>Không tải được công việc.</Text>
        <Button secondary label="Tải lại công việc" onPress={onRetryTasks} />
      </> : !tasks ? <ActivityIndicator accessibilityLabel="Đang tải công việc" color={colors.accent} /> : <>
        <Text style={ui.body}><Text style={[ui.label, ui.metadataLabel]}>Việc gợi ý:</Text> {suggested.length}</Text>
        {suggested.length === 0 && <Text style={ui.muted}>Chưa có công việc đến hạn trong tuần này.</Text>}
        {suggested.map(task => (
          <Pressable key={task.id} accessibilityRole="button" accessibilityHint="Mở chi tiết công việc"
            onPress={() => onOpenTask(task.id)}
            style={({ pressed }) => [ui.detailRow, styles.task, pressed && ui.dimmed]}>
            <ClickableCardHeader><Text style={ui.label}>{task.title}</Text></ClickableCardHeader>
            <Text style={ui.muted}>
              <Text style={[ui.label, ui.metadataLabel]}>Trạng thái: </Text>
              <Text style={task.status === 'Vướng' ? ui.error : undefined}>{taskStatus(task)}</Text>
            </Text>
            <Text style={ui.muted}>
              <Text style={[ui.label, ui.metadataLabel]}>Hạn chót: </Text>{task.due ? formatTaskDate(task.due) : 'Chưa đặt'}
            </Text>
            <Text style={ui.muted}>
              <Text style={[ui.label, ui.metadataLabel]}>Mức độ ưu tiên: </Text><TaskPriority priority={task.priority} />
            </Text>
          </Pressable>
        ))}
      </>}
    </View>
    <View style={ui.panel}>
      <Text accessibilityRole="header" style={ui.cardTitle}>Kế hoạch của tôi</Text>
      {planError ? <>
        <Text accessibilityRole="alert" style={ui.error}>Không tải được kế hoạch.</Text>
        <Button secondary label="Tải lại kế hoạch" onPress={() => {
          setPlans(null);
          setPlanError(false);
          setRetry(value => value + 1);
        }} />
      </> : !plans || !drafts ? <ActivityIndicator accessibilityLabel="Đang tải kế hoạch" color={colors.accent} /> : <>
        <View style={styles.field}>
          <Text style={ui.label}>Nội dung kế hoạch</Text>
          <TextInput accessibilityLabel="Nội dung kế hoạch" multiline maxLength={Math.max(weeklyPlanTextLimit, content.length)}
            editable={!saving} value={content} onChangeText={value => {
              updateDraft(week, value);
              setSaveStatus('idle');
            }}
            style={[ui.input, ui.messageInput]} />
        </View>
        {tooLong && <Text accessibilityRole="alert" style={ui.error}>Nội dung kế hoạch tối đa {weeklyPlanTextLimit} ký tự.</Text>}
        {storageError && <Text accessibilityRole="alert" style={ui.error}>Không thể khôi phục hoặc lưu bản nháp trên thiết bị.</Text>}
        <Button label={saving ? 'Đang lưu…' : 'Lưu kế hoạch'} disabled={saving || !canSave}
          onPress={() => void save()} />
        {(saveStatus !== 'idle' || draft !== undefined) && <Text accessibilityLiveRegion="polite" style={saveStatus === 'error' ? ui.error : ui.muted}>
          {saveStatus === 'error' ? 'Không lưu được kế hoạch. Vui lòng thử lại.' :
            saveStatus === 'saved' ? 'Đã lưu kế hoạch.' :
              'Có thay đổi chưa lưu'}
        </Text>}
      </>}
    </View>
    {isAdmin && <TeamPlans plans={planError ? null : plans} />}
  </>;
}

function TeamPlans({ plans }: { plans: WeekPlans | null }) {
  const ui = useScreenStyles();
  const styles = useStyles();
  const { colors } = useTheme();
  const [team, setTeam] = useState<{ email: string; name: string }[] | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => watchPlanningTeam(setTeam, () => setError(true)), [retry]);

  return <View style={ui.panel}>
    <Text accessibilityRole="header" style={ui.cardTitle}>Kế hoạch đội nhóm</Text>
    {error ? <>
      <Text accessibilityRole="alert" style={ui.error}>Không tải được danh sách thành viên.</Text>
      <Button secondary label="Tải lại đội nhóm" onPress={() => {
        setError(false);
        setRetry(value => value + 1);
      }} />
    </> : !team ? <ActivityIndicator accessibilityLabel="Đang tải đội nhóm" color={colors.accent} /> :
      plans && (team.length === 0 ? <Text style={ui.muted}>Chưa có thành viên đang hoạt động.</Text> :
        <PaginatedList items={team}>
          {pageItems => pageItems.map(member => {
            const plan = plans.get(member.email);
            return <View key={member.email} style={ui.detailRow}>
              <View style={styles.memberHeader}>
                <Text style={[ui.label, styles.memberName]}>{member.name}</Text>
                <Text style={[ui.badge, plan ? styles.savedTag : styles.unsavedTag]}>{plan ? 'Đã lưu' : 'Chưa lưu'}</Text>
              </View>
              {plan && <Text style={ui.body}>{planContent(plan)}</Text>}
            </View>;
          })}
        </PaginatedList>)}
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  weekRange: { fontWeight: '600' },
  weekControls: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 4 },
  weekSteps: { flexDirection: 'row', gap: 4, flexShrink: 1 },
  weekStep: { paddingHorizontal: 6, flexShrink: 1 },
  calendarButton: { width: 44, height: 44, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  calendarIcon: { color: colors.accent, fontSize: 22, fontWeight: '700' },
  mirroredArrow: { transform: [{ scaleX: -1 }] },
  field: { gap: 6 },
  task: { minHeight: 44, paddingBottom: 4 },
  memberHeader: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  memberName: { flexShrink: 1 },
  savedTag: { color: colors.success, backgroundColor: colors.successSoft },
  unsavedTag: { color: colors.warning, backgroundColor: colors.warningSoft },
}));
