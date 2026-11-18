import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { createThemedStyles } from '../theme/theme';
import { searchByName } from '../utils/search';
import { MemberAvatar } from './MemberAvatar';
import { PeopleSummary } from './PeopleSummary';
import { SearchInput } from './SearchInput';
import { Button } from './Button';
import { DropdownOverlay, useDropdownAnchor } from './DropdownOverlay';

export type SearchableChoice = { id: string; name: string; photoURL?: string | null; self?: boolean };

type ChoiceListProps = {
  items: SearchableChoice[]; selected: string[]; disabled: boolean; label: string; emptyMessage: string;
  onToggle: (id: string) => void;
  showAvatar?: boolean;
};

export function SearchableChoiceDropdown(props: ChoiceListProps & { title: string; multiple?: boolean; placeholder?: string }) {
  const { title, multiple, items, selected, disabled, placeholder = 'Chưa chọn' } = props;
  const styles = useStyles();
  const { trigger, anchor, open, close } = useDropdownAnchor();
  const selectedItems = selected.map<SearchableChoice>(id => items.find(item => item.id === id) ?? { id, name: id })
    .filter(item => item.name);
  const summary = selectedItems.map(item => item.name).join(', ') || placeholder;
  const triggerContent = <>
    {selectedItems.length ? <PeopleSummary people={selectedItems} showAvatar={props.showAvatar} decorative />
      : <Text numberOfLines={1} style={styles.label}>{summary}</Text>}
    <Text aria-hidden style={styles.selected}>▾</Text>
  </>;
  return <>
    <Pressable ref={trigger} accessibilityRole="button" accessibilityLabel={`${title}: ${summary}`} aria-expanded={!!anchor}
      disabled={disabled} onPress={open} style={styles.trigger}>
      {triggerContent}
    </Pressable>
    {anchor && !disabled && <DropdownOverlay anchor={anchor} onClose={close} triggerStyle={styles.trigger}
      triggerContent={triggerContent} minWidth={240} minHeight={220} maxHeight={420} panelStyle={styles.popup}>
      <View role="dialog" accessibilityLabel={title} accessibilityViewIsModal style={styles.panel}>
        <Text accessibilityRole="header" style={styles.panelTitle}>{title}</Text>
        <SearchableChoiceList {...props} scrollable onToggle={id => {
          props.onToggle(id);
          if (!multiple) close();
        }} />
        <Button label="Xong" onPress={close} />
      </View>
    </DropdownOverlay>}
  </>;
}

export function SearchableChoiceList({ items, selected, disabled, label, emptyMessage, onToggle, showAvatar = true,
  scrollable = false }: ChoiceListProps & { scrollable?: boolean }) {
  const styles = useStyles();
  const [search, setSearch] = useState('');
  const matches = searchByName(items, search, item => item.name);
  const visible = scrollable ? matches : matches.slice(0, 6);
  const hiddenSelected = items.filter(item => selected.includes(item.id) && !visible.includes(item));

  const rows = <>
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
  </>;
  return <View style={[styles.list, scrollable && styles.shrink]}>
    <SearchInput accessibilityLabel={label} style={styles.input} value={search} onChangeText={setSearch}
      editable={!disabled} placeholder="Tìm theo tên" autoCapitalize="none" />
    {scrollable ? <ScrollView style={styles.results} contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled">{rows}</ScrollView> : rows}
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  list: { gap: 7 },
  shrink: { flexShrink: 1, minHeight: 0 },
  results: { flexGrow: 0, flexShrink: 1, maxHeight: 280 },
  popup: { maxWidth: 420 },
  panel: { flexShrink: 1, padding: 14, gap: 10,
    borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  panelTitle: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  trigger: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12,
    borderRadius: 9, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
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
