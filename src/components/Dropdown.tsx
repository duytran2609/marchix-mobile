import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { FieldLabel } from './FieldLabel';
import { createThemedStyles } from '../theme/theme';
import { DropdownOverlay, useDropdownAnchor } from './DropdownOverlay';

export function Dropdown<Value extends string | number>({ label, value, choices, onChange, style, disabled,
  singleLineValue = false, fallbackLabel = String(value), menuLabel = label, hideLabel = false,
  highlightSelection = true, required, keepMenuAttached }: {
  label: string; value: Value; choices: readonly { value: Value; label: string }[]; onChange: (value: Value) => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  singleLineValue?: boolean;
  fallbackLabel?: string;
  menuLabel?: string;
  hideLabel?: boolean;
  required?: boolean;
  highlightSelection?: boolean;
  keepMenuAttached?: boolean;
}) {
  const styles = useStyles();
  const maxHeight = 274;
  const { trigger, anchor, open, close } =
    useDropdownAnchor(keepMenuAttached ? Math.min(maxHeight, choices.length * 44 + 10) : 0);
  const { fontScale } = useWindowDimensions();
  const selectedLabel = choices.find(choice => choice.value === value)?.label ?? fallbackLabel;
  const triggerStyle = [styles.filterButton, { height: 44 * Math.max(1, fontScale) },
    highlightSelection && (anchor || value !== choices[0]?.value) && styles.selected, disabled && styles.disabled];
  const triggerContent = <>
    <Text aria-hidden style={[styles.activeLabel, styles.filterArrow, styles.filterArrowSpacer]}>▾</Text>
    <Text numberOfLines={singleLineValue ? 1 : 2} ellipsizeMode="tail"
      style={[styles.activeLabel, styles.filterTriggerValue]}>{selectedLabel}</Text>
    <Text aria-hidden style={[styles.activeLabel, styles.filterArrow]}>▾</Text>
  </>;

  return (
    <View style={[styles.field, style]}>
      {!hideLabel && <FieldLabel style={styles.filterLabel} required={required}>{label}</FieldLabel>}
      <Pressable ref={trigger} accessibilityRole="button" accessibilityLabel={`${label}: ${selectedLabel}`}
        aria-expanded={!!anchor} disabled={disabled} onPress={open}
        style={triggerStyle}>
        {triggerContent}
      </Pressable>
      {anchor && !disabled ? (
        <DropdownOverlay anchor={anchor} onClose={close} triggerStyle={triggerStyle} triggerContent={triggerContent}
          panelStyle={styles.filterOptions} keepAttached={keepMenuAttached}
          minWidth={keepMenuAttached ? 0 : 160} minHeight={Math.min(3, choices.length) * 44 + 10} maxHeight={maxHeight}>
          <ScrollView keyboardShouldPersistTaps="handled" style={styles.filterScroll}>
            <View accessibilityRole="radiogroup" accessibilityLabel={menuLabel} style={styles.filterOptionsContent}>
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
        </DropdownOverlay>
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
  filterOptions: { borderWidth: 1, borderColor: colors.line, borderRadius: 9,
    backgroundColor: colors.paper, boxShadow: '0 8px 22px rgba(33, 25, 53, 0.18)' },
  filterScroll: { flexShrink: 1, flexGrow: 0 },
  filterOptionsContent: { padding: 4 },
  filterOption: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 6 },
  filterOptionSelected: { backgroundColor: colors.accentSoft },
  selected: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
}));
