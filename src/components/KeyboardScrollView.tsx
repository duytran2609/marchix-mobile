import { createContext, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { ComponentRef, Ref } from 'react';
import { Keyboard, Platform, ScrollView, TextInput, View } from 'react-native';
import type { ScrollViewProps } from 'react-native';

const inputMargin = 12;
type ScrollInstance = ComponentRef<typeof ScrollView>;

type RevealBelow = (anchor: ComponentRef<typeof View>, space: number, onPositionChange: () => void) => () => void;
export const ScrollViewportContext = createContext<RevealBelow | null>(null);

function visibleOffset(top: number, height: number, offset: number, viewportHeight: number) {
  const bottom = top + Math.min(height, Math.max(0, viewportHeight - 2 * inputMargin));
  if (top < offset + inputMargin) return Math.max(0, top - inputMargin);
  if (bottom > offset + viewportHeight - inputMargin) return bottom - viewportHeight + inputMargin;
  return offset;
}

export function KeyboardScrollView({
  ref, children, onFocus, onLayout, onScroll, scrollEnabled, scrollEventThrottle, bottomObstruction = 0, ...props
}: ScrollViewProps & { ref?: Ref<ScrollInstance>; bottomObstruction?: number }) {
  const scroll = useRef<ScrollInstance>(null);
  const frame = useRef<number>(0);
  const height = useRef(0);
  const offset = useRef(0);
  const [endSpace, setEndSpace] = useState<{ height: number; reveal: () => void } | null>(null);
  const updateDropdownPosition = useRef<(() => void) | null>(null);
  useImperativeHandle(ref, () => scroll.current!, []);

  const revealBelow: RevealBelow = useCallback((anchor, space, onPositionChange) => {
    let positionFrame: number | undefined;
    let tracking = false;
    function updatePosition() {
      if (!tracking || positionFrame !== undefined) return;
      positionFrame = requestAnimationFrame(() => {
        positionFrame = undefined;
        onPositionChange();
      });
    }

    // On native, the scroll command and the updated anchor position can arrive in different frames.
    updateDropdownPosition.current = updatePosition;
    function stopTracking() {
      tracking = false;
      if (positionFrame !== undefined) cancelAnimationFrame(positionFrame);
      if (updateDropdownPosition.current === updatePosition) updateDropdownPosition.current = null;
    }

    const view = scroll.current;
    const viewport = view?.getBoundingClientRect();
    const button = anchor.getBoundingClientRect();
    const room = viewport ? Math.min(space, viewport.height - bottomObstruction - button.height - 8) : 0;
    if (!view || !viewport || room <= 0 || viewport.bottom - bottomObstruction - button.bottom >= room) {
      tracking = true;
      updatePosition();
      return stopTracking;
    }

    const needed = button.bottom + room + bottomObstruction - viewport.bottom;
    const targetOffset = view.scrollTop + needed;
    const contentBottom = view.getInnerViewRef()?.getBoundingClientRect().bottom ?? viewport.bottom;
    const extra = Math.ceil(needed - Math.max(0, contentBottom - viewport.bottom));
    const reservation = {
      height: extra,
      reveal() {
        if (tracking || updateDropdownPosition.current !== updatePosition) return;
        tracking = true;
        view.scrollTo({ x: view.scrollLeft, y: targetOffset, animated: false });
        updatePosition();
      },
    };

    // Extend the scroll range after the existing content, leaving every child in place.
    if (extra > 0) setEndSpace(reservation);
    else reservation.reveal();
    return () => {
      stopTracking();
      if (extra > 0) setEndSpace(current => current === reservation ? null : current);
    };
  }, [bottomObstruction]);

  const revealInput = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const view = scroll.current;
      if (!view || scrollEnabled === false) return;

      if (Platform.OS === 'web') {
        const node = view.getScrollableNode() as unknown as HTMLElement | undefined;
        const input = document.activeElement;
        if (!node || !(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) || !node.contains(input)) return;
        const field = input.getBoundingClientRect();
        const viewport = node.getBoundingClientRect();
        const y = visibleOffset(field.top - viewport.top + node.scrollTop, field.height, node.scrollTop,
          Math.max(0, node.clientHeight - bottomObstruction));
        if (y !== node.scrollTop) node.scrollTop = y;
        return;
      }

      const input = TextInput.State.currentlyFocusedInput();
      const content = view.getInnerViewRef();
      if (!input || !content || !height.current) return;
      input.measureLayout(content, (_, top, __, inputHeight) => {
        if (input !== TextInput.State.currentlyFocusedInput() || view !== scroll.current) return;
        const y = visibleOffset(top, inputHeight, offset.current, Math.max(0, height.current - bottomObstruction));
        if (y !== offset.current) view.scrollTo({ y, animated: false });
      }, () => { /* The focused input can belong to a different scroll view or modal. */ });
    });
  }, [bottomObstruction, scrollEnabled]);

  useEffect(() => {
    const shown = Platform.OS === 'web' ? undefined : Keyboard.addListener('keyboardDidShow', revealInput);
    const moved = Platform.OS === 'ios' ? Keyboard.addListener('keyboardDidChangeFrame', revealInput) : undefined;
    return () => {
      shown?.remove();
      moved?.remove();
      cancelAnimationFrame(frame.current);
    };
  }, [revealInput]);

  return <ScrollViewportContext.Provider value={revealBelow}>
    <ScrollView {...props} ref={scroll} scrollEnabled={scrollEnabled} scrollEventThrottle={scrollEventThrottle ?? 16}
      onFocus={event => { onFocus?.(event); revealInput(); }}
      onLayout={event => {
        height.current = event.nativeEvent.layout.height;
        onLayout?.(event);
        revealInput();
      }}
      onScroll={event => {
        offset.current = event.nativeEvent.contentOffset.y;
        updateDropdownPosition.current?.();
        onScroll?.(event);
      }}>
      {children}
      {endSpace && <View collapsable={false} onLayout={endSpace.reveal}
        style={{ height: endSpace.height, flexShrink: 0 }} />}
    </ScrollView>
  </ScrollViewportContext.Provider>;
}
