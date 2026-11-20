import { PaginatedList } from '../components/PaginatedList';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { PageHeader } from '../components/PageHeader';
import { Dropdown } from '../components/Dropdown';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { Metric, useMetricStyles } from '../components/Metric';
import { kpiForMonth, kpiGrade, kpiMonths } from '../features/kpi/kpi';
import type { KpiMember, KpiRow } from '../features/kpi/kpi';
import { watchKpi } from '../features/kpi/kpiStore';
import type { KpiData } from '../features/kpi/kpiStore';
import { todayInVietnam } from '../features/tasks/taskDates';
import { taskStatuses } from '../features/tasks/taskStatuses';
import { useScreenStyles } from '../theme/screenStyles';
import { createThemedStyles, useTheme } from '../theme/theme';
import { formatMonthLabel, formatVietnamDateTime } from '../utils/dateTime';

export function KpiScreen({ email, name, isAdmin }: KpiMember & { isAdmin: boolean }) {
  const ui = useScreenStyles();
  const styles = useStyles();
  const { colors } = useTheme();
  const [data, setData] = useState<KpiData | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [today, setToday] = useState(todayInVietnam);
  const [month, setMonth] = useState('');
  const [project, setProject] = useState('');
  const [showRules, setShowRules] = useState(false);

  useEffect(() => watchKpi({ email, name }, isAdmin, setData, () => setError(true)), [email, name, isAdmin, retry]);
  useEffect(() => {
    const timer = setInterval(() => setToday(todayInVietnam()), 30000);
    return () => clearInterval(timer);
  }, []);

  if (error || !data) return <>
    <PageHeader title="KPI theo công việc" />
    {error ? <View style={ui.panel}>
      <Text accessibilityRole="alert" style={ui.error}>Không tải được dữ liệu KPI. Kiểm tra kết nối hoặc quyền truy cập.</Text>
      <Button label="Thử lại" onPress={() => { setData(null); setError(false); setRetry(value => value + 1); }} />
    </View> : <ActivityIndicator accessibilityLabel="Đang tải KPI" color={colors.accent} />}
  </>;

  const { tasks, snapshots, members, projects } = data;
  const months = kpiMonths(today, tasks, snapshots);
  const selectedMonth = months.includes(month) ? month : months[0];
  const projectOptions = [{ id: '', label: 'Toàn công ty' },
    ...projects.filter(item => item.status !== 'Xong').map(item => ({ id: item.id, label: item.name }))];
  const selectedProject = projectOptions.find(item => item.id === project) ?? projectOptions[0];
  const { rows, locked, lockedAt } = kpiForMonth(selectedMonth, selectedProject.id, today, tasks, snapshots, members);
  const lockedTime = formatVietnamDateTime(lockedAt);
  const names = new Map(members.map(member => [member.email, member.name]));

  return <>
    <PageHeader title="KPI theo công việc" />
    <View style={ui.panel}>
      <View style={styles.filters}>
        <Dropdown style={styles.filter} label="Tháng" value={selectedMonth}
          choices={months.map(value => ({ value, label: formatMonthLabel(value) }))} onChange={setMonth} />
        <Dropdown style={styles.filter} label="Dự án" value={selectedProject.id}
          choices={projectOptions.map(({ id, label }) => ({ value: id, label }))} onChange={setProject} />
      </View>
      <Text style={ui.muted}>{locked
        ? lockedTime ? `Điểm đã chốt tự động: ${lockedTime}.` : 'Điểm đã chốt tự động.'
        : selectedProject.id ? 'Điểm tạm tính theo công việc của dự án.'
          : 'Điểm tạm tính theo thời gian thực. Hệ thống tự chốt vào ngày 1 tháng sau.'}</Text>
      {locked && <Text style={ui.muted}>Các ô trạng thái phản ánh trạng thái hiện tại của công việc.</Text>}
      <View style={[styles.rulesFrame, showRules && styles.rulesExpanded]}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: showRules }}
          onPress={() => setShowRules(value => !value)} style={styles.rulesButton}>
          <Text style={styles.rulesLabel}>Cách tính KPI {showRules ? '▴' : '▾'}</Text>
        </Pressable>
        {showRules && <KpiRules />}
      </View>
    </View>
    {rows.length ? <PaginatedList items={rows} resetKey={JSON.stringify([month, project])}>
      {pageItems => pageItems.map(row => {
        const legacy = row.email.startsWith('ten:');
        const label = legacy ? row.email.slice(4) : names.get(row.email) || row.email.split('@')[0];
        return <KpiCard key={row.email} row={row} label={label} legacy={legacy} />;
      })}
    </PaginatedList> : <View style={ui.panel}>
      <EmptyState icon="chart" message="Chưa có việc nào có hạn trong tháng này." />
    </View>}
    {isAdmin && rows.some(row => row.email.startsWith('ten:')) && <View style={ui.panel}>
      <Text style={ui.muted}>Một số việc chỉ có tên người làm. Hãy gắn tài khoản có email khi chọn người làm để KPI hiển thị đúng cho nhân viên.</Text>
    </View>}
  </>;
}

