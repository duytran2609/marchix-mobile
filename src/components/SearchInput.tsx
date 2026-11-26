import { useRef } from 'react';
import type { ComponentRef } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { TextInput } from './TextInput';
import type { TextInputProps } from 'react-native';
import { createThemedStyles } from '../theme/theme';

type Props = Pick<TextInputProps, 'editable' | 'maxLength'> & {
  accessibilityLabel: string;
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
};

export function SearchInput({ accessibilityLabel, value, onChangeText, editable, ...props }: Props) {
  const styles = useStyles();
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const hasValue = value.length > 0;

  return <TextInput maxLength={160} {...props} ref={input} accessibilityLabel={accessibilityLabel} value={value}
    onChangeText={onChangeText} editable={editable}
    autoCapitalize="none" autoCorrect={false} returnKeyType="search" underlineColorAndroid="transparent"
    style={[styles.input, hasValue && styles.inputWithClear]} accessory={<>
      <View aria-hidden pointerEvents="none" style={styles.searchIconSlot}>
        <Image source={require('../../assets/empty-state/search.png')} resizeMode="contain" style={styles.searchIcon} />
      </View>
      {hasValue ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Xóa từ khóa ${accessibilityLabel.toLowerCase()}`}
          disabled={editable === false} style={styles.clear} onPress={() => {
            onChangeText('');
            input.current?.focus();
          }}>
          <Text style={styles.icon}>×</Text>
        </Pressable>
      ) : null}
    </>} />;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  input: { minHeight: 44, paddingLeft: 34, paddingRight: 12, paddingTop: 0, paddingBottom: 2,
    borderWidth: 1, borderColor: colors.line, borderRadius: 9, backgroundColor: colors.paper,
    fontSize: 17, lineHeight: 22, includeFontPadding: false, textAlignVertical: 'center' },
  inputWithClear: { paddingRight: 48 },
  searchIconSlot: { position: 'absolute', top: 0, bottom: 2, left: 10, justifyContent: 'center' },
  searchIcon: { width: 16, height: 16, tintColor: colors.inputPlaceholder },
  clear: { position: 'absolute', top: 0, right: 0, bottom: 0, width: 44,
    alignItems: 'center', justifyContent: 'center', paddingBottom: 2 },
  icon: { color: colors.muted, fontSize: 23, lineHeight: 26, includeFontPadding: false },
}));
