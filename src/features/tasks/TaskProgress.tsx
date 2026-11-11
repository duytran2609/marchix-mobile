import { StyleSheet, Text, View } from 'react-native';
import { createThemedStyles, useTheme } from '../../theme/theme';
import type { Palette } from '../../theme/theme';
import type { EditableStatus, Task } from './tasks';

const statusTones = (colors: Palette) => ({
  'Chưa làm': { text: colors.muted, background: colors.surfaceMuted },
  'Đang làm': { text: '#155083', background: '#E4F0FD' },
  'Vướng': { text: colors.danger, background: colors.dangerSoft },
  'Chờ duyệt': { text: '#80510C', background: '#FDF1D7' },
  'Xong': { text: colors.success, background: colors.successSoft },
  'Khác': { text: colors.muted, background: colors.surfaceMuted },
});

export function taskStatus(task: Task) {
  return task.status || 'Chưa làm';
}

export function statusTone(status: string, colors: Palette) {
  const tones = statusTones(colors);
  return Object.hasOwn(tones, status) ? tones[status as keyof typeof tones] : tones.Khác;
}

export function TaskProgress({ task, previewStatus, previewProgress }: {
  task: Task; previewStatus?: EditableStatus; previewProgress?: number;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const status = previewStatus ?? taskStatus(task);
  const tone = statusTone(status, colors);
  const value = previewProgress ?? Number(task.progress ?? (status === 'Xong' ? 100 : 0));
  const progress = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
  return (
    <View style={styles.progressBlock}>
      <View style={styles.progressHeader}>
        <Text style={[styles.pill, { color: tone.text, backgroundColor: tone.background }]}>{status}</Text>
        <Text style={styles.progressValue}>{progress}%</Text>
      </View>
      <View accessibilityRole="progressbar" accessibilityLabel="Tiến độ công việc"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} style={styles.track}>
        <View style={[styles.progressFill, { width: `${progress}%` }]} />
      </View>
    </View>
  );
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  progressBlock: { gap: 7 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  pill: { overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, fontSize: 12, fontWeight: '700' },
  progressValue: { color: colors.ink, fontWeight: '800', fontSize: 13 },
  track: { height: 5, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.surfaceMuted },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: colors.accent },
}));
