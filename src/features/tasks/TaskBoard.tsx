import { PaginatedList } from '../../components/PaginatedList';
import { memo, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { ClickableCardHeader } from '../../components/CardChevron';
import { Dropdown } from '../../components/Dropdown';
import { PeopleSummary } from '../../components/PeopleSummary';
import { SearchInput } from '../../components/SearchInput';
import { SegmentedButtons } from '../../components/SegmentedButtons';
import { formatDue, formatTaskDate, todayInVietnam } from './taskDates';
import { TaskGantt } from './TaskGantt';
import { TaskKanban } from './TaskKanban';
import { TaskPriority } from './TaskPriority';
import { statusTone, taskStatus, TaskProgress } from './TaskProgress';
import { searchByName } from '../../utils/search';
import { listTaskAssignees, taskPriorities, taskStatuses } from './tasks';
import type { AssignmentProject, Task, TaskAssignee } from './tasks';
import { auth, taskAssignmentEnabled } from '../../services/firebase/firebase';
import { createThemedStyles, useTheme } from '../../theme/theme';

const taskFilters = ['Tất cả', 'Chưa xong', 'Quá hạn', ...taskStatuses] as const;
const statusOptions = taskFilters.map(value => ({ value, label: value }));
const priorityFilters = ['', ...taskPriorities, 'Chưa đặt'] as const;
const priorityOptions = priorityFilters.map(value => ({ value, label: value || 'Tất cả' }));
type TaskFilter = typeof taskFilters[number];
type PriorityFilter = typeof priorityFilters[number];
type TaskView = 'list' | 'kanban' | 'gantt';

export type TaskBoardOptions = {
  search: string; filter: TaskFilter; assignee: string; priority: PriorityFilter; project: string | null; view: TaskView;
};
export const initialTaskBoardOptions: TaskBoardOptions = {
  search: '', filter: 'Tất cả', assignee: '', priority: '', project: null, view: 'list',
};

function isOpenTask(task: Task) {
  return task.status !== 'Xong' && task.status !== 'Chờ duyệt';
}

function daysOverdue(task: Task, today: string) {
  if (!isOpenTask(task) || !task.due || !/^\d{4}-\d{2}-\d{2}$/.test(task.due) || task.due >= today) return 0;

  // Date-only ISO values parse at UTC midnight, so the difference counts calendar days.
  const deadline = new Date(task.due);
  if (!Number.isFinite(deadline.getTime()) || deadline.toISOString().slice(0, 10) !== task.due) return 0;
  return (Date.parse(today) - deadline.getTime()) / 86_400_000;
}

function assigneeKey(task: Task) {
  const name = task.assignee?.trim();
  return task.assigneeEmail || (name ? `name:${name}` : '');
}

function TaskPerson({ label, name, photoURL, selectable, fallback = 'Chưa rõ' }: {
  label: string; name?: string; photoURL?: string | null; selectable?: boolean; fallback?: string;
}) {
  const styles = useStyles();
  return (
    <View style={[styles.metadataRow, styles.personRow]}>
      <Text selectable={selectable} style={[styles.muted, styles.metaLabel]}>{label}: </Text>
      <PeopleSummary people={[{ id: name || '', name: name || fallback, photoURL }]}
        textStyle={styles.personName} selectable={selectable} />
    </View>
  );
}

const TaskCard = memo(function TaskCard({
  task, today, onOpen, kanban = false, assigneeName, assigneePhoto, assignerName, assignerPhoto,
}: {
  task: Task; today: string; onOpen: (task: Task) => void; kanban?: boolean; assigneeName: string;
  assigneePhoto?: string | null; assignerName?: string; assignerPhoto?: string | null;
}) {
  const styles = useStyles();
  const selectable = kanban ? false : undefined;
  const overdueDays = daysOverdue(task, today);
  const overdueLabel = overdueDays > 0 ? `Quá hạn ${overdueDays} ngày` : '';
  const due = task.due === today && isOpenTask(task) ? 'Hạn hôm nay' : formatDue(task.due);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Mở công việc: ${task.title}`}
      accessibilityHint={`Người giao việc: ${assignerName || 'Chưa rõ'}. Người thực hiện: ${assigneeName}. ${taskStatus(task)}. ${due}.${overdueLabel ? ` ${overdueLabel}.` : ''}`}
      onPress={() => onOpen(task)} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <ClickableCardHeader>
        <Text numberOfLines={2} ellipsizeMode="tail" selectable={selectable}
          style={styles.cardTitle}>{task.title}</Text>
      </ClickableCardHeader>
      <View style={styles.metadata}>
        <TaskPerson label="Người giao việc" name={assignerName} photoURL={assignerPhoto} selectable={selectable} />
        <TaskPerson label="Người thực hiện" name={assigneeKey(task) ? assigneeName : undefined}
          photoURL={assigneePhoto} fallback={assigneeName} selectable={selectable} />
        <View style={[styles.metadataRow, styles.dueRow]}>
          <Text selectable={selectable} style={styles.muted}>
            <Text style={styles.metaLabel}>Hạn chót: </Text>
            <Text style={overdueLabel ? styles.danger : undefined}>
              {task.due ? formatTaskDate(task.due) : 'Chưa đặt'}
            </Text>
          </Text>
          {overdueLabel ? (
            <Text selectable={selectable} style={styles.overdueTag}>{overdueLabel}</Text>
          ) : null}
        </View>
        <View style={styles.metadataRow}>
          <Text selectable={selectable} style={styles.muted}>
            <Text style={styles.metaLabel}>Mức độ ưu tiên: </Text>
            <TaskPriority priority={task.priority} />
          </Text>
        </View>
      </View>
      <TaskProgress task={task} variant="list" />
    </Pressable>
  );
});

export function TaskBoard({ tasks, member, showTeamTasks = false, projects, options, onOptionsChange, onOpen, onDragChange }: {
  tasks: Task[]; member: { email: string; name: string };
  showTeamTasks?: boolean;
  projects?: AssignmentProject[];
  options: TaskBoardOptions; onOptionsChange: (options: TaskBoardOptions) => void;
  onOpen: (task: Task) => void;
  onDragChange: (dragging: boolean) => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { search, filter, priority, project, view } = options;
  const { width } = useWindowDimensions();
  const filterField = [styles.filterField, projects && width < 600 && styles.halfFilterField];
  const [directory, setDirectory] = useState<{ email: string; members: Map<string, TaskAssignee> }>();
  const memberEmail = member.email;
  const needsDirectory = taskAssignmentEnabled && tasks.length > 0;
  const members = directory?.email === memberEmail ? directory.members : undefined;
  const hasDirectory = Boolean(members);
  useEffect(() => {
    if (!needsDirectory || hasDirectory) return;
    let active = true;
    void listTaskAssignees().then(({ data }) => {
      if (active) setDirectory({ email: memberEmail, members: new Map(data.members.map(person => [person.email, person])) });
    }).catch(() => { /* Task data still provides a fallback when the directory is unavailable. */ });
    return () => { active = false; };
  }, [hasDirectory, memberEmail, needsDirectory]);
  const assigneeNames = new Map<string, string>();
  for (const task of tasks) {
    const key = assigneeKey(task);
    if (key && (!assigneeNames.has(key) || assigneeNames.get(key) === key)) {
      assigneeNames.set(key, (key === member.email ? member.name : task.assignee?.trim()) || key);
    }
  }
  const assigneeOptions = [
    { value: '', label: 'Tất cả' },
    ...Array.from(assigneeNames, ([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'vi')),
  ];
  const assignee = assigneeNames.has(options.assignee) ? options.assignee : '';
  const projectNames = new Map(projects?.map(item => [item.id, item.name]));
  const projectOptions = Array.from(new Set(tasks.map(task => task.projectId || '').filter(Boolean)), id => ({
    value: id, label: projectNames.get(id) || id,
  })).sort((a, b) => a.label.localeCompare(b.label, 'vi'));
  const scopedTasks = tasks.filter(task => (!assignee || assigneeKey(task) === assignee) &&
    (!priority || (task.priority || 'Chưa đặt') === priority) &&
    (project === null || (task.projectId || '') === project));
  const today = todayInVietnam();
  const stats = [
    { label: 'Chưa xong', value: scopedTasks.filter(isOpenTask).length, tone: statusTone('Đang làm', colors) },
    { label: 'Quá hạn', value: scopedTasks.filter(task => daysOverdue(task, today) > 0).length, tone: statusTone('Vướng', colors) },
    { label: 'Chờ duyệt', value: scopedTasks.filter(task => task.status === 'Chờ duyệt').length, tone: statusTone('Chờ duyệt', colors) },
    { label: 'Đã xong', value: scopedTasks.filter(task => task.status === 'Xong').length, tone: { text: '#23613A', background: '#E5F5E9' } },
  ] as const;
  const filteredTasks = scopedTasks.filter(task => {
    const status = taskStatus(task);
    return filter === 'Tất cả' || filter === status ||
      (filter === 'Chưa xong' && isOpenTask(task)) || (filter === 'Quá hạn' && daysOverdue(task, today) > 0);
  });
  const visibleTasks = searchByName(filteredTasks, search, task => task.title);
  const showNoMatch = tasks.length > 0 || search.trim().length > 0;
  const columns = [...taskStatuses, 'Khác'].map(status => ({
    status,
    tasks: visibleTasks.filter(task => status === 'Khác'
      ? !taskStatuses.some(value => value === taskStatus(task))
      : taskStatus(task) === status),
  })).filter(column => (filter === 'Tất cả' && column.status !== 'Khác') || column.tasks.length > 0);

  function selectFilter(value: TaskFilter) {
    onOptionsChange({ ...options, filter: value });
  }

  function assigneeName(task: Task) {
    return assigneeNames.get(assigneeKey(task)) ?? 'Chưa chỉ định';
  }

  function photoFor(email?: string) {
    if (!email) return undefined;
    return members?.get(email)?.photoURL || (email === memberEmail ? auth.currentUser?.photoURL : undefined);
  }

  function renderTaskCard(task: Task, open: (task: Task) => void, kanban = false) {
    const assigner = task.assignedBy?.trim();
    const assignee = task.assigneeEmail;
    const storedAssigneeName = assigneeName(task);
    return <TaskCard key={task.id} task={task} today={today} onOpen={open} kanban={kanban}
      assigneeName={storedAssigneeName === assignee ? members?.get(assignee)?.name || storedAssigneeName : storedAssigneeName}
      assigneePhoto={photoFor(assignee)}
      assignerName={assigner === memberEmail ? member.name : assigner && (members?.get(assigner)?.name || assigner)}
      assignerPhoto={photoFor(assigner)} />;
  }

  return (
    <View style={styles.board}>
      <View style={styles.stats}>
        {stats.map(stat => (
          <View key={stat.label} accessible accessibilityLabel={`${stat.label}: ${stat.value} công việc`}
            style={[styles.stat, { backgroundColor: stat.tone.background }]}>
            <Text style={[styles.statValue, { color: stat.tone.text }]}>{stat.value}</Text>
            <Text style={[styles.statLabel, { color: stat.tone.text }]}>{stat.label}</Text>
          </View>
        ))}
      </View>
      <View style={styles.controls}>
        <SearchInput accessibilityLabel="Tìm tên công việc" placeholder="Tìm tên công việc"
          placeholderTextColor={colors.muted} style={styles.search} value={search} returnKeyType="search"
          onChangeText={value => onOptionsChange({ ...options, search: value })} />
        <View style={styles.filterRow}>
          <Dropdown style={filterField} label="Trạng thái" menuLabel="Lọc theo trạng thái" fallbackLabel="Tất cả" value={filter} choices={statusOptions} onChange={selectFilter} />
          <Dropdown style={filterField} label="Người thực hiện" menuLabel="Lọc theo người thực hiện" fallbackLabel="Tất cả" value={assignee} choices={assigneeOptions} singleLineValue
            onChange={value => onOptionsChange({ ...options, assignee: value })} />
          <Dropdown style={filterField} label="Mức độ ưu tiên" menuLabel="Lọc theo mức độ ưu tiên" fallbackLabel="Tất cả" value={priority} choices={priorityOptions}
            onChange={value => onOptionsChange({ ...options, priority: value })} />
          {projects && <Dropdown style={filterField} label="Hạng mục" menuLabel="Lọc theo hạng mục"
            value={project ?? 0}
            choices={[{ value: 0, label: 'Tất cả' }, { value: '', label: 'Chung toàn công ty' }, ...projectOptions]}
            fallbackLabel={project || 'Tất cả'}
            onChange={value => onOptionsChange({ ...options, project: value === 0 ? null : value })} />}
        </View>
        <SegmentedButtons label="Kiểu xem công việc" value={view}
          choices={[{ value: 'list', label: 'Danh sách' }, { value: 'kanban', label: 'Bảng Kanban' },
            { value: 'gantt', label: 'Biểu đồ Gantt' }]}
          onChange={view => onOptionsChange({ ...options, view })} />
      </View>
      <View style={styles.results}>
        <Text accessibilityRole="header" style={styles.resultTitle}>{visibleTasks.length} công việc</Text>
        {search || filter !== 'Tất cả' || assignee || priority || project !== null ? (
          <Pressable accessibilityRole="button" onPress={() => onOptionsChange({ ...initialTaskBoardOptions, view })}
            style={styles.clearButton}><Text style={styles.activeLabel}>Xóa bộ lọc</Text></Pressable>
        ) : null}
      </View>
      {visibleTasks.length === 0 ? <View style={styles.card}>
        <Text accessibilityLiveRegion="polite" style={styles.cardTitle}>
          {showNoMatch ? 'Không có việc phù hợp' : showTeamTasks ? 'Chưa có công việc' : 'Chưa có công việc được giao'}
        </Text>
        {showNoMatch ? <Text style={styles.muted}>Thử đổi từ khóa hoặc xóa bộ lọc.</Text> :
          !showTeamTasks ? <Text style={styles.muted}>Việc mới sẽ xuất hiện ở đây khi được giao cho bạn.</Text> : null}
      </View> : view === 'list' ? <PaginatedList items={visibleTasks} resetKey={JSON.stringify(options)}>
        {pageItems => pageItems.map(task => renderTaskCard(task, onOpen))}
      </PaginatedList> : view === 'gantt' ? (
        <TaskGantt tasks={visibleTasks} today={today} onOpen={onOpen} />
      ) : (
        <TaskKanban columns={columns} columnWidth={Math.min(290, width * 0.74)} email={member.email}
          columnColor={status => statusTone(status, colors).text} onOpen={onOpen} onDragChange={onDragChange}
          renderCard={(task, open) => renderTaskCard(task, open, true)} />
      )}
    </View>
  );
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  board: { gap: 12 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, minWidth: 0, minHeight: 72, alignItems: 'center', gap: 3,
    paddingVertical: 10, paddingHorizontal: 6, borderWidth: 1, borderRadius: 13, borderColor: colors.line },
  statValue: { fontSize: 28, fontWeight: '800', textAlign: 'center' },
  statLabel: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  controls: { padding: 12, gap: 10, borderWidth: 1, borderColor: colors.line, borderRadius: 14, backgroundColor: colors.paper },
  activeLabel: { color: colors.accent, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  search: { minHeight: 44, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 9,
    color: colors.ink, fontSize: 16 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  filterField: { flexBasis: 0, flexGrow: 1, minWidth: 0 },
  halfFilterField: { flexBasis: '45%' },
  results: { minHeight: 34, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resultTitle: { fontSize: 15, fontWeight: '800', color: colors.ink },
  clearButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  card: { gap: 9, padding: 13, borderWidth: 1, borderColor: colors.line, borderRadius: 13, backgroundColor: colors.paper },
  pressed: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  cardTitle: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  metadata: { gap: 5 },
  metadataRow: { minHeight: 22, justifyContent: 'center' },
  personRow: { flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center', gap: 4 },
  dueRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', alignItems: 'center', gap: 6 },
  personName: { color: colors.muted, fontSize: 13, fontWeight: '400' },
  metaLabel: { color: colors.metadataLabel, fontWeight: '700' },
  muted: { color: colors.muted, fontSize: 13 },
  danger: { color: colors.danger, fontWeight: '700' },
  overdueTag: { overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
    color: colors.danger, backgroundColor: colors.dangerSoft, fontSize: 12, fontWeight: '700' },






}));
