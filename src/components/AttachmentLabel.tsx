import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { createThemedStyles } from '../theme/theme';

const typeLabels = new Map([
  ['application/pdf', 'PDF'], ['application/msword', 'DOC'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'DOCX'],
  ['application/vnd.ms-excel', 'XLS'],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'XLSX'],
  ['application/vnd.ms-powerpoint', 'PPT'],
  ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'PPTX'],
  ['application/zip', 'ZIP'], ['application/x-rar-compressed', 'RAR'],
  ['text/plain', 'TXT'], ['text/csv', 'CSV'],
]);

function fileTypeLabel(name: string, type?: string) {
  const extension = /\.([a-z0-9]{1,5})$/i.exec(name.trim())?.[1];
  if (extension) return extension.toUpperCase();

  const mime = typeof type === 'string' ? type.split(';')[0].trim().toLowerCase() : '';
  return typeLabels.get(mime) ?? mime.match(/^(?:image|audio|video)\/([a-z0-9]{1,5})$/)?.[1].toUpperCase() ?? 'FILE';
}

export function FileTypeIcon({ name, type }: { name: string; type?: string }) {
  const styles = useStyles();
  return <View accessible={false} aria-hidden style={styles.icon}>
    <View style={styles.fold} />
    <Text allowFontScaling={false} style={styles.format}>{fileTypeLabel(name, type)}</Text>
  </View>;
}

export function AttachmentLabel({ file, children }: { file: { name: string; type?: string }; children: ReactNode }) {
  const styles = useStyles();
  return <View style={styles.row}>
    <FileTypeIcon name={file.name} type={file.type} />
    <View style={styles.details}>{children}</View>
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  details: { flex: 1, minWidth: 0, gap: 2 },
  icon: { width: 36, height: 40, flexShrink: 0, alignItems: 'center', justifyContent: 'center', paddingTop: 5,
    borderWidth: 1, borderColor: colors.line, borderRadius: 5, borderTopRightRadius: 11,
    backgroundColor: colors.accentSoft, overflow: 'hidden' },
  fold: { position: 'absolute', top: 0, right: 0, width: 9, height: 9, borderBottomLeftRadius: 3,
    backgroundColor: colors.line },
  format: { color: colors.accent, fontSize: 9, fontWeight: '800' },
}));
