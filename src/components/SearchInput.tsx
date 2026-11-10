import { useRef } from 'react';
import type { ComponentRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';
import { colors } from '../theme/theme';

type Props = TextInputProps & {
  accessibilityLabel: string;
  value: string;
  onChangeText: (value: string) => void;
};

export function SearchInput({ accessibilityLabel, value, onChangeText, editable, style, ...props }: Props) {
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const hasValue = value.length > 0;

  return (
    <View style={styles.field}>
      <TextInput {...props} ref={input} accessibilityLabel={accessibilityLabel} value={value}
        onChangeText={onChangeText} editable={editable} style={[style, hasValue && styles.inputWithClear]} />
      {hasValue ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Xóa từ khóa ${accessibilityLabel.toLowerCase()}`}
          disabled={editable === false} style={styles.clear} onPress={() => {
            onChangeText('');
            input.current?.focus();
          }}>
          <Text style={styles.icon}>×</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { position: 'relative' },
  inputWithClear: { paddingRight: 48 },
  clear: { position: 'absolute', top: 0, right: 0, bottom: 0, width: 44,
    alignItems: 'center', justifyContent: 'center' },
  icon: { color: colors.muted, fontSize: 23, lineHeight: 26 },
});
