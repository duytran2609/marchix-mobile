import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { createThemedStyles } from '../theme/theme';
import { searchByName } from '../utils/search';
import { MemberAvatar } from './MemberAvatar';
import { SearchInput } from './SearchInput';

export type SearchableChoice = { id: string; name: string; photoURL?: string | null; self?: boolean };

export function SearchableChoiceList({ items, selected, disabled, label, emptyMessage, onToggle, showAvatar = true }: {
  items: SearchableChoice[]; selected: string[]; disabled: boolean; label: string; emptyMessage: string;
  onToggle: (id: string) => void;
  showAvatar?: boolean;
}) {
  const styles = useStyles();
  const [search, setSearch] = useState('');
  const matches = searchByName(items, search, item => item.name);
  const visible = matches.slice(0, 6);
  const hiddenSelected = items.filter(item => selected.includes(item.id) && !visible.includes(item));

  return <View style={styles.list}>
    <SearchInput accessibilityLabel={label} style={styles.input} value={search} onChangeText={setSearch}
      editable={!disabled} placeholder="Tìm theo tên" autoCapitalize="none" />
    {visible.map(item => {
      const checked = selected.includes(item.id);
      return <Pressable key={item.id} accessibilityRole="checkbox" aria-checked={checked} disabled={disabled}
        accessibilityLabel={item.name} onPress={() => onToggle(item.id)} style={[styles.row, checked && styles.highlight]}>
        {showAvatar && <MemberAvatar name={item.name} photoURL={item.photoURL} />}
        <Text style={[styles.label, checked && styles.selected]}>{item.name}{item.self ? ' (Bạn)' : ''}</Text>
        <Text aria-hidden style={[styles.mark, checked && styles.markChecked]}>{checked ? '✓' : ''}</Text>
      </Pressable>;
    })}
    {!visible.length && <Text accessibilityLiveRegion="polite" style={styles.muted}>{emptyMessage}</Text>}
    {matches.length > visible.length && <Text style={styles.muted}>Tìm theo tên để xem thêm.</Text>}
    {hiddenSelected.length > 0 && <View style={styles.chips}>
      {hiddenSelected.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Bỏ chọn ${item.name}`}
        onPress={() => onToggle(item.id)} disabled={disabled} style={styles.chip}>
        {showAvatar && <MemberAvatar name={item.name} photoURL={item.photoURL} />}
        <Text style={styles.selected}>{item.name} ×</Text>
      </Pressable>)}
    </View>}
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  list: { gap: 7 },
  input: { minHeight: 46, paddingHorizontal: 12, borderWidth: 1, borderRadius: 9,
    borderColor: colors.line, color: colors.ink, fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10,
    backgroundColor: colors.surfaceMuted, borderRadius: 9, minHeight: 48, borderWidth: 1, borderColor: colors.line },
  label: { flex: 1, color: colors.ink, fontSize: 14, fontWeight: '700' },
  highlight: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  selected: { color: colors.accent, fontSize: 13, fontWeight: '800' },
  mark: { borderWidth: 1, borderColor: colors.line, width: 22, height: 22, lineHeight: 20, borderRadius: 5,
    color: colors.onAccent, textAlign: 'center', fontWeight: '800' },
  markChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 10,
    paddingVertical: 6, borderRadius: 10, backgroundColor: colors.accentSoft },
}));
