import { StyleSheet } from 'react-native';
import { createThemedStyles, metadataValueStyle } from './theme';

export const inputTextStyle = { fontSize: 16 };

export const useScreenStyles = createThemedStyles(colors => StyleSheet.create({
  scroll: { alignItems: 'center', padding: 20 },
  page: { width: '100%', maxWidth: 560, gap: 22, paddingBottom: 18 },
  badge: { alignSelf: 'flex-start', flexShrink: 1, overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 5,
    borderRadius: 8, fontSize: 12, fontWeight: '700', color: colors.accent, backgroundColor: colors.accentSoft },
  panel: { gap: 14, padding: 20, backgroundColor: colors.paper, borderColor: colors.line,
    borderWidth: 1, borderRadius: 18 },
  stack: { gap: 12 },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 5 },
  listHeading: { flexShrink: 1 },
  pageHeader: { minHeight: 44 },
  pageHeading: { flexShrink: 1, textTransform: 'uppercase' },
  eyebrow: { fontSize: 11, fontWeight: '800', color: colors.accent, letterSpacing: 1 },
  heading: { fontSize: 26, fontWeight: '800', color: colors.ink },
  cardTitle: { fontSize: 17, fontWeight: '700', color: colors.ink },
  body: { color: colors.ink, fontSize: 15, lineHeight: 22 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  metadataLabel: { color: colors.metadataLabel, fontWeight: '700' },
  metadataValue: metadataValueStyle(colors),
  unsetValue: { color: colors.unsetValue, fontWeight: '400' },
  label: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1,
    borderColor: colors.line, borderRadius: 9 },
  selected: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  input: { minHeight: 44, borderWidth: 1, borderColor: colors.line, borderRadius: 9,
    paddingHorizontal: 12, ...inputTextStyle, backgroundColor: colors.paper },
  messageInput: { minHeight: 90, paddingVertical: 10, textAlignVertical: 'top' },
  detailRow: { gap: 3, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10 },
  secondary: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
  dimmed: { opacity: 0.65 },
}));

export const useInformationStyles = createThemedStyles(colors => StyleSheet.create({
  panel: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 18, borderWidth: 1,
    borderColor: colors.line, backgroundColor: colors.paper },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  divider: { borderTopWidth: 1, borderTopColor: colors.line },
  label: { width: '44%', color: colors.metadataLabel, fontSize: 14, lineHeight: 22, fontWeight: '700' },
  value: { ...metadataValueStyle(colors), flex: 1, minWidth: 0, fontSize: 15, lineHeight: 22, textAlign: 'right' },
}));
