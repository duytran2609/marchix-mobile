import { useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { createThemedStyles } from '../theme/theme';
import { Dropdown } from './Dropdown';

const pageSizes = [10, 25, 50, 100] as const;
type PageSize = typeof pageSizes[number];
const choices = pageSizes.map(value => ({ value, label: `${value} dòng` }));

export function PaginatedList<T>({ items, children, resetKey, initialSize = 10 }: {
  items: readonly T[];
  children: (pageItems: T[]) => ReactNode;
  resetKey?: string;
  initialSize?: PageSize;
}) {
  const styles = useStyles();
  const [size, setSize] = useState<PageSize>(initialSize);
  const [position, setPosition] = useState({ page: 1, key: resetKey });
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const page = position.key === resetKey ? Math.min(position.page, pageCount) : 1;
  if (position.key !== resetKey || page !== position.page) {
    setPosition({ page, key: resetKey });
  }
  const goTo = (page: number) => setPosition({ page, key: resetKey });
  const start = (page - 1) * size;

  return <>
    {children(items.slice(start, start + size))}
    {items.length > 0 && <View style={styles.toolbar}>
      <Dropdown label="Số dòng mỗi trang" hideLabel singleLineValue highlightSelection={false}
        style={styles.size} value={size} choices={choices}
        onChange={value => {
          if (size === value) return;
          setSize(value);
          goTo(1);
        }} />
      <View style={styles.navigation}>
        <PageArrow label="Trang trước" arrow="‹" disabled={page === 1} onPress={() => goTo(page - 1)} />
        <Text accessibilityLiveRegion="polite" style={styles.label}>Trang {page} / {pageCount}</Text>
        <PageArrow label="Trang sau" arrow="›" disabled={page === pageCount} onPress={() => goTo(page + 1)} />
      </View>
    </View>}
  </>;
}

function PageArrow({ label, arrow, disabled, onPress }: {
  label: string; arrow: string; disabled: boolean; onPress: () => void;
}) {
  const styles = useStyles();
  return <Pressable accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.arrow, disabled && styles.disabled, pressed && styles.pressed]}>
    <Text aria-hidden style={styles.arrowText}>{arrow}</Text>
  </Pressable>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingVertical: 4 },
  size: { width: 112 },
  navigation: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { color: colors.ink, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  arrow: { minWidth: 44, minHeight: 44, paddingHorizontal: 8, borderRadius: 9, borderWidth: 1,
    borderColor: colors.line, backgroundColor: colors.paper, justifyContent: 'center', alignItems: 'center' },
  arrowText: { color: colors.accent, fontSize: 24, fontWeight: '700' },
  disabled: { opacity: 0.45 },
  pressed: { backgroundColor: colors.accentSoft },
}));
