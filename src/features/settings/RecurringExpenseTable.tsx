import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DeleteIconButton } from '../../components/DeleteIconButton';
import { PaginatedList } from '../../components/PaginatedList';
import { createThemedStyles } from '../../theme/theme';
import type { SettingsRow } from './adminSettingsStore';

const formatMoney = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });
const headers = ['Khoản chi', 'Hạng mục', 'Đối tượng', 'Ngày chi', 'Số tiền / tháng', 'Áp dụng'];

export function RecurringExpenseTable({ rows, onEdit, onRemove }: {
  rows: SettingsRow[];
  onEdit: (row: SettingsRow) => void;
  onRemove: (row: SettingsRow) => void;
}) {
  const styles = useStyles();
  const columns = [styles.name, styles.category, styles.party, styles.day, styles.amount, styles.status];
  const total = rows.reduce((sum, { data }) =>
    sum + (data.active === false ? 0 : Number(data.amount) || 0), 0);

  return <PaginatedList items={rows}>
    {pageItems => (
      <ScrollView horizontal showsHorizontalScrollIndicator persistentScrollbar
        style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View role="table" accessibilityLabel="Bảng chi phí cố định" style={styles.table}>
          <View role="row" style={[styles.row, styles.header]}>
            {headers.map((header, index) => <Text key={header} role="columnheader"
              style={[styles.cell, columns[index], styles.bold]}>{header}</Text>)}
            <Text role="columnheader" accessibilityLabel="Thao tác" style={styles.action} />
          </View>
          {pageItems.map(row => {
            const { data } = row;
            const name = String(data.name || row.id);
            const active = data.active !== false;
            return <View key={row.id} role="row" style={styles.row}>
              <View role="rowheader" style={styles.name}>
                <Pressable accessibilityRole="button" accessibilityLabel={`Sửa khoản chi ${name}`}
                  onPress={() => onEdit(row)}>
                  <Text style={[styles.cell, styles.link]}>{name}</Text>
                </Pressable>
              </View>
              <Text role="cell" style={[styles.cell, styles.category]}>{String(data.category || '—')}</Text>
              <Text role="cell" style={[styles.cell, styles.party]}>{String(data.partyName || '—')}</Text>
              <Text role="cell" style={[styles.cell, styles.day]}>Ngày {String(data.day || 1)}</Text>
              <Text role="cell" style={[styles.cell, styles.amount]}>{formatMoney.format(Number(data.amount) || 0)}</Text>
              <View role="cell" style={[styles.cell, styles.status]}>
                <Text style={[styles.badge, active ? styles.active : styles.paused]}>
                  {active ? 'Đang áp dụng' : 'Tạm dừng'}
                </Text>
              </View>
              <View role="cell" style={styles.action}>
                <DeleteIconButton label={`Xóa khoản chi ${name}`} onPress={() => onRemove(row)} />
              </View>
            </View>;
          })}
          <View role="row" style={[styles.row, styles.footer]}>
            <Text role="rowheader" style={[styles.cell, styles.totalLabel, styles.bold]}>
              Tổng chi phí cố định / tháng
            </Text>
            <Text role="cell" style={[styles.cell, styles.amount, styles.bold]}>{formatMoney.format(total)}</Text>
            <View role="cell" style={styles.status} />
            <View role="cell" style={styles.action} />
          </View>
        </View>
      </ScrollView>
    )}
  </PaginatedList>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  scroll: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, backgroundColor: colors.paper },
  scrollContent: { flexGrow: 1 },
  table: { minWidth: 860, flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 48, borderBottomWidth: 1, borderColor: colors.line },
  header: { backgroundColor: colors.accentSoft },
  footer: { backgroundColor: colors.surfaceMuted, borderBottomWidth: 0 },
  cell: { paddingHorizontal: 10, paddingVertical: 12, color: colors.ink, fontSize: 13 },
  name: { flex: 4, minWidth: 190 },
  category: { flex: 3, minWidth: 150 },
  party: { flex: 3, minWidth: 140 },
  day: { width: 84, textAlign: 'center' },
  amount: { width: 122, textAlign: 'right', fontVariant: ['tabular-nums'] },
  status: { width: 120, alignItems: 'flex-start', justifyContent: 'center' },
  action: { width: 44 },
  totalLabel: { flex: 10 },
  bold: { fontWeight: '700' },
  link: { color: colors.accent, fontWeight: '700' },
  badge: { borderRadius: 12, paddingHorizontal: 7, paddingVertical: 3, fontSize: 12, fontWeight: '600' },
  active: { color: colors.success, backgroundColor: colors.successSoft },
  paused: { color: colors.muted, backgroundColor: colors.surfaceMuted },
}));
