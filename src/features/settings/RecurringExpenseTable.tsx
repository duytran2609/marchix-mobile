import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useDataTableStyles } from '../../components/dataTableStyles';
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
  const styles = useDataTableStyles();
  const expenseStyles = useExpenseStyles();
  const total = rows.reduce((sum, { data }) =>
    sum + (data.active === false ? 0 : Number(data.amount) || 0), 0);

  return <PaginatedList items={rows}>
    {pageItems => (
      <ScrollView horizontal showsHorizontalScrollIndicator persistentScrollbar
        style={styles.scroll}>
        <View role="table" accessibilityLabel="Bảng chi phí cố định">
          <View role="row" style={[styles.row, styles.header]}>
            {headers.map((header, index) => <Text key={header} role="columnheader"
              style={[styles.cell, index === 0 && styles.name, styles.bold]}>{header}</Text>)}
            <View role="columnheader" accessibilityLabel="Thao tác" style={expenseStyles.action} />
          </View>
          {pageItems.map(row => {
            const { data } = row;
            const name = String(data.name || row.id);
            const active = data.active !== false;
            return <View key={row.id} role="row" style={styles.row}>
              <View role="rowheader" style={styles.name}>
                <Pressable accessibilityRole="button" accessibilityLabel={`Sửa khoản chi ${name}`}
                  onPress={() => onEdit(row)}>
                  <Text style={[styles.cell, styles.name, styles.link]}>{name}</Text>
                </Pressable>
              </View>
              <Text role="cell" style={styles.cell}>{String(data.category || '—')}</Text>
              <Text role="cell" style={styles.cell}>{String(data.partyName || '—')}</Text>
              <Text role="cell" style={styles.cell}>Ngày {String(data.day || 1)}</Text>
              <Text role="cell" style={[styles.cell, styles.bold]}>{formatMoney.format(Number(data.amount) || 0)}</Text>
              <Text role="cell" style={styles.cell}>{active ? 'Đang áp dụng' : 'Tạm dừng'}</Text>
              <View role="cell" style={expenseStyles.action}>
                <DeleteIconButton label={`Xóa khoản chi ${name}`} onPress={() => onRemove(row)} />
              </View>
            </View>;
          })}
          <View role="row" style={[styles.row, expenseStyles.footer]}>
            <Text role="rowheader" style={[styles.cell, styles.name, styles.bold, expenseStyles.totalLabel]}>
              Tổng chi phí cố định / tháng
            </Text>
            <Text role="cell" style={[styles.cell, styles.bold]}>{formatMoney.format(total)}</Text>
            <View role="cell" style={styles.cell} />
            <View role="cell" style={expenseStyles.action} />
          </View>
        </View>
      </ScrollView>
    )}
  </PaginatedList>;
}

const useExpenseStyles = createThemedStyles(colors => StyleSheet.create({
  footer: { backgroundColor: colors.surfaceMuted, borderBottomWidth: 0 },
  action: { width: 44 },
  totalLabel: { flex: 1 },
}));
