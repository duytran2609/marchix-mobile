import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { createThemedStyles } from '../../theme/theme';
import { payrollCells, payrollHeaders } from './payrollColumns';
import type { PayrollRow } from './payrollColumns';

type TableRow = PayrollRow & { id: string; onOpen?: () => void };

export function PayrollTable({ rows }: { rows: TableRow[] }) {
  const styles = useStyles();
  return <ScrollView horizontal showsHorizontalScrollIndicator persistentScrollbar
    style={styles.scroll} accessibilityLabel="Bảng lương theo tháng">
    <View accessibilityRole="table">
      <View accessibilityRole="row" style={[styles.row, styles.header]}>
        {payrollHeaders.map((label, index) => <Text key={label} accessibilityRole="columnheader"
          style={[styles.cell, index === 0 && styles.name, styles.bold]}>{label}</Text>)}
      </View>
      {rows.map(row => {
        const [name, ...values] = payrollCells(row, true);
        return <View key={row.id} accessibilityRole="row" style={styles.row}>
          {row.onOpen ? <Pressable accessibilityRole="button" accessibilityLabel={'Xem dòng lương ' + name}
            onPress={row.onOpen} style={styles.name}>
            <Text style={[styles.cell, styles.name, styles.link]}>{name}</Text>
          </Pressable> : <Text accessibilityRole="rowheader" style={[styles.cell, styles.name]}>{name}</Text>}
          {values.map((value, index) => <Text key={payrollHeaders[index + 1]} accessibilityRole="cell"
            style={[styles.cell, payrollHeaders[index + 1] === 'Thực lĩnh' && styles.bold]}>{value}</Text>)}
        </View>;
      })}
    </View>
  </ScrollView>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  scroll: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, backgroundColor: colors.paper },
  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: colors.line, minHeight: 48 },
  header: { backgroundColor: colors.accentSoft },
  cell: { width: 140, paddingHorizontal: 10, paddingVertical: 14, textAlign: 'right', color: colors.ink, fontSize: 13 },
  name: { width: 170, textAlign: 'left' },
  bold: { fontWeight: '700' },
  link: { color: colors.accent, fontWeight: '700' },
}));
