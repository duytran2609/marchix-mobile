import { memo, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { LayoutRectangle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SearchInput } from '../../components/SearchInput';
import { formatDue, formatTaskDate } from './taskDates';
import { TaskKanban } from './TaskKanban';
import { statusTone, taskStatus, TaskProgress } from './TaskProgress';
import { searchByName } from '../../utils/search';
import { taskPriorities, taskStatuses } from './tasks';
import type { Task } from './tasks';
import { colors } from '../../theme/theme';
import { ToastLayer } from '../../components/Toast';

const taskFilters = ['Tất cả', 'Chưa xong', 'Quá hạn', ...taskStatuses] as const;
const statusOptions = taskFilters.map(value => ({ value, label: value }));
const priorityFilters = ['', ...taskPriorities, 'Chưa đặt'] as const;
const priorityOptions = priorityFilters.map(value => ({ value, label: value || 'Tất cả' }));
const workDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
const overdueTone = statusTone('Vướng');
type TaskFilter = typeof taskFilters[number];
type PriorityFilter = typeof priorityFilters[number];
type TaskView = 'list' | 'kanban';

export type TaskBoardOptions = { search: string; filter: TaskFilter; assignee: string; priority: PriorityFilter; view: TaskView };
export const initialTaskBoardOptions: TaskBoardOptions = { search: '', filter: 'Tất cả', assignee: '', priority: '', view: 'list' };

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

const TaskCard = memo(function TaskCard({ task, today, onOpen, kanban = false, assigneeName }: {
  task: Task; today: string; onOpen: (task: Task) => void; kanban?: boolean; assigneeName: string;
}) {
  const overdueDays = daysOverdue(task, today);
  const overdueLabel = overdueDays > 0 ? `Quá hạn ${overdueDays} ngày` : '';
  const due = task.due === today && isOpenTask(task) ? 'Hạn hôm nay' : formatDue(task.due);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Mở công việc: ${task.title}`}
      accessibilityHint={`Người thực hiện: ${assigneeName}. ${taskStatus(task)}. ${overdueLabel ? `${overdueLabel}. ` : ''}${due}.`}
      onPress={() => onOpen(task)} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.cardHeader}>
        <Text numberOfLines={2} ellipsizeMode="tail" selectable={kanban ? false : undefined}
          style={styles.cardTitle}>{task.title}</Text>
        <Text style={styles.chevron}>›</Text>
      </View>
      <View style={styles.metadata}>
        <Text selectable={kanban ? false : undefined} style={styles.muted}>
          <Text style={styles.metaLabel}>Người thực hiện: </Text>{assigneeName}
        </Text>
        <Text selectable={kanban ? false : undefined} style={styles.muted}>
          <Text style={styles.metaLabel}>Hạn chót: </Text>
          <Text style={overdueLabel ? styles.danger : undefined}>
            {task.due ? formatTaskDate(task.due) : 'Chưa đặt'}
          </Text>
        </Text>
        <Text selectable={kanban ? false : undefined} style={[styles.muted, task.priority === 'Cao' && styles.danger]}>
          <Text style={styles.metaLabel}>Mức độ ưu tiên: </Text>{task.priority || 'Chưa đặt'}
        </Text>
      </View>
      {overdueLabel ? (
        <Text selectable={kanban ? false : undefined} style={styles.overdueTag}>{overdueLabel}</Text>
      ) : null}
      {!kanban && <TaskProgress task={task} />}
    </Pressable>
  );
});

function FilterDropdown<Value extends string>({ label, value, choices, onChange, singleLineValue = false }: {
  label: string; value: Value; choices: readonly { value: Value; label: string }[]; onChange: (value: Value) => void;
  singleLineValue?: boolean;
}) {
  const trigger = useRef<ComponentRef<typeof Pressable>>(null);
  const [anchor, setAnchor] = useState<LayoutRectangle | null>(null);
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const selectedLabel = choices.find(choice => choice.value === value)?.label ?? 'Tất cả';

  function open() {
    if (Keyboard.isVisible()) Keyboard.dismiss();
    trigger.current?.measureInWindow((x, y, width, height) => setAnchor({ x, y, width, height }));
  }

  function close() {
    setAnchor(null);
  }

  const edge = 8;
  const gap = 4;
  const menuWidth = Math.min(Math.max(anchor?.width ?? 0, 160), width - insets.left - insets.right - edge * 2);
  const left = Math.min(Math.max(insets.left + edge, anchor?.x ?? 0), width - insets.right - edge - menuWidth);
  const belowTop = (anchor?.y ?? 0) + (anchor?.height ?? 0) + gap;
  const aboveBottom = (anchor?.y ?? 0) - gap;
  const spaceBelow = height - insets.bottom - edge - belowTop;
  const spaceAbove = aboveBottom - insets.top - edge;
  const above = spaceBelow < Math.min(2, choices.length) * 44 + 10 && spaceAbove > spaceBelow;
  const maxHeight = Math.min(274, Math.max(0, above ? spaceAbove : spaceBelow));

  return (
    <View style={styles.filterField}>
      <Text style={styles.filterLabel}>{label}</Text>
      <Pressable ref={trigger} accessibilityRole="button" accessibilityLabel={`${label}: ${selectedLabel}`}
        aria-expanded={!!anchor} onPress={open}
        style={[styles.filterButton, { height: 44 * Math.max(1, fontScale) },
          (anchor || value !== choices[0]?.value) && styles.selected]}>
        <Text numberOfLines={singleLineValue ? 1 : 2} ellipsizeMode="tail"
          style={[styles.activeLabel, styles.filterTriggerValue]}>{selectedLabel}</Text>
        <Text aria-hidden style={[styles.activeLabel, styles.filterArrow]}>{anchor ? '▴' : '▾'}</Text>
      </Pressable>
      {anchor ? (
        <Modal transparent statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
          <View style={styles.filterOverlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={close} accessible={false}
              importantForAccessibility="no" tabIndex={-1} />
            <ScrollView keyboardShouldPersistTaps="handled"
              style={[styles.filterOptions, { left, width: menuWidth, maxHeight },
                above ? { bottom: height - aboveBottom } : { top: belowTop }]}>
              <View accessibilityRole="radiogroup" accessibilityLabel={`Lọc theo ${label.toLocaleLowerCase('vi')}`}
                style={styles.filterOptionsContent}>
                {choices.map(choice => (
                  <Pressable key={choice.value} accessibilityRole="radio" aria-checked={value === choice.value}
                    onPress={() => { close(); onChange(choice.value); }}
                    style={({ pressed }) => [styles.filterOption,
                      (value === choice.value || pressed) && styles.filterOptionSelected]}>
                    <Text style={[value === choice.value ? styles.activeLabel : styles.controlLabel, styles.filterValue]}>
                      {choice.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>
          <ToastLayer />
        </Modal>
      ) : null}
    </View>
  );
}

export function TaskBoard({ tasks, member, options, onOptionsChange, onOpen, onDragChange }: {
  tasks: Task[]; member: { email: string; name: string };
  options: TaskBoardOptions; onOptionsChange: (options: TaskBoardOptions) => void;
  onOpen: (task: Task) => void;
  onDragChange: (dragging: boolean) => void;
}) {
  const { search, filter, priority, view } = options;
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
  const scopedTasks = tasks.filter(task => (!assignee || assigneeKey(task) === assignee) &&
    (!priority || (task.priority || 'Chưa đặt') === priority));
  const { width } = useWindowDimensions();
  const today = workDate.format(new Date());
  const stats = [
    { label: 'Chưa xong', value: scopedTasks.filter(isOpenTask).length, tone: statusTone('Đang làm') },
    { label: 'Quá hạn', value: scopedTasks.filter(task => daysOverdue(task, today) > 0).length, tone: overdueTone },
    { label: 'Chờ duyệt', value: scopedTasks.filter(task => task.status === 'Chờ duyệt').length, tone: statusTone('Chờ duyệt') },
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
          <FilterDropdown label="Trạng thái" value={filter} choices={statusOptions} onChange={selectFilter} />
          <FilterDropdown label="Người thực hiện" value={assignee} choices={assigneeOptions} singleLineValue
            onChange={value => onOptionsChange({ ...options, assignee: value })} />
          <FilterDropdown label="Mức độ ưu tiên" value={priority} choices={priorityOptions}
            onChange={value => onOptionsChange({ ...options, priority: value })} />
        </View>
        <View style={styles.views} accessibilityLabel="Kiểu xem công việc">
          {(['list', 'kanban'] as const).map((value: TaskView) => (
            <Pressable key={value} accessibilityRole="button" aria-pressed={view === value}
              onPress={() => onOptionsChange({ ...options, view: value })}
              style={[styles.viewButton, view === value && styles.activeView]}>
              <Text style={[styles.controlLabel, view === value && styles.activeLabel]}>
                {value === 'list' ? 'Danh sách' : 'Bảng Kanban'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={styles.results}>
        <Text accessibilityRole="header" style={styles.resultTitle}>{visibleTasks.length} công việc</Text>
        {search || filter !== 'Tất cả' || assignee || priority ? (
          <Pressable accessibilityRole="button" onPress={() => onOptionsChange({ ...initialTaskBoardOptions, view })}
            style={styles.clearButton}><Text style={styles.activeLabel}>Xóa bộ lọc</Text></Pressable>
        ) : null}
      </View>
      {visibleTasks.length === 0 ? <View style={styles.card}>
        <Text accessibilityLiveRegion="polite" style={styles.cardTitle}>{showNoMatch ? 'Không có việc phù hợp' : 'Chưa có công việc được giao'}</Text>
        <Text style={styles.muted}>{showNoMatch ? 'Thử đổi từ khóa hoặc xóa bộ lọc.' : 'Việc mới sẽ xuất hiện ở đây khi được giao cho bạn.'}</Text>
      </View> : view === 'list' ? visibleTasks.map(task => (
        <TaskCard key={task.id} task={task} today={today} onOpen={onOpen} assigneeName={assigneeName(task)} />
      )) : (
        <TaskKanban columns={columns} columnWidth={Math.min(290, width * 0.74)} email={member.email}
          columnColor={status => statusTone(status).text} onOpen={onOpen} onDragChange={onDragChange}
          renderCard={(task, open) => <TaskCard task={task} today={today} onOpen={open} assigneeName={assigneeName(task)} kanban />} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  board: { gap: 12 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, minWidth: 0, minHeight: 72, alignItems: 'center', gap: 3,
    paddingVertical: 10, paddingHorizontal: 6, borderWidth: 1, borderRadius: 13, borderColor: colors.line },
  statValue: { fontSize: 28, fontWeight: '800', textAlign: 'center' },
  statLabel: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  controls: { padding: 12, gap: 10, borderWidth: 1, borderColor: colors.line, borderRadius: 14, backgroundColor: colors.paper },
  views: { flexDirection: 'row', gap: 4, padding: 3, borderRadius: 10, backgroundColor: colors.surfaceMuted },
  viewButton: { flex: 1, minHeight: 44, paddingHorizontal: 6, paddingVertical: 8, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center' },
  activeView: { backgroundColor: colors.paper },
  controlLabel: { color: colors.muted, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  activeLabel: { color: colors.accent, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  search: { minHeight: 44, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 9,
    color: colors.ink, fontSize: 16 },
  filterRow: { flexDirection: 'row', gap: 6 },
  filterField: { flexBasis: 0, flexGrow: 1, minWidth: 0, gap: 5 },
  filterLabel: { flexGrow: 1, color: colors.muted, fontSize: 12, fontWeight: '700', textAlign: 'left' },
  filterButton: { width: '100%', flexDirection: 'row', alignItems: 'center',
    gap: 4, paddingHorizontal: 6, borderWidth: 1, borderColor: colors.line, borderRadius: 9, backgroundColor: colors.paper },
  filterTriggerValue: { flex: 1, minWidth: 0, textAlign: 'left' },
  filterArrow: { flexShrink: 0 },
  filterValue: { flexShrink: 1, textAlign: 'left' },
  filterOverlay: { flex: 1 },
  filterOptions: { position: 'absolute', borderWidth: 1, borderColor: colors.line, borderRadius: 9,
    backgroundColor: colors.paper, boxShadow: '0 8px 22px rgba(33, 25, 53, 0.18)' },
  filterOptionsContent: { padding: 4 },
  filterOption: { minHeight: 44, alignItems: 'flex-start', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 6 },
  filterOptionSelected: { backgroundColor: colors.accentSoft },
  selected: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  results: { minHeight: 34, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resultTitle: { fontSize: 15, fontWeight: '800', color: colors.ink },
  clearButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  card: { gap: 9, padding: 13, borderWidth: 1, borderColor: colors.line, borderRadius: 13, backgroundColor: colors.paper },
  pressed: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { flex: 1, color: colors.ink, fontSize: 16, fontWeight: '800' },
  chevron: { fontSize: 20, lineHeight: 22, color: colors.muted },
  metadata: { gap: 5 },
  metaLabel: { fontWeight: '700' },
  muted: { color: colors.muted, fontSize: 13 },
  danger: { color: colors.danger, fontWeight: '700' },
  overdueTag: { alignSelf: 'flex-start', overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
    color: overdueTone.text, backgroundColor: overdueTone.background, fontSize: 12, fontWeight: '700' },






});
