import { useContext, useEffect, useRef, useState } from 'react';
import type { ComponentRef, ReactNode } from 'react';
import { Keyboard, Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import type { LayoutRectangle, StyleProp, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollViewportContext } from './KeyboardScrollView';
import { KeyboardViewport } from './KeyboardViewport';
import { ToastLayer } from './Toast';

export function useDropdownAnchor(menuHeight = 0) {
  const trigger = useRef<ComponentRef<typeof Pressable>>(null);
  const revealBelow = useContext(ScrollViewportContext);
  const [anchor, setAnchor] = useState<LayoutRectangle | null>(null);
  const releaseSpace = useRef<(() => void) | undefined>(undefined);

  useEffect(() => () => releaseSpace.current?.(), []);

  return {
    trigger,
    anchor,
    open() {
      const button = trigger.current;
      if (!button || releaseSpace.current) return;
      Keyboard.dismiss();
      const measure = () => button.measureInWindow((x, y, width, height) => {
        if (trigger.current === button) setAnchor({ x, y, width, height });
      });
      if (menuHeight && revealBelow) releaseSpace.current = revealBelow(button, menuHeight + 12, measure);
      else measure();
    },
    close() {
      setAnchor(null);
      releaseSpace.current?.();
      releaseSpace.current = undefined;
    },
  };
}

export function DropdownOverlay({ anchor, onClose, triggerContent, triggerStyle, panelStyle, keepAttached,
  minWidth, minHeight, maxHeight, children }: {
  anchor: LayoutRectangle;
  onClose: () => void;
  triggerContent: ReactNode;
  triggerStyle: StyleProp<ViewStyle>;
  panelStyle: StyleProp<ViewStyle>;
  keepAttached?: boolean;
  minWidth: number;
  minHeight: number;
  maxHeight: number;
  children: ReactNode;
}) {
  const { width, height } = useWindowDimensions();
  const [overlay, setOverlay] = useState<LayoutRectangle>();
  const insets = useSafeAreaInsets();
  const edge = 8;
  const gap = 4;
  const right = (overlay?.width ?? width) - insets.right - edge;
  const bottom = (overlay?.height ?? height) - insets.bottom - edge;
  const leftEdge = insets.left + edge;
  const topEdge = insets.top + edge;
  const menuWidth = Math.min(Math.max(anchor.width, minWidth), right - leftEdge);
  const left = Math.min(Math.max(leftEdge, anchor.x), right - menuWidth);
  // Move the open control inside the overlay when the menu needs more room below it.
  const triggerTop = keepAttached ? anchor.y : Math.max(topEdge, Math.min(anchor.y, bottom - minHeight - gap - anchor.height));
  const menuTop = triggerTop + anchor.height + gap;
  const moved = Math.abs(triggerTop - anchor.y) >= 1;

  return <Modal transparent statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
    <KeyboardViewport style={styles.fill}>
      <View style={styles.fill} onLayout={event => setOverlay(event.nativeEvent.layout)}>
        <Pressable style={[StyleSheet.absoluteFill, moved && styles.backdrop]} onPress={onClose}
          accessible={false} importantForAccessibility="no" tabIndex={-1} />
        {moved && <View aria-hidden pointerEvents="none"
          style={[triggerStyle, { position: 'absolute', top: triggerTop, left,
            width: Math.min(anchor.width, menuWidth), height: anchor.height }]}>
          {triggerContent}
        </View>}
        <View style={[panelStyle, { position: 'absolute', top: menuTop, left, width: menuWidth,
          maxHeight: Math.min(maxHeight, Math.max(0, bottom - menuTop)) }]}>
          {children}
        </View>
      </View>
    </KeyboardViewport>
    <ToastLayer />
  </Modal>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: { backgroundColor: 'rgba(33, 25, 53, 0.28)' },
});
