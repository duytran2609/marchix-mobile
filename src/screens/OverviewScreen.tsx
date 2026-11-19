import { PaginatedList } from '../components/PaginatedList';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { ReactNode } from 'react';
import { CardChevron } from '../components/CardChevron';
import { Button } from '../components/Button';
import { Dropdown } from '../components/Dropdown';
import { PageHeader } from '../components/PageHeader';
import { OverviewGreeting } from '../components/OverviewGreeting';
import { cashStatus, cashTotals, verifiedCash, vnd, watchCash } from '../features/cash/cash';
import type { Cash, CashAccess } from '../features/cash/cash';
import { projectMetrics, watchPilotProjectTasks, watchProjects } from '../features/projects/projects';
import type { Project } from '../features/projects/projects';
import { pendingRequest, watchRequests } from '../features/requests/requests';
import type { StaffRequest } from '../features/requests/requests';
import { formatDue, shiftDay, todayInVietnam } from '../features/tasks/taskDates';
import type { Task } from '../features/tasks/tasks';
import { taskStatusSummary } from '../features/tasks/taskStatusSummary';
import { statusTone } from '../features/tasks/TaskProgress';
import { mondayOf, suggestWeekTasks } from '../features/weekly-plan/weeklyPlan';
import type { WorkspaceRoute } from '../navigation/workspaceRoutes';
import { pilotMode } from '../services/firebase/firebase';
import { useScreenStyles } from '../theme/screenStyles';
import { createThemedStyles, lightColors, useTheme } from '../theme/theme';

type Load<T> = T[] | 'error' | null;
type Entry = { label: string; detail?: string; route: WorkspaceRoute };
const decisionFilters = [
  { value: 'all', label: 'Tất cả' }, { value: 'cho-duyet', label: 'Công việc' },
  { value: 'don-tu', label: 'Đơn từ' }, { value: 'thu-chi', label: 'Thu chi' }, { value: 'du-an', label: 'Dự án' },
] as const;
type DecisionFilter = typeof decisionFilters[number]['value'];
const waiting = (row: Cash) => ['Chờ thu', 'Chờ chi'].includes(cashStatus(row));
const amount = (rows: Cash[]) => rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
const taskRoute = (task: Task): WorkspaceRoute => ({
  screen: 'task-detail', task: { id: task.id, direct: true }, backTo: 'tong-quan',
});

function TaskRing({ counts, colors }: { counts: number[]; colors: string[] }) {
  const styles = useStyles();
  const total = counts.reduce((sum, count) => sum + count, 0);
  let start = 0;

  return <View accessible accessibilityLabel={`${total} công việc`} style={styles.ring}>
    <View aria-hidden style={StyleSheet.absoluteFill}>
      {counts.map((count, index) => {
        if (!count) return null;
        const sweep = 360 * count / total;
        const angle = start;
        start += sweep;
        // Each clipped semicircle covers up to 180 degrees on native and web.
        return [0, 180].filter(offset => offset < sweep).map(offset =>
          <View key={`${index}-${offset}`} style={[StyleSheet.absoluteFill, { transform: [{ rotate: `${angle + offset}deg` }] }]}>
            <View style={styles.ringWindow}>
              <View style={[styles.ringSweep, { transform: [{ rotate: `${Math.min(sweep - offset, 180)}deg` }] }]}>
                <View style={[styles.ringHalf, { backgroundColor: colors[index] }]} />
              </View>
            </View>
          </View>);
      })}
    </View>
    <View style={styles.ringCenter} aria-hidden>
      <Text style={styles.total}>{total}</Text>
      <Text style={styles.ringCaption}>công việc</Text>
    </View>
  </View>;
}

