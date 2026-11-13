import { useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { LayoutRectangle, StyleProp, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FieldLabel } from './FieldLabel';
import { createThemedStyles } from '../theme/theme';
import { ToastLayer } from './Toast';

export function Dropdown<Value extends string | number>({ label, value, choices, onChange, style, disabled,
  singleLineValue = false, fallbackLabel = String(value), menuLabel = label, hideLabel = false, highlightSelection = true, required }: {
  label: string; value: Value; choices: readonly { value: Value; label: string }[]; onChange: (value: Value) => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  singleLineValue?: boolean;
  fallbackLabel?: string;
  menuLabel?: string;
  hideLabel?: boolean;
  required?: boolean;
  highlightSelection?: boolean;
}) {
  const styles = useStyles();
  const trigger = useRef<ComponentRef<typeof Pressable>>(null);
  const [anchor, setAnchor] = useState<LayoutRectangle | null>(null);
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const selectedLabel = choices.find(choice => choice.value === value)?.label ?? fallbackLabel;

  function open() {
    if (Keyboard.isVisible()) Keyboard.dismiss();
    trigger.current?.measureInWindow((x, y, width, height) => setAnchor({ x, y, width, height }));
  }

  function close() {
    setAnchor(null);
  }

  const edge = 8;
  const gap = 4;
  const menuWidth = Math.min(Math.max(anchor?.width ?? 0, 160), width - insets.left - insets.right - edge * 2);
  const left = Math.min(Math.max(insets.left + edge, anchor?.x ?? 0), width - insets.right - edge - menuWidth);
  const belowTop = (anchor?.y ?? 0) + (anchor?.height ?? 0) + gap;
  const aboveBottom = (anchor?.y ?? 0) - gap;
  const spaceBelow = height - insets.bottom - edge - belowTop;
  const spaceAbove = aboveBottom - insets.top - edge;
  const above = spaceBelow < Math.min(2, choices.length) * 44 + 10 && spaceAbove > spaceBelow;
  const maxHeight = Math.min(274, Math.max(0, above ? spaceAbove : spaceBelow));

  const arrow = anchor ? '▴' : '▾';

  return (
    <View style={[styles.field, style]}>
      {!hideLabel && <FieldLabel style={styles.filterLabel} required={required}>{label}</FieldLabel>}
      <Pressable ref={trigger} accessibilityRole="button" accessibilityLabel={`${label}: ${selectedLabel}`}
        aria-expanded={!!anchor} disabled={disabled} onPress={open}
        style={[styles.filterButton, { height: 44 * Math.max(1, fontScale) },
          highlightSelection && (anchor || value !== choices[0]?.value) && styles.selected, disabled && styles.disabled]}>
        <Text aria-hidden style={[styles.activeLabel, styles.filterArrow, styles.filterArrowSpacer]}>{arrow}</Text>
        <Text numberOfLines={singleLineValue ? 1 : 2} ellipsizeMode="tail"
          style={[styles.activeLabel, styles.filterTriggerValue]}>{selectedLabel}</Text>
        <Text aria-hidden style={[styles.activeLabel, styles.filterArrow]}>{arrow}</Text>
      </Pressable>
      {anchor && !disabled ? (
        <Modal transparent statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
          <View style={styles.filterOverlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={close} accessible={false}
              importantForAccessibility="no" tabIndex={-1} />
            <ScrollView keyboardShouldPersistTaps="handled"
              style={[styles.filterOptions, { left, width: menuWidth, maxHeight },
                above ? { bottom: height - aboveBottom } : { top: belowTop }]}>
              <View accessibilityRole="radiogroup" accessibilityLabel={menuLabel}
                style={styles.filterOptionsContent}>
                {choices.map(choice => (
                  <Pressable key={choice.value} accessibilityRole="radio" aria-checked={value === choice.value}
                    onPress={() => { close(); onChange(choice.value); }}
                    style={({ pressed }) => [styles.filterOption,
                      ((highlightSelection && value === choice.value) || pressed) && styles.filterOptionSelected]}>
                    <Text style={[highlightSelection && value === choice.value ? styles.activeLabel : styles.controlLabel, styles.filterValue]}>
                      {choice.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>
          <ToastLayer />
        </Modal>
      ) : null}
    </View>
  );
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  field: { minWidth: 0, gap: 5 },
  disabled: { opacity: 0.5 },
  controlLabel: { color: colors.muted, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  activeLabel: { color: colors.accent, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  filterLabel: { flexGrow: 1, color: colors.muted, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  filterButton: { width: '100%', flexDirection: 'row', alignItems: 'center',
    gap: 4, paddingHorizontal: 6, borderWidth: 1, borderColor: colors.line, borderRadius: 9, backgroundColor: colors.paper },
  filterTriggerValue: { flex: 1, minWidth: 0, textAlign: 'center' },
  filterArrow: { flexShrink: 0 },
  filterArrowSpacer: { opacity: 0 },
  filterValue: { flexShrink: 1, textAlign: 'center' },
  filterOverlay: { flex: 1 },
  filterOptions: { position: 'absolute', borderWidth: 1, borderColor: colors.line, borderRadius: 9,
    backgroundColor: colors.paper, boxShadow: '0 8px 22px rgba(33, 25, 53, 0.18)' },
  filterOptionsContent: { padding: 4 },
  filterOption: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 6 },
  filterOptionSelected: { backgroundColor: colors.accentSoft },
  selected: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
}));
