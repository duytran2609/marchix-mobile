import { StyleSheet } from 'react-native';
import { createThemedStyles } from '../theme/theme';

export const useDataTableStyles = createThemedStyles(colors => StyleSheet.create({
  scroll: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, backgroundColor: colors.paper },
  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: colors.line, minHeight: 48 },
  header: { backgroundColor: colors.accentSoft },
  cell: { width: 140, paddingHorizontal: 10, paddingVertical: 14, textAlign: 'right', color: colors.ink, fontSize: 13 },
  name: { width: 170, textAlign: 'left' },
  bold: { fontWeight: '700' },
  link: { color: colors.accent, fontWeight: '700' },
}));
