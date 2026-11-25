import { StyleSheet, Text, View } from 'react-native';
import { createThemedStyles, useTheme } from '../../theme/theme';
import type { Palette } from '../../theme/theme';
import type { EditableStatus, Task } from './tasks';
import { taskStatus } from './taskStatuses';

export { taskStatus } from './taskStatuses';

const statusTones = (colors: Palette) => ({
  'Chưa làm': { text: colors.muted, background: colors.surfaceMuted },
  'Đang làm': { text: '#155083', background: '#E4F0FD' },
  'Đang chạy': { text: '#155083', background: '#E4F0FD' },
  'Tạm dừng': { text: '#80510C', background: '#FDF1D7' },
  'Vướng': { text: colors.danger, background: colors.dangerSoft },
  'Chờ duyệt': { text: '#80510C', background: '#FDF1D7' },
  'Xong': { text: colors.success, background: colors.successSoft },
  'Khác': { text: colors.muted, background: colors.surfaceMuted },
});

export function taskProgressValue(task: Task, status = taskStatus(task), previewProgress?: number) {
  const value = previewProgress ?? Number(task.progress ?? (status === 'Xong' ? 100 : 0));
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
}

export function statusTone(status: string, colors: Palette) {
  const tones = statusTones(colors);
  return Object.hasOwn(tones, status) ? tones[status as keyof typeof tones] : tones.Khác;
}

export function TaskProgress({ task, previewStatus, previewProgress, variant }: {
  task: Task; previewStatus?: EditableStatus; previewProgress?: number; variant?: 'list' | 'detail' | 'kanban';
}) {
  const status = previewStatus ?? taskStatus(task);
  return <StatusProgress status={status} progress={taskProgressValue(task, status, previewProgress)}
    label="Tiến độ công việc" variant={variant} />;
}

export function StatusProgress({ status, progress, label, variant }: {
  status: string; progress: number | null; label: string; variant?: 'list' | 'detail' | 'kanban';
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const percent = progress !== null && Number.isFinite(progress) ? Math.min(100, Math.max(0, progress)) : undefined;
  const value = <Text style={styles.progressValue}>{percent === undefined ? '–' : `${percent}%`}</Text>;
  const track = <View accessibilityRole="progressbar" accessibilityLabel={label}
    aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
    aria-valuetext={percent === undefined ? 'Chưa có dữ liệu tiến độ' : undefined}
    style={[styles.track, variant && styles.fullHeightTrack, variant === 'list' && styles.listTrack,
      variant === 'kanban' && styles.kanbanTrack]}>
    <View style={[styles.progressFill, { width: `${percent ?? 0}%` }]} />
  </View>;

  if (variant === 'kanban') return <View style={styles.progressHeader}>{track}{value}</View>;

  const tone = statusTone(status, colors);
  return (
    <View style={styles.progressBlock}>
      <View style={styles.progressHeader}>
        <Text style={[styles.pill, { color: tone.text, backgroundColor: tone.background }]}>{status}</Text>
        {value}
      </View>
      {track}
    </View>
  );
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  progressBlock: { gap: 7 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  pill: { overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, fontSize: 12, fontWeight: '700' },
  progressValue: { color: colors.ink, fontWeight: '500', fontSize: 13 },
  track: { height: 5, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.surfaceMuted },
  fullHeightTrack: { height: 7 },
  listTrack: { marginTop: 3 },
  kanbanTrack: { flex: 1, minWidth: 12 },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: colors.accent },
}));
