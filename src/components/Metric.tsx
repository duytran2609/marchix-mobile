import { StyleSheet, Text, View } from 'react-native';
import { useScreenStyles } from '../theme/screenStyles';
import { createThemedStyles } from '../theme/theme';

export function Metric({ label, value, detail, inlineDetail, alertDetail }: {
  label: string; value: number | string; detail?: string; inlineDetail?: string; alertDetail?: boolean;
}) {
  const styles = useMetricStyles();
  const ui = useScreenStyles();

  return <View style={styles.tile}>
    <Text style={[ui.muted, ui.metadataLabel]}>{label}</Text>
    <Text style={[ui.cardTitle, ui.metadataValue]}>{value}{inlineDetail && <Text style={ui.muted}>{inlineDetail}</Text>}</Text>
    {detail && <Text style={alertDetail ? styles.alertDetail : ui.muted}>{detail}</Text>}
  </View>;
}

export const useMetricStyles = createThemedStyles(colors => StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { flexGrow: 1, flexBasis: '45%', backgroundColor: colors.accentSoft, borderRadius: 10, padding: 10 },
  alertDetail: { color: colors.danger, fontSize: 14, fontWeight: '700' },
}));
