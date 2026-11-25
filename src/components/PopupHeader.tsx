import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useScreenStyles } from '../theme/screenStyles';
import { PopupCloseButton } from './PopupCloseButton';

export function PopupHeader({ title, closeLabel, onClose, disabled, inset = true, leading, actions, titleLines }: {
  title: string;
  closeLabel: string;
  onClose: () => void;
  disabled?: boolean;
  inset?: boolean;
  leading?: ReactNode;
  actions?: ReactNode;
  titleLines?: number;
}) {
  const screen = useScreenStyles();
  return <View style={[styles.row, inset && styles.inset]}>
    {leading}
    <Text accessibilityRole="header" numberOfLines={titleLines} style={[screen.cardTitle, styles.title]}>{title}</Text>
    {actions}
    <PopupCloseButton label={closeLabel} onPress={onClose} disabled={disabled} />
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4, flexShrink: 0 },
  inset: { paddingHorizontal: 16 },
  title: { flex: 1, minWidth: 0 },
});
