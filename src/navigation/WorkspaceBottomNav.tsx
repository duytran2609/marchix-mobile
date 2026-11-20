import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { createThemedStyles } from '../theme/theme';
import type { PinnableTab } from './usePinnedTabs';
import { workspaceTabLabel, workspaceTabs } from './workspaceRoutes';
import type { WorkspaceTab } from './workspaceRoutes';
import { workspaceTabIcons } from './workspaceTabIcons';

const tabs = new Map(workspaceTabs.map(tab => [tab.id, tab]));

export function WorkspaceBottomNav({ pins, activeTab, isAdmin, onSelect }: {
  pins: readonly PinnableTab[];
  activeTab: WorkspaceTab | 'ca-nhan';
  isAdmin: boolean;
  onSelect: (tab: WorkspaceTab) => void;
}) {
  const styles = useStyles();
  const visible: WorkspaceTab[] = ['tong-quan', ...pins];

  return <View role="navigation" accessibilityLabel="Điều hướng dưới" style={styles.bar}>
    {visible.map(id => {
      const item = tabs.get(id)!;
      const label = workspaceTabLabel(item, isAdmin);
      const selected = id === activeTab;
      return <Pressable key={id} accessibilityRole="button" accessibilityLabel={label}
        {...(Platform.OS === 'web' && selected ? { 'aria-current': 'page' } : {})}
        accessibilityState={{ selected }} onPress={() => onSelect(id)}
        style={({ pressed }) => [styles.tab, selected && styles.selected, pressed && styles.pressed]}>
        <Image source={workspaceTabIcons[id]} resizeMode="contain" aria-hidden
          style={[styles.icon, selected && styles.selectedIcon]} />
        <Text numberOfLines={2} style={[styles.label, selected && styles.selectedLabel]}>{label}</Text>
      </Pressable>;
    })}
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  bar: { flexDirection: 'row', justifyContent: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5,
    backgroundColor: colors.paper, borderTopWidth: 1, borderColor: colors.line },
  tab: { flex: 1, minWidth: 0, maxWidth: 150, minHeight: 46, borderRadius: 9, paddingHorizontal: 4, paddingVertical: 5,
    alignItems: 'center', justifyContent: 'center', gap: 2 },
  selected: { backgroundColor: colors.accentSoft },
  pressed: { backgroundColor: colors.surfaceMuted },
  icon: { width: 20, height: 20, tintColor: colors.muted },
  selectedIcon: { tintColor: colors.accent },
  label: { color: colors.muted, textAlign: 'center', fontSize: 11, fontWeight: '600' },
  selectedLabel: { color: colors.accent, fontWeight: '800' },
}));
