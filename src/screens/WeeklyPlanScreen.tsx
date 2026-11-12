import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/Button';
import { AssignmentCalendar } from '../features/tasks/AssignmentCalendar';
import { CalendarDialog } from '../features/tasks/CalendarDialog';
import { formatDue, formatTaskDate, shiftDay, todayInVietnam } from '../features/tasks/taskDates';
import type { Task } from '../features/tasks/tasks';
import { mondayOf, planContent, summarizeWeek, weeklyPlanTextLimit } from '../features/weekly-plan/weeklyPlan';
import { saveWeekPlan, watchPlanningTeam, watchWeekPlans } from '../features/weekly-plan/weeklyPlanStore';
import type { WeekPlans } from '../features/weekly-plan/weeklyPlanStore';
import type { usePlanningDrafts } from '../features/weekly-plan/usePlanningDrafts';
import { useScreenStyles } from '../theme/screenStyles';
import { createThemedStyles, useTheme } from '../theme/theme';

type WeeklyPlanProps = {
  email: string;
  isAdmin: boolean;
  tasks: Task[] | null;
  tasksError: boolean;
  onRetryTasks: () => void;
  onOpenTask: (id: string) => void;
};

type DraftStorage = ReturnType<typeof usePlanningDrafts>;

export function WeeklyPlanScreen({ selectedWeek, onSelectWeek, draftStorage, ...props }: WeeklyPlanProps & {
  selectedWeek?: string;
  onSelectWeek: (week: string) => void;
  draftStorage: DraftStorage;
}) {
  const ui = useScreenStyles();
  const styles = useStyles();
  const [saving, setSaving] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const currentWeek = mondayOf(todayInVietnam());
  const week = selectedWeek ?? currentWeek;
  const previousWeek = shiftDay(currentWeek, -7);
  const nextWeek = shiftDay(currentWeek, 7);
  const calendarSelected = week < previousWeek || week > nextWeek;
  const sunday = shiftDay(week, 6);
  return <>
    <View style={ui.stack}>
      <PageHeader title="Kế hoạch tuần" />
      <Text style={[ui.body, styles.weekRange]}>{formatTaskDate(week)} – {formatTaskDate(sunday)}</Text>
      <View style={styles.weekControls}>
        <View style={styles.weekSteps}>
          <Button secondary style={styles.weekStep} label="Tuần trước" selected={week === previousWeek}
            disabled={saving} onPress={() => onSelectWeek(previousWeek)} />
          <Button secondary style={styles.weekStep} label="Tuần này" selected={week === currentWeek}
            disabled={saving} onPress={() => onSelectWeek(currentWeek)} />
          <Button secondary style={styles.weekStep} label="Tuần sau" selected={week === nextWeek}
            disabled={saving} onPress={() => onSelectWeek(nextWeek)} />
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
      draftStorage={draftStorage} />
    {calendarOpen && <CalendarDialog title="Chọn tuần" onClose={() => setCalendarOpen(false)}>
      <Text style={ui.muted}>Chọn một ngày để xem cả tuần.</Text>
      <AssignmentCalendar initialDay={week} value={week} rangeEnd={sunday} disabled={saving} onSelect={day => {
        onSelectWeek(mondayOf(day));
        setCalendarOpen(false);
      }} />
    </CalendarDialog>}
  </>;
}

function WeekContent({ email, isAdmin, tasks, tasksError, onRetryTasks, onOpenTask, week, saving, onSavingChange, draftStorage }:
  WeeklyPlanProps & {
    week: string; saving: boolean; onSavingChange: (saving: boolean) => void;
    draftStorage: DraftStorage;
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

  const { suggested, completed } = summarizeWeek(tasks ?? [], email, week, shiftDay(week, 6));
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
        <View style={styles.summary}>
          <Text style={ui.body}><Text style={ui.label}>Việc gợi ý:</Text> {suggested.length}</Text>
          <Text style={ui.body}><Text style={ui.label}>Việc hoàn thành tuần trước:</Text> {completed}</Text>
        </View>
        {suggested.length === 0 && <Text style={ui.muted}>Chưa có công việc đến hạn trong tuần này.</Text>}
        {suggested.map(task => (
          <Pressable key={task.id} accessibilityRole="button" accessibilityHint="Mở chi tiết công việc"
            onPress={() => onOpenTask(task.id)}
            style={({ pressed }) => [ui.detailRow, styles.task, pressed && ui.dimmed]}>
            <Text style={ui.label}>{task.title}</Text>
            <Text style={task.status === 'Vướng' ? ui.error : ui.muted}>
              {[task.status, formatDue(task.due), task.priority].filter(Boolean).join(' · ')}
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
        team.map(member => {
          const plan = plans.get(member.email);
          return <View key={member.email} style={ui.detailRow}>
            <Text style={ui.label}>{member.name}</Text>
            <Text style={ui.muted}>{plan ? 'Đã lưu' : 'Chưa lưu kế hoạch'}</Text>
            {plan && <Text style={ui.body}>{planContent(plan)}</Text>}
          </View>;
        }))}
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  weekRange: { fontWeight: '600' },
  weekControls: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 4 },
  weekSteps: { flexDirection: 'row', gap: 4, flexShrink: 1 },
  weekStep: { paddingHorizontal: 6, flexShrink: 1 },
  calendarButton: { width: 44, height: 44, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  calendarIcon: { color: colors.accent, fontSize: 22, fontWeight: '700' },
  summary: { gap: 4 },
  field: { gap: 6 },
  task: { minHeight: 44, paddingBottom: 4 },
}));