const ruleGroups = [
  {
    title: 'Công việc được tính',
    formula: null,
    items: ['Công việc có hạn chót trong tháng đã chọn.',
      'Việc Xong hoặc Chờ duyệt cần có thời điểm hoàn thành. Việc chưa hoàn thành chỉ được tính khi đã qua hạn.'],
  },
  {
    title: 'Điểm từng công việc',
    formula: 'Điểm đạt được = Trọng số ưu tiên × Hệ số đúng hạn × Hệ số đánh giá.',
    items: ['Trọng số ưu tiên: Cao 3 điểm, Trung bình 2 điểm, Thấp 1 điểm. Việc chưa đặt mức ưu tiên dùng trọng số 2.',
      'Hệ số đúng hạn: Hoàn thành đúng hạn 100%, hoàn thành trễ hạn 50%, quá hạn chưa hoàn thành 0%.',
      'Hệ số đánh giá: Xuất sắc hoặc Tốt 100%, Khá 90%, Trung bình 75%, Kém 50%. Việc chưa được đánh giá dùng hệ số 100%.'],
  },
  {
    title: 'Điểm KPI và xếp loại',
    formula: 'KPI (%) = Tổng điểm đạt được ÷ Tổng trọng số của các việc được tính × 100.',
    items: ['Kết quả được làm tròn đến số nguyên.',
      'A: từ 90%. B: từ 75% đến dưới 90%. C: từ 60% đến dưới 75%. D: dưới 60%.',
      'Nếu có việc trong tháng nhưng chưa việc nào đủ điều kiện tính điểm, KPI hiển thị dấu “–”.'],
  },
] as const;

function KpiRules() {
  const ui = useScreenStyles();
  const styles = useStyles();
  return <View style={styles.rulesContent}>
    {ruleGroups.map(({ title, items, formula }) => <View key={title} style={styles.ruleGroup}>
      <Text accessibilityRole="header" style={styles.rulesLabel}>{title}</Text>
      {formula && <Text style={[ui.body, styles.formula]}>{formula}</Text>}
      {items.map(item => <View key={item} style={styles.ruleItem}>
        <Text aria-hidden style={ui.body}>•</Text>
        <Text style={[ui.body, styles.ruleText]}>{item}</Text>
      </View>)}
    </View>)}
  </View>;
}

function KpiCard({ row, label, legacy }: { row: KpiRow; label: string; legacy: boolean }) {
  const ui = useScreenStyles();
  const styles = useStyles();
  const metricStyles = useMetricStyles();
  const { colors } = useTheme();
  const grade = row.grade || kpiGrade(row.pct);
  const gradeColors = { A: colors.success, B: colors.accent, C: colors.warning, D: colors.danger };
  const color = gradeColors[grade as keyof typeof gradeColors] ?? colors.muted;
  const statuses = row.statusCounts.Khác ? [...taskStatuses, 'Khác' as const] : taskStatuses;

  return <View style={ui.panel}>
    <View style={styles.cardHeader}>
      <View style={styles.person}>
        <Text accessibilityRole="header" style={ui.cardTitle}>{label}</Text>
        {legacy && <Text style={ui.muted}>Chưa có email</Text>}
      </View>
      <View style={styles.score}>
        <Text style={[styles.scoreValue, { color }]}>{row.pct === null ? '–' : `${row.pct}%`}</Text>
        <Text style={ui.muted}>Xếp loại <Text style={styles.grade}>{grade}</Text></Text>
      </View>
    </View>
    {row.pct !== null && <View style={styles.track}>
      <View style={[styles.fill, { width: `${Math.max(0, Math.min(100, row.pct))}%`, backgroundColor: color }]} />
    </View>}
    <View style={metricStyles.grid}>
      <Metric label="Số việc" value={row.total ?? '–'} />
      {statuses.map(status => <Metric key={status} label={status} value={row.statusCounts[status] ?? 0} />)}
    </View>
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'flex-start' },
  filter: { flexGrow: 1, flexBasis: 125 },
  rulesFrame: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 22, borderColor: colors.accent },
  rulesExpanded: { alignSelf: 'stretch' },
  rulesButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14 },
  rulesContent: { paddingHorizontal: 14, paddingBottom: 14, gap: 12 },
  ruleGroup: { gap: 6, borderTopWidth: 1, borderColor: colors.line, paddingTop: 10 },
  ruleItem: { flexDirection: 'row', gap: 8 },
  ruleText: { flex: 1 },
  formula: { fontWeight: '700' },
  rulesLabel: { color: colors.ink, fontWeight: '700' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center' },
  person: { flexShrink: 1, gap: 4 },
  score: { alignItems: 'flex-end' },
  scoreValue: { fontSize: 25, fontWeight: '800', fontVariant: ['tabular-nums'] },
  grade: { fontWeight: '700' },
  track: { height: 6, backgroundColor: colors.surfaceMuted, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
}));