export function OverviewScreen({
  email, name, isAdmin, canReadCash, canReviewCash, canReviewRequests, personalTasks, tasksError, onRetryTasks, onNavigate,
}: CashAccess & {
  name: string;
  canReviewRequests: boolean;
  personalTasks: Task[] | null;
  tasksError: boolean;
  onRetryTasks: () => void;
  onNavigate: (route: WorkspaceRoute) => void;
}) {
  const styles = useStyles();
  const screen = useScreenStyles();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const [projects, setProjects] = useState<Load<Project>>(null);
  const [cash, setCash] = useState<Load<Cash>>(null);
  const [requests, setRequests] = useState<Load<StaffRequest>>(null);
  const [overviewTasks, setOverviewTasks] = useState<Load<Task>>(null);
  const [retry, setRetry] = useState(0);
  const [group, setGroup] = useState<string | null>(null);
  const [showDecisions, setShowDecisions] = useState(false);
  const [decisionFilter, setDecisionFilter] = useState<DecisionFilter>('all');
  const [showDebt, setShowDebt] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const useOverviewTasks = isAdmin || pilotMode;

  useEffect(() => {
    const stopProjects = watchProjects(setProjects, () => setProjects('error'));
    const stopCash = isAdmin || canReadCash
      ? watchCash({ email, isAdmin, canReadCash, canReviewCash }, setCash, () => setCash('error'))
      : undefined;
    const stopRequests = isAdmin
      ? watchRequests({ email, isAdmin, canReviewRequests }, setRequests, () => setRequests('error'))
      : undefined;
    const stopTasks = useOverviewTasks
      ? watchPilotProjectTasks(email, isAdmin, setOverviewTasks, () => setOverviewTasks('error'))
      : undefined;
    return () => { stopProjects(); stopCash?.(); stopRequests?.(); stopTasks?.(); };
  }, [email, isAdmin, canReadCash, canReviewCash, canReviewRequests, useOverviewTasks, retry]);

  function reload() {
    setProjects(null);
    setCash(null);
    setRequests(null);
    setOverviewTasks(null);
    if (tasksError) onRetryTasks();
    setRetry(value => value + 1);
  }

  const tasks = tasksError ? 'error' : personalTasks;
  const projectTasks = pilotMode ? overviewTasks : tasks;
  const decisionTasks = useOverviewTasks ? overviewTasks : tasks;
  const today = todayInVietnam();
  const nextWeek = shiftDay(today, 7);
  const weekEnd = shiftDay(mondayOf(today), 6);
  const myWeekTasks = Array.isArray(tasks) ? suggestWeekTasks(tasks, email, today, weekEnd) : [];
  const summary = taskStatusSummary(Array.isArray(tasks) ? tasks : []);
  const groups = summary.map(bucket => bucket.status);
  const grouped = summary.map(bucket => bucket.tasks);
  const selectedGroup = summary.find(bucket => bucket.status === group);
  const groupColors = groups.map(status => statusTone(status, colors).text);
  const ledger = Array.isArray(cash) ? cash : [];
  const scheduled = ledger.filter(row => waiting(row) && verifiedCash(row));
  const upcoming = scheduled.filter(row => row.dueDate >= today && row.dueDate <= nextWeek);
  const income = amount(upcoming.filter(row => row.type === 'thu'));
  const expense = amount(upcoming.filter(row => row.type === 'chi'));
  const month = today.slice(0, 7);
  const series = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(`${month}-01T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + index - 5);
    const key = date.toISOString().slice(0, 7);
    return { key, ...cashTotals(ledger.filter(row => row.date?.startsWith(key))) };
  });
  const maxCash = Math.max(1, ...series.flatMap(item => [item.income, item.expense]));
  const hasCashActivity = series.some(item => item.income > 0 || item.expense > 0);
  const cashMonth = series.find(item => item.key === selectedMonth) ?? series[series.length - 1];
  const pendingRequests = (Array.isArray(requests) ? requests : []).filter(row => row.status === pendingRequest);
  const lateCash = scheduled.filter(row => row.dueDate && row.dueDate < today);

  const decisions: Entry[] = [];
  const activeProjects = (Array.isArray(projects) ? projects : [])
    .filter(project => !['Xong', 'Tạm dừng'].includes(project.status))
    .map(project => {
      const rows = Array.isArray(projectTasks) ? projectTasks.filter(task => task.projectId === project.id) : [];
      const metrics = projectMetrics(rows, today);
      const risk = Boolean(project.risks?.trim() || (project.deadline && project.deadline <= nextWeek) ||
        rows.some(task => task.status === 'Vướng' || (task.status !== 'Xong' && task.due && task.due < today)));
      return { project, metrics, count: rows.length, risk };
    }).sort((a, b) => Number(b.risk) - Number(a.risk) ||
      (a.project.deadline || '9999').localeCompare(b.project.deadline || '9999'));

  if (isAdmin) {
    for (const task of Array.isArray(decisionTasks) ? decisionTasks : []) {
      if (task.status === 'Chờ duyệt') decisions.push({ label: task.title, detail: 'Công việc chờ duyệt', route: { screen: 'cho-duyet' } });
    }
    for (const row of pendingRequests) decisions.push({ label: row.reason || row.type, detail: 'Đơn từ chờ duyệt', route: { screen: 'don-tu' } });
    for (const row of ledger) {
      const status = cashStatus(row);
      const reason = status === 'Chờ duyệt' ? 'Thu chi chờ duyệt'
        : waiting(row) && !verifiedCash(row) ? 'Thiếu dấu vết duyệt'
        : waiting(row) && row.dueDate && row.dueDate <= nextWeek ? 'Khoản thu chi đến hạn'
        : ['Đã thu', 'Đã chi'].includes(status) && !String(row.ref ?? '').trim() ? 'Thiếu mã tham chiếu chứng từ' : '';
      if (reason) decisions.push({ label: row.note || row.partyName || 'Khoản thu chi',
        detail: `${reason} · ${vnd.format(row.amount)}`, route: { screen: 'thu-chi' } });
    }
    for (const { project, risk } of activeProjects) {
      if (risk) decisions.push({ label: project.name, detail: project.risks || 'Dự án cần chú ý',
        route: { screen: 'du-an', projectId: project.id } });
    }
  }

  function row(entry: Entry & { metadata?: ReactNode }, key: string | number) {
    return <Pressable key={key} accessibilityRole="button" onPress={() => onNavigate(entry.route)} style={styles.row}>
      <View style={styles.grow}>
        <Text style={screen.label}>{entry.label}</Text>
        {!!entry.detail && <Text style={screen.muted}>{entry.detail}</Text>}
        {entry.metadata}
      </View>
      <CardChevron />
    </Pressable>;
  }

  function projectField(label: string, value: string) {
    return <Text style={screen.muted}><Text style={styles.metaLabel}>{label}: </Text>{value}</Text>;
  }

  function card(title: string, children: ReactNode, options?: { primary?: boolean; action?: ReactNode }) {
    return <View style={[screen.panel, styles.card, width >= 760 && (options?.primary ? styles.widePrimary : styles.wide)]}>
      <View style={styles.cardHeading}>
        <Text accessibilityRole="header" style={[screen.cardTitle, styles.grow]}>{title}</Text>
        {options?.action}
      </View>
      {children}
    </View>;
  }

  function state(data: Load<unknown>, children: ReactNode) {
    if (data === 'error') return <Text style={screen.error}>Không tải được dữ liệu.</Text>;
    if (!data) return <ActivityIndicator color={colors.accent} accessibilityLabel="Đang tải dữ liệu" />;
    return children;
  }

  function bar(value: number, color: string) {
    return <View aria-hidden style={styles.track}>
      <View style={[styles.fill, { width: `${value}%`, backgroundColor: color }]} />
    </View>;
  }

  const sources = [tasks, projectTasks, projects, ...(isAdmin ? [cash, requests, decisionTasks] : canReadCash ? [cash] : [])];
  const unavailable = sources.includes('error');
  const entries = decisions.filter(entry => decisionFilter === 'all' || entry.route.screen === decisionFilter);
  const incomplete = sources.some(source => !Array.isArray(source));

  return <>
    <PageHeader title="Tổng quan" />
    <OverviewGreeting name={name} email={email} />
    {isAdmin && <View style={screen.choices}>
      <Button secondary label={incomplete ? 'Cần quyết định' : `Cần quyết định (${decisions.length})`}
        onPress={() => setShowDecisions(value => !value)} />
    </View>}
    {unavailable && <Button secondary label="Tải lại dữ liệu" onPress={reload} />}
    {isAdmin && showDecisions && <View style={screen.panel}>
      <Text accessibilityRole="header" style={screen.cardTitle}>Việc cần quyết định</Text>
      <Dropdown label="Loại việc" value={decisionFilter} choices={decisionFilters}
        onChange={setDecisionFilter} />
      {incomplete && <Text style={screen.muted}>{unavailable ? 'Một phần dữ liệu chưa tải được.' : 'Đang tải thêm dữ liệu…'}</Text>}
      <PaginatedList items={entries} resetKey={decisionFilter}>{pageItems => pageItems.map(row)}</PaginatedList>
      {!entries.length && !incomplete && <Text style={screen.muted}>Không có mục cần xử lý.</Text>}
    </View>}
    <View style={styles.grid}>
      {canReadCash && card('Dòng tiền thực tế', state(cash, <>
        <View style={styles.chartLegend}>
          <Text style={[screen.muted, styles.grow]}>6 tháng gần nhất</Text>
          <View style={styles.legendItem}>
            <View aria-hidden style={[styles.dot, { backgroundColor: colors.success }]} />
            <Text style={screen.muted}>Đã thu</Text>
          </View>
          <View style={styles.legendItem}>
            <View aria-hidden style={[styles.dot, { backgroundColor: colors.accent }]} />
            <Text style={screen.muted}>Đã chi</Text>
          </View>
        </View>
        <View style={styles.chart} aria-hidden>
          {series.map(item => <View key={item.key} style={[styles.chartMonth,
            hasCashActivity && item.key === cashMonth.key && styles.monthSelected]}>
            <View style={[styles.column, { height: `${100 * item.income / maxCash}%`, backgroundColor: colors.success }]} />
            <View style={[styles.column, { height: `${100 * item.expense / maxCash}%`, backgroundColor: colors.accent }]} />
          </View>)}
        </View>
        <View style={styles.months}>
          {series.map(item => <Pressable key={item.key} accessibilityRole="button"
            accessibilityLabel={`Tháng ${Number(item.key.slice(5))}/${item.key.slice(0, 4)}`}
            accessibilityState={{ selected: item.key === cashMonth.key }}
            aria-pressed={item.key === cashMonth.key}
            style={[styles.monthButton, item.key === cashMonth.key && styles.monthButtonSelected,
              hasCashActivity && item.key === cashMonth.key && styles.monthSelected]}
            onPress={() => setSelectedMonth(item.key)}>
            <Text style={item.key === cashMonth.key ? styles.link : screen.muted}>T{Number(item.key.slice(5))}</Text>
          </Pressable>)}
        </View>
        {cashMonth.income || cashMonth.expense ? <View style={screen.choices} accessibilityLiveRegion="polite">
          <Text style={screen.body}>Đã thu {vnd.format(cashMonth.income)}</Text>
          <Text style={screen.body}>Đã chi {vnd.format(cashMonth.expense)}</Text>
        </View> : <Text style={screen.muted} accessibilityLiveRegion="polite">Chưa ghi nhận khoản đã thu hoặc đã chi trong kỳ.</Text>}
        <Pressable accessibilityRole="button" style={styles.sectionAction} onPress={() => onNavigate({ screen: 'thu-chi' })}>
          <Text style={styles.sectionActionLabel}>Mở sổ Thu chi</Text>
        </Pressable>
      </>), { primary: true })}
      {card('Tình trạng công việc', state(tasks, <>
        <Text style={screen.muted}>Công việc tôi nhận hoặc giao, gồm cả việc đã xong.</Text>
        <View style={styles.taskSummary}>
          <TaskRing counts={grouped.map(items => items.length)} colors={groupColors} />
          <View style={styles.taskLegend}>
            {grouped.map((items, index) => <Pressable key={groups[index]} accessibilityRole="button"
              accessibilityState={{ expanded: group === groups[index], disabled: !items.length }} disabled={!items.length}
              onPress={() => setGroup(group === groups[index] ? null : groups[index])} style={styles.legendRow}>
              <View aria-hidden style={[styles.dot, { backgroundColor: groupColors[index] }]} />
              <Text style={[screen.label, styles.grow]}>{groups[index]}</Text>
              <Text style={screen.label}>{items.length}</Text>
            </Pressable>)}
          </View>
        </View>
        {selectedGroup && selectedGroup.tasks.length > 0 && <View style={screen.stack}>
          <Text accessibilityRole="header" style={screen.cardTitle}>{selectedGroup.status}</Text>
          {[...selectedGroup.tasks].sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'))
            .slice(0, 8).map(task => row({ label: task.title, detail: formatDue(task.due), route: taskRoute(task) }, task.id))}
          <Button secondary label="Mở Công việc" onPress={() => onNavigate({ screen: 'cong-viec' })} />
        </View>}
      </>))}
      {card('Tiến độ dự án', state(projects, <>
        {!activeProjects.length && <Text style={[screen.muted, styles.empty]}>Chưa có dự án đang theo dõi.</Text>}
        {activeProjects.slice(0, 4).map(({ project, metrics, count, risk }) => {
          const { progress, done } = metrics;
          const progressText = projectTasks === 'error' ? 'Không tải được' : !projectTasks ? 'Đang tải…' : progress === null
            ? 'Chưa có việc trong phạm vi xem' : `${progress}%`;
          return <View key={project.id}>
            {row({ label: project.name, route: { screen: 'du-an', projectId: project.id },
              metadata: <View style={styles.projectMetadata}>
                {risk && projectField('Theo dõi', 'Cần chú ý')}
                {progress !== null && projectField('Việc đã duyệt', `${done}/${count}`)}
                {projectField('Tiến độ', progressText)}
              </View> }, project.id)}
            {progress !== null && bar(progress, colors.accent)}
          </View>;
        })}
      </>), { primary: true, action: <Pressable accessibilityRole="button" style={styles.inlineAction}
        onPress={() => onNavigate({ screen: 'du-an' })}><Text style={styles.link}>Tất cả dự án</Text></Pressable> })}
      {isAdmin && card('Thu chi đến hạn', state(cash, <>
        <Text style={screen.muted}>7 ngày tới · Khoản đã duyệt</Text>
        <View style={styles.cardHeading}><Text style={screen.label}>Phải thu</Text><Text style={screen.label}>{vnd.format(income)}</Text></View>
        {bar(100 * income / Math.max(1, income, expense), colors.success)}
        <View style={styles.cardHeading}><Text style={screen.label}>Phải chi</Text><Text style={screen.label}>{vnd.format(expense)}</Text></View>
        {bar(100 * expense / Math.max(1, income, expense), colors.accent)}
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: showDebt }}
          style={styles.sectionAction} onPress={() => setShowDebt(value => !value)}>
          <Text style={styles.sectionActionLabel}>Chi tiết công nợ</Text>
        </Pressable>
        {showDebt && <>
          <Text style={screen.body}>Chênh lệch {vnd.format(income - expense)}</Text>
          <Text style={screen.muted}>{lateCash.length} khoản quá hạn · {scheduled.filter(item => !item.dueDate).length} khoản chưa có hạn</Text>
          <Button secondary label="Mở Thu chi" onPress={() => onNavigate({ screen: 'thu-chi' })} />
        </>}
      </>))}
      {card('Việc của tôi tuần này', state(tasks, <>
        {myWeekTasks.length === 0
          ? <Text style={screen.muted}>Bạn không có việc cần làm đến hạn từ hôm nay đến hết tuần.</Text>
          : myWeekTasks.slice(0, 3).map(task => row({
            label: task.title,
            detail: task.status === 'Vướng' ? `Đang vướng · ${formatDue(task.due)}` : formatDue(task.due),
            route: taskRoute(task),
          }, task.id))}
        <Pressable accessibilityRole="button" style={styles.sectionAction}
          onPress={() => onNavigate({ screen: 'ke-hoach-tuan' })}>
          <Text style={styles.sectionActionLabel}>Mở kế hoạch tuần</Text>
        </Pressable>
      </>), { primary: true })}
      {card('Truy cập nhanh', <>
        {row({ label: 'Chấm công', detail: 'Ghi giờ vào, giờ ra hoặc xem bảng công', route: { screen: 'cham-cong' } }, 'attendance')}
        {row({ label: 'Đơn từ', detail: 'Tạo đơn hoặc theo dõi đơn đã gửi', route: { screen: 'don-tu' } }, 'requests')}
        {row({ label: 'KPI', detail: 'Xem kết quả công việc theo tháng', route: { screen: 'kpi' } }, 'kpi')}
      </>)}
    </View>
  </>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch', gap: 14 },
  card: { width: '100%', gap: 10, padding: 16 },
  widePrimary: { flexBasis: '54%', flexGrow: 1 },
  wide: { flexBasis: '42%', flexGrow: 1 },
  cardHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  inlineAction: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  sectionAction: { alignSelf: 'stretch', minHeight: 48, paddingHorizontal: 16, paddingVertical: 10,
    alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: lightColors.accent },
  sectionActionLabel: { color: lightColors.onAccent, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  grow: { flex: 1, minWidth: 0 },
  projectMetadata: { gap: 2, marginTop: 4 },
  metaLabel: { color: colors.metadataLabel, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: colors.line },
  chart: { height: 140, flexDirection: 'row', gap: 4, borderBottomWidth: 1, borderBottomColor: colors.line },
  chartLegend: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  chartMonth: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', gap: 3, borderRadius: 6 },
  column: { width: '30%', maxWidth: 22, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  months: { flexDirection: 'row', gap: 4 },
  monthButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center',
    borderRadius: 6, borderWidth: 1, borderColor: colors.line },
  monthSelected: { backgroundColor: colors.accentSoft },
  monthButtonSelected: { borderColor: colors.accent },
  taskSummary: { alignItems: 'center', gap: 14 },
  taskLegend: { alignSelf: 'stretch' },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  ring: { width: 120, height: 120, borderRadius: 60, overflow: 'hidden', backgroundColor: colors.line,
    alignItems: 'center', justifyContent: 'center' },
  ringWindow: { position: 'absolute', left: 60, top: 0, width: 60, height: 120, overflow: 'hidden' },
  ringSweep: { position: 'absolute', left: -60, top: 0, width: 120, height: 120 },
  ringHalf: { width: 60, height: 120 },
  ringCenter: { width: 90, height: 90, borderRadius: 45, backgroundColor: colors.paper,
    alignItems: 'center', justifyContent: 'center' },
  ringCaption: { color: colors.muted, fontSize: 11 },
  empty: { textAlign: 'center', padding: 16, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.line },
  track: { height: 7, backgroundColor: colors.surfaceMuted, borderRadius: 8, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 8 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  total: { color: colors.ink, fontSize: 28, fontWeight: '800' },
  link: { color: colors.accent, fontWeight: '700' },
}));
