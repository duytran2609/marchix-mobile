import { useState } from 'react';
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';
import { createThemedStyles, metadataValueStyle } from '../theme/theme';
import { searchByName } from '../utils/search';
import { MemberAvatar } from './MemberAvatar';
import { PeopleSummary } from './PeopleSummary';
import { SearchInput } from './SearchInput';
import { PopupHeader } from './PopupHeader';
import { PopupAction } from './PopupBody';
import { EmptyState } from './EmptyState';
import type { EmptyStateIcon } from './EmptyState';
import { KeyboardSafeAreaView } from './KeyboardViewport';
import { ToastLayer } from './Toast';

export type SearchableChoice = { id: string; name: string; photoURL?: string | null; self?: boolean };

type ChoiceListProps = {
  items: SearchableChoice[]; selected: string[]; disabled: boolean; label: string; emptyMessage: string;
  onToggle: (id: string) => void;
  showAvatar?: boolean;
  emptyIcon?: EmptyStateIcon;
};

export function SearchableChoiceDropdown(props: ChoiceListProps & {
  title: string; multiple?: boolean; placeholder?: string; placeholderStyle?: StyleProp<TextStyle>;
}) {
  const { title, multiple, items, selected, disabled, placeholder = 'Chưa chọn', placeholderStyle } = props;
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const selectedItems = selected.map<SearchableChoice>(id => items.find(item => item.id === id) ?? { id, name: id })
    .filter(item => item.name);
  const summary = selectedItems.map(item => item.name).join(', ') || placeholder;
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}: ${summary}`} aria-expanded={open && !disabled}
      disabled={disabled} onPress={() => { Keyboard.dismiss(); setOpen(true); }} style={styles.trigger}>
      {selectedItems.length ? <PeopleSummary people={selectedItems} showAvatar={props.showAvatar} textStyle={styles.value} decorative />
        : <Text numberOfLines={1} style={[styles.label, placeholderStyle]}>{summary}</Text>}
      <Text aria-hidden style={styles.arrow}>›</Text>
    </Pressable>
    {open && !disabled && <Modal transparent statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
      <KeyboardSafeAreaView style={styles.overlay}>
        <Pressable accessible={false} aria-hidden tabIndex={-1} style={StyleSheet.absoluteFill} onPress={close} />
        <View role="dialog" accessibilityLabel={title} accessibilityViewIsModal style={styles.panel}>
          <PopupHeader title={title} closeLabel={`Đóng ${title.toLowerCase()}`} onClose={close} inset={false} />
          <SearchableChoiceList {...props} scrollable onToggle={id => {
            props.onToggle(id);
            if (!multiple) close();
          }} />
          <PopupAction label="Xong" onPress={close} />
        </View>
        <ToastLayer safeAreaApplied />
      </KeyboardSafeAreaView>
    </Modal>}
  </>;
}

export function SearchableChoiceList({ items, selected, disabled, label, emptyMessage, onToggle, showAvatar = true,
  emptyIcon = 'people', scrollable = false }: ChoiceListProps & { scrollable?: boolean }) {
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
        <Text style={styles.label}>{item.name}{item.self ? ' (Bạn)' : ''}</Text>
        <Text aria-hidden style={[styles.mark, checked && styles.markChecked]}>{checked ? '✓' : ''}</Text>
      </Pressable>;
    })}
    {!visible.length && <EmptyState icon={emptyIcon} message={emptyMessage} announce />}
    {matches.length > visible.length && <Text style={styles.muted}>Tìm theo tên để xem thêm.</Text>}
    {hiddenSelected.length > 0 && <View style={styles.chips}>
      {hiddenSelected.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Bỏ chọn ${item.name}`}
        onPress={() => onToggle(item.id)} disabled={disabled} style={styles.chip}>
        {showAvatar && <MemberAvatar name={item.name} photoURL={item.photoURL} />}
        <Text style={styles.chipValue}>{item.name} ×</Text>
      </Pressable>)}
    </View>}
  </>;
  return <View style={[styles.list, scrollable && styles.shrink]}>
    <SearchInput accessibilityLabel={label} placeholder="Tìm theo tên" value={search} onChangeText={setSearch}
      editable={!disabled} />
    {scrollable ? <ScrollView style={styles.results} contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled">{rows}</ScrollView> : rows}
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  list: { gap: 7 },
  shrink: { flexShrink: 1, minHeight: 0 },
  results: { flexGrow: 0, flexShrink: 1, maxHeight: 280 },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16, backgroundColor: 'rgba(33, 25, 53, 0.4)' },
  panel: { width: '100%', maxWidth: 420, maxHeight: '100%', flexShrink: 1, padding: 14, gap: 10,
    borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  trigger: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12,
    borderRadius: 9, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10,
    backgroundColor: colors.surfaceMuted, borderRadius: 9, minHeight: 48, borderWidth: 1, borderColor: colors.line },
  label: { ...metadataValueStyle(colors), flex: 1, fontSize: 14 },
  value: metadataValueStyle(colors),
  chipValue: { ...metadataValueStyle(colors), fontSize: 13 },
  highlight: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  arrow: { color: colors.accent, fontSize: 13, fontWeight: '800' },
  mark: { borderWidth: 1, borderColor: colors.line, width: 22, height: 22, lineHeight: 20, borderRadius: 5,
    color: colors.onAccent, textAlign: 'center', fontWeight: '800' },
  markChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 10,
    paddingVertical: 6, borderRadius: 10, backgroundColor: colors.accentSoft },
}));
