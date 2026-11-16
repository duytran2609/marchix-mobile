import { PaginatedList } from '../../components/PaginatedList';
import { useMemo, useRef } from 'react';
import { Animated, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import { createThemedStyles } from '../../theme/theme';
import { weekday, weekdays } from './attendance';
import { attendanceMarker, companyTotals, personalAttendanceCells, personalColumns, showAttendanceDate } from './attendanceTableData';
import type { AttendanceDay, AttendanceEditTarget, CompanyAttendanceRow } from './attendanceTableData';

const nameWidth = 149;
const dayWidth = 32.2;
const summaryWidths = [58, 52, 68, 54];
const stickyNameOnWeb = { position: 'sticky', left: 0 } as unknown as ViewStyle;

function AttendanceLegend() {
  const styles = useStyles();
  return <Text style={styles.legend}>x = đủ công · ½ = nửa công · P = nghỉ phép đã duyệt · CT = công tác · ! = quên chấm ra · – = vắng không đơn · ô cam = đi muộn. Bấm vào ô để sửa công (ghi rõ lý do).</Text>;
}

export function CompanyAttendanceTable({ rows, onEdit, month }: {
  rows: CompanyAttendanceRow[];
  month: string;
  onEdit: (target: AttendanceEditTarget) => void;
}) {
  const styles = useStyles();
  const scrollX = useRef(new Animated.Value(0)).current;
  const onNativeScroll = useMemo(() => Platform.OS === 'web' ? undefined :
    Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true }), [scrollX]);
  const pinnedName = Platform.OS === 'web' ? stickyNameOnWeb : { transform: [{ translateX: scrollX }] };
  if (!rows.length) return <Text style={styles.legend}>Chưa có thành viên.</Text>;
  const days = rows[0].month.days;
  const tableWidth = nameWidth + days.length * dayWidth + summaryWidths.reduce((sum, width) => sum + width, 0);
  return <>
    <AttendanceLegend />
    <PaginatedList items={rows} resetKey={month}>
      {pageItems => (
        <Animated.ScrollView horizontal showsHorizontalScrollIndicator persistentScrollbar removeClippedSubviews={false}
          onScroll={onNativeScroll} scrollEventThrottle={16}
          style={styles.tableScroll} accessibilityLabel="Bảng công theo nhân viên và ngày">
          <View role="table" style={{ width: tableWidth }}>
            <View role="row" style={[styles.row, styles.companyHeader]}>
              <Animated.View style={[styles.nameCell, pinnedName]}>
                <Text role="columnheader" style={[styles.companyHeading, styles.nameText]}>HỌ TÊN</Text>
              </Animated.View>
              {days.map(({ date, weight }) => <View key={date} style={[styles.day, styles.dayButton, !weight && styles.dayOff]}>
                <Text role="columnheader" style={styles.companyHeading}>{weekdays[weekday(date)]}{'\n'}{date.slice(8)}</Text>
              </View>)}
              {companyTotals.map((label, index) => <Text key={label} role="columnheader"
                style={[styles.companyHeading, styles.summary, { width: summaryWidths[index] }]}>{label}</Text>)}
            </View>
            {pageItems.map(({ member, month: { days, summary } }, index) => <View key={member.email} role="row"
              style={[styles.row, styles.companyRow, index === pageItems.length - 1 && styles.lastRow]}>
              <Animated.View style={[styles.nameCell, pinnedName]}>
                <Text role="rowheader" style={[styles.text, styles.nameText]} numberOfLines={1}>{member.name}</Text>
              </Animated.View>
              {days.map(day => {
                const { date, weight, record, result, absent } = day;
                const status = attendanceMarker(day);
                return <Pressable key={date} accessibilityRole="button"
                  accessibilityLabel={`Sửa công ${member.name}, ${showAttendanceDate(date)}`}
                  accessibilityHint={result?.flag || (!weight ? 'Ngày nghỉ' : absent ? 'Vắng' : day.leave?.type)}
                  onPress={() => onEdit({ member, date, record, calculatedWork: result?.work ?? 0 })}
                  style={({ pressed }) => [styles.day, styles.dayButton, !weight && styles.dayOff, !!result?.late && styles.lateCell, pressed && styles.pressed]}>
                  <Text style={[styles.text, styles.marker, !!result?.late && styles.lateMark, status === '!' && styles.red,
                    !!status && record?.manualWork !== undefined && styles.adjusted]}>{status}</Text>
                </Pressable>;
              })}
              {[
                <><Text style={styles.bold}>{summary.work}</Text>/{summary.standard}</>,
                summary.leave, summary.late ? `${summary.late} (${summary.lateMinutes}′)` : '0', summary.forgottenIn + summary.forgottenOut,
              ].map((value, index) => <Text key={companyTotals[index]} numberOfLines={1}
                style={[styles.text, styles.summary, { width: summaryWidths[index] }]}>{value}</Text>)}
            </View>)}
          </View>
        </Animated.ScrollView>
      )}
    </PaginatedList>
  </>;
}

