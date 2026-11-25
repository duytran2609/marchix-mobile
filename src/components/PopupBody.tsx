import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from './Button';
import { KeyboardScrollView } from './KeyboardScrollView';

export function PopupAction(props: ComponentProps<typeof Button>) {
  return <Button {...props} labelStyle={[props.labelStyle, popupActionText]} />;
}

export const popupActionText = { fontWeight: '500', textTransform: 'none' } as const;

export function PopupBody({ footer, inset = true, style, ...props }: ComponentProps<typeof KeyboardScrollView> & {
  footer?: ReactNode;
  inset?: boolean;
}) {
  return <>
    <KeyboardScrollView keyboardShouldPersistTaps="handled" {...props} style={[styles.scroll, style]} />
    {footer && <View style={[styles.footer, inset && styles.inset]}>{footer}</View>}
  </>;
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  footer: { flexShrink: 0, gap: 8 },
  inset: { paddingHorizontal: 16, paddingVertical: 12 },
});
