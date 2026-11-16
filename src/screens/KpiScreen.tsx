import { PaginatedList } from '../components/PaginatedList';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { PageHeader } from '../components/PageHeader';
import { Dropdown } from '../components/Dropdown';
import { Button } from '../components/Button';
import { kpiForMonth, kpiGrade, kpiMonths } from '../features/kpi/kpi';
import type { KpiMember, KpiRow } from '../features/kpi/kpi';
import { watchKpi } from '../features/kpi/kpiStore';
import type { KpiData } from '../features/kpi/kpiStore';
import { formatTaskDate, todayInVietnam } from '../features/tasks/taskDates';
import { useScreenStyles } from '../theme/screenStyles';
import { createThemedStyles, useTheme } from '../theme/theme';

const monthLabel = (month: string) => `Tháng ${month.slice(5)}/${month.slice(0, 4)}`;
const metrics = [
  ['total', 'Số việc'], ['onTime', 'Đúng hạn'], ['late', 'Trễ'],
  ['missed', 'Quá hạn'], ['pending', 'Chưa tới hạn'], ['unverified', 'Thiếu giờ xong'],
] as const;

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
  const names = new Map(members.map(member => [member.email, member.name]));

  return <>
    <PageHeader title="KPI theo công việc" />
    <View style={ui.panel}>
      <View style={styles.filters}>
        <Dropdown style={styles.filter} label="Tháng" value={selectedMonth}
          choices={months.map(value => ({ value, label: monthLabel(value) }))} onChange={setMonth} />
        <Dropdown style={styles.filter} label="Dự án" value={selectedProject.id}
          choices={projectOptions.map(({ id, label }) => ({ value: id, label }))} onChange={setProject} />
      </View>
      <Text style={ui.muted}>{locked
        ? lockedAt ? `Điểm đã chốt tự động ngày ${formatTaskDate(lockedAt.slice(0, 10))}.` : 'Điểm đã chốt tự động.'
        : selectedProject.id ? 'Điểm tạm tính theo công việc của dự án.'
          : 'Điểm tạm tính theo thời gian thực. Hệ thống tự chốt vào ngày 1 tháng sau.'}</Text>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: showRules }}
        onPress={() => setShowRules(value => !value)} style={styles.rulesButton}>
        <Text style={styles.rulesLabel}>Cách tính KPI {showRules ? '▴' : '▾'}</Text>
      </Pressable>
      {showRules && <Text style={ui.muted}>
        {'Tính theo hạn công việc trong tháng. Xong đúng hạn được đủ điểm, xong trễ được nửa điểm, quá hạn chưa xong được 0 điểm. Việc chưa tới hạn hoặc thiếu giờ xong chưa được tính.\n\nTrọng số theo ưu tiên: Cao 3, Trung bình 2, Thấp 1. Hệ số đánh giá: Xuất sắc và Tốt 100%, Khá 90%, Trung bình 75%, Kém 50%.\n\nXếp loại A từ 90%, B từ 75%, C từ 60%, D dưới 60%.'}
      </Text>}
    </View>
    {rows.length ? <PaginatedList items={rows} resetKey={JSON.stringify([month, project])}>
      {pageItems => pageItems.map(row => {
        const legacy = row.email.startsWith('ten:');
        const label = legacy ? row.email.slice(4) : names.get(row.email) || row.email.split('@')[0];
        return <KpiCard key={row.email} row={row} label={label} legacy={legacy} />;
      })}
    </PaginatedList> : <View style={ui.panel}>
      <Text style={ui.body}>Chưa có việc nào có hạn trong tháng này.</Text>
    </View>}
    {isAdmin && rows.some(row => row.email.startsWith('ten:')) && <View style={ui.panel}>
      <Text style={ui.muted}>Một số việc chỉ có tên người làm. Hãy gắn tài khoản có email khi chọn người làm để KPI hiển thị đúng cho nhân viên.</Text>
    </View>}
  </>;
}

function KpiCard({ row, label, legacy }: { row: KpiRow; label: string; legacy: boolean }) {
  const ui = useScreenStyles();
  const styles = useStyles();
  const { colors } = useTheme();
  const grade = row.grade || kpiGrade(row.pct);
  const gradeColors = { A: colors.success, B: colors.accent, C: colors.warning, D: colors.danger };
  const color = gradeColors[grade as keyof typeof gradeColors] ?? colors.muted;

  return <View style={ui.panel}>
    <View style={styles.cardHeader}>
      <View style={styles.person}>
        <Text accessibilityRole="header" style={ui.cardTitle}>{label}</Text>
        {legacy && <Text style={ui.muted}>Chưa có email</Text>}
      </View>
      <View style={styles.score}>
        <Text style={[styles.scoreValue, { color }]}>{row.pct === null ? '–' : `${row.pct}%`}</Text>
        <Text style={ui.muted}>Xếp loại {grade}</Text>
      </View>
    </View>
    {row.pct !== null && <View style={styles.track}>
      <View style={[styles.fill, { width: `${Math.max(0, Math.min(100, row.pct))}%`, backgroundColor: color }]} />
    </View>}
    <View style={styles.metrics}>
      {metrics.map(([key, title]) => <View key={key} style={styles.metric}>
        <Text style={ui.label}>{row[key] ?? '–'}</Text>
        <Text style={ui.muted}>{title}</Text>
      </View>)}
    </View>
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'flex-start' },
  filter: { flexGrow: 1, flexBasis: 125 },
  rulesButton: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center' },
  rulesLabel: { color: colors.accent, fontWeight: '700' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center' },
  person: { flexShrink: 1, gap: 4 },
  score: { alignItems: 'flex-end' },
  scoreValue: { fontSize: 25, fontWeight: '800', fontVariant: ['tabular-nums'] },
  track: { height: 6, backgroundColor: colors.surfaceMuted, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { flexGrow: 1, flexBasis: '29%', backgroundColor: colors.surfaceMuted, padding: 9, borderRadius: 8, gap: 2 },
}));
