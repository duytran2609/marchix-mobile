import { PaginatedList } from '../../components/PaginatedList';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useDataTableStyles } from '../../components/dataTableStyles';
import { payrollCells, payrollHeaders } from './payrollColumns';
import type { PayrollRow } from './payrollColumns';
import { amount, money } from './payroll';
import type { Employee } from './payroll';
import { formatTaskDate } from '../tasks/taskDates';

type TableRow = PayrollRow & { id: string; onOpen?: () => void };
type GridRow = { id: string; cells: (string | number)[]; onOpen?: () => void };

const employeeHeaders = [
  'Họ tên', 'Trạng thái', 'Email', 'Chức danh', 'Loại hợp đồng', 'Ngày vào làm',
  'Mã số thuế cá nhân', 'Lương thỏa thuận', 'Mức lương đóng BHXH',
  'Phụ cấp chịu thuế', 'Phụ cấp miễn thuế', 'Người phụ thuộc',
];

export function PayrollTable({ rows, month }: { rows: TableRow[]; month: string }) {
  return <PayrollGrid resetKey={month} label="Bảng lương theo tháng" headers={payrollHeaders} action="Xem dòng lương"
    highlightColumn="Thực lĩnh" rows={rows.map(row => ({
      id: row.id, onOpen: row.onOpen, cells: payrollCells(row, true),
    }))} />;
}

export function EmployeeTable({ employees, onEdit }: { employees: Employee[]; onEdit: (id: string) => void }) {
  return <PayrollGrid label="Bảng hồ sơ nhân sự" headers={employeeHeaders} action="Sửa hồ sơ"
    wideColumn="Email" rows={employees.map(item => ({
      id: item.id,
      onOpen: () => onEdit(item.id),
      cells: [
        item.name, item.status || 'Đang làm', item.email || '—', item.position || '—', item.contract || '—',
        item.startDate ? formatTaskDate(item.startDate) : '—', item.taxCode || '—', money(item.salary),
        money(item.insSalary), money(item.allowTaxable), money(item.allowFree), amount(item.dependents),
      ],
    }))} />;
}

function PayrollGrid({ label, headers, action, highlightColumn, wideColumn, rows, resetKey }: {
  label: string;
  headers: readonly string[];
  action: string;
  highlightColumn?: string;
  wideColumn?: string;
  rows: GridRow[];
  resetKey?: string;
}) {
  const styles = useDataTableStyles();
  return <>
    <PaginatedList items={rows} resetKey={resetKey}>
      {pageItems => (
        <ScrollView horizontal showsHorizontalScrollIndicator persistentScrollbar
          style={styles.scroll} accessibilityLabel={label}>
          <View role="table">
            <View role="row" style={[styles.row, styles.header]}>
              {headers.map((header, index) => <Text key={header} role="columnheader"
                style={[styles.cell, index === 0 && styles.name, header === wideColumn && columnStyles.wide, styles.bold]}>{header}</Text>)}
            </View>
            {pageItems.map(row => {
              const [name, ...values] = row.cells;
              return <View key={row.id} role="row" style={styles.row}>
                {row.onOpen ? <Pressable accessibilityRole="button" accessibilityLabel={action + ' ' + name}
                  onPress={row.onOpen} style={styles.name}>
                  <Text style={[styles.cell, styles.name, styles.link]}>{name}</Text>
                </Pressable> : <Text role="rowheader" style={[styles.cell, styles.name]}>{name}</Text>}
                {values.map((value, index) => {
                  const header = headers[index + 1];
                  return <Text key={header} role="cell"
                    style={[styles.cell, header === wideColumn && columnStyles.wide, header === highlightColumn && styles.bold]}>{value}</Text>;
                })}
              </View>;
            })}
          </View>
        </ScrollView>
      )}
    </PaginatedList>
  </>;
}

const columnStyles = StyleSheet.create({
  wide: { width: 260 },
});