export function PersonalAttendanceTable({ days, dailyNotes, month }: { days: AttendanceDay[]; month: string; dailyNotes?: ReadonlyMap<string, string> }) {
  const styles = useStyles();
  return <>
    <AttendanceLegend />
    <PaginatedList items={days} initialSize={50} resetKey={month}>
      {pageItems => (
        <ScrollView horizontal showsHorizontalScrollIndicator accessibilityLabel="Bảng công cá nhân theo ngày">
          <View role="table">
            <View role="row" style={[styles.row, styles.header]}>
              {personalColumns.map((label, index) =>
                <Text key={label} role="columnheader"
                  style={[styles.heading, index === 0 ? styles.date : index === 5 ? styles.note : styles.total]}>{label}</Text>)}
            </View>
            {pageItems.map(day => {
              const { date, weight } = day;
              const { date: label, entered, exited, worked, work, notes } =
                personalAttendanceCells(day, dailyNotes?.get(date));
              const late = !!day.result?.late;
              return <View key={date} role="row" style={[styles.row, !weight && styles.dayOff]}>
                <Text role="rowheader" style={[styles.text, styles.date]}>{label}</Text>
                <Text role="cell" style={[styles.text, styles.total]}>{entered}</Text>
                <Text role="cell" style={[styles.text, styles.total]}>{exited}</Text>
                <Text role="cell" style={[styles.text, styles.total]}>{worked}</Text>
                <View role="cell" style={[styles.workCell, !!late && styles.lateCell]}>
                  <Text style={[styles.text, styles.marker, !!late && styles.lateMark, work === '!' && styles.red]}>{work}</Text>
                </View>
                <View style={styles.note}>
                  {!!notes && <Text style={styles.text}>{notes}</Text>}
                </View>
              </View>;
            })}
          </View>
        </ScrollView>
      )}
    </PaginatedList>
  </>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  tableScroll: { width: '100%', flexGrow: 0 },
  row: { flexDirection: 'row', alignItems: 'stretch', borderBottomWidth: 1, borderColor: colors.line, minHeight: 40 },
  header: { minHeight: 44 },
  companyHeader: { minHeight: 46 },
  companyRow: { minHeight: 28 },
  lastRow: { borderBottomWidth: 0 },
  companyHeading: { color: colors.muted, fontSize: 13, lineHeight: 18, fontWeight: '500', textAlign: 'center' },
  heading: { color: colors.muted, fontSize: 12, fontWeight: '700', textAlign: 'center', textAlignVertical: 'center', paddingVertical: 6 },
  nameCell: { width: nameWidth, flexShrink: 0, paddingHorizontal: 3, justifyContent: 'center',
    zIndex: 1, backgroundColor: colors.paper, borderRightWidth: 1, borderRightColor: colors.line },
  nameText: { textAlign: 'left' },
  date: { width: 94, paddingHorizontal: 8, textAlign: 'left', alignSelf: 'center' },
  day: { width: dayWidth, flexShrink: 0 },
  dayButton: { alignItems: 'center', justifyContent: 'center' },
  dayOff: { backgroundColor: colors.surfaceMuted },
  lateCell: { backgroundColor: colors.warningSoft },
  lateMark: { color: colors.warning, fontWeight: '700' },
  pressed: { backgroundColor: colors.accentSoft },
  summary: { flexShrink: 0, textAlign: 'center', alignSelf: 'center' },
  total: { width: 59, paddingHorizontal: 3, textAlign: 'center', alignSelf: 'center' },
  workCell: { width: 59, alignItems: 'center', justifyContent: 'center' },
  note: { width: 260, paddingHorizontal: 8, paddingVertical: 8, justifyContent: 'center', textAlign: 'left', alignSelf: 'center' },
  text: { color: colors.ink, fontSize: 13 },
  legend: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  marker: { fontWeight: '700' },
  adjusted: { textDecorationLine: 'underline', textDecorationStyle: 'dotted' },
  red: { color: colors.danger, fontSize: 13, fontWeight: '700' },
  bold: { fontWeight: '700' },
}));
