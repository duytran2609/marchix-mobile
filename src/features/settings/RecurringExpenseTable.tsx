import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useDataTableStyles } from '../../components/dataTableStyles';
import { DeleteIconButton } from '../../components/DeleteIconButton';
import { PaginatedList } from '../../components/PaginatedList';
import { createThemedStyles } from '../../theme/theme';
import type { SettingsRow } from './adminSettingsStore';

const formatMoney = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });
const valueHeaders = ['Hạng mục', 'Đối tượng', 'Ngày chi', 'Số tiền / tháng', 'Áp dụng'];

export function RecurringExpenseTable({ rows, onEdit, onRemove }: {
  rows: SettingsRow[];
  onEdit: (row: SettingsRow) => void;
  onRemove: (row: SettingsRow) => void;
}) {
  const styles = useDataTableStyles();
  const expenseStyles = useExpenseStyles();
  const cellStyle = [styles.cell, expenseStyles.fixedCell];
  const total = rows.reduce((sum, { data }) =>
    sum + (data.active === false ? 0 : Number(data.amount) || 0), 0);

  return <PaginatedList items={rows}>
    {pageItems => (
      <ScrollView horizontal showsHorizontalScrollIndicator persistentScrollbar
        style={styles.scroll}>
        <View role="table" accessibilityLabel="Bảng chi phí cố định">
          <View role="row" style={[styles.row, styles.header]}>
            <Text role="columnheader" style={[cellStyle, styles.name, styles.bold]}>Khoản chi</Text>
            {valueHeaders.map(header => <Text key={header} role="columnheader"
              style={[cellStyle, styles.bold]}>{header}</Text>)}
            <View role="columnheader" accessibilityLabel="Thao tác" style={expenseStyles.action} />
          </View>
          {pageItems.map(row => {
            const { data } = row;
            const name = String(data.name || row.id);
            const values = [
              String(data.category || '—'),
              String(data.partyName || '—'),
              `Ngày ${String(data.day || 1)}`,
              formatMoney.format(Number(data.amount) || 0),
              data.active === false ? 'Tạm dừng' : 'Đang áp dụng',
            ];
            return <View key={row.id} role="row" style={styles.row}>
              <View role="rowheader" style={[styles.name, expenseStyles.fixedCell]}>
                <Pressable accessibilityRole="button" accessibilityLabel={`Sửa khoản chi ${name}`}
                  onPress={() => onEdit(row)}>
                  <Text numberOfLines={1} ellipsizeMode="tail" style={[cellStyle, styles.name, styles.link]}>{name}</Text>
                </Pressable>
              </View>
              {values.map((value, index) => (
                <Text key={valueHeaders[index]} role="cell" numberOfLines={1} ellipsizeMode="tail"
                  style={[cellStyle, index === 3 && styles.bold]}>{value}</Text>
              ))}
              <View role="cell" style={expenseStyles.action}>
                <DeleteIconButton label={`Xóa khoản chi ${name}`} onPress={() => onRemove(row)} />
              </View>
            </View>;
          })}
          <View role="row" style={[styles.row, expenseStyles.footer]}>
            <Text role="rowheader" style={[styles.cell, styles.name, styles.bold, expenseStyles.totalLabel]}>
              Tổng chi phí cố định / tháng
            </Text>
            <Text role="cell" numberOfLines={1} ellipsizeMode="tail" style={[cellStyle, styles.bold]}>{formatMoney.format(total)}</Text>
            <View role="cell" style={cellStyle} />
            <View role="cell" style={expenseStyles.action} />
          </View>
        </View>
      </ScrollView>
    )}
  </PaginatedList>;
}

const useExpenseStyles = createThemedStyles(colors => StyleSheet.create({
  footer: { backgroundColor: colors.surfaceMuted, borderBottomWidth: 0 },
  fixedCell: { flexShrink: 0 },
  action: { width: 44, flexShrink: 0 },
  totalLabel: { flex: 1, minWidth: 0 },
}));
