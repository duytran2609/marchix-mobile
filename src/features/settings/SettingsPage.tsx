import { useRef, useState } from 'react';
import type { ComponentRef, ReactNode, Ref } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ScrollView } from 'react-native';
import { KeyboardScrollView } from '../../components/KeyboardScrollView';
import { useScreenStyles } from '../../theme/screenStyles';
import { useTheme } from '../../theme/theme';

const dockPadding = 8;
const dockInset = dockPadding + 1;

export function SettingsPage({ scroll, header, children, panelHeader, saveButton }: {
  scroll: Ref<ComponentRef<typeof ScrollView>>;
  header: ReactNode;
  children: ReactNode;
  panelHeader?: ReactNode;
  saveButton?: ReactNode;
}) {
  const ui = useScreenStyles();
  const { colors } = useTheme();
  const bottomPadding = ui.page.paddingBottom + ui.panel.padding + ui.panel.borderWidth;
  const viewport = useRef<ComponentRef<typeof View>>(null);
  const panel = useRef<ComponentRef<typeof View>>(null);
  const layout = useRef({ pageBottom: 0, offset: 0, viewportHeight: 0 });
  const [docked, setDocked] = useState(false);
  const [dockFrame, setDockFrame] = useState<{ left: number; width: number }>();
  const [buttonHeight, setButtonHeight] = useState(44);
  const showDock = saveButton && docked && dockFrame;

  function alignDock() {
    if (!saveButton) return;
    const viewportBounds = viewport.current?.getBoundingClientRect();
    const panelBounds = panel.current?.getBoundingClientRect();
    if (!viewportBounds || !panelBounds?.width) return;
    const { width } = panelBounds;
    const left = panelBounds.left - viewportBounds.left;
    setDockFrame(current => current?.left === left && current.width === width ? current : { left, width });
  }

  function updateDock() {
    const { pageBottom, offset, viewportHeight } = layout.current;
    if (!saveButton || !pageBottom || !viewportHeight) return;
    // The inline save slot is last in the panel, even when the form changes height.
    setDocked(pageBottom - bottomPadding > Math.max(0, offset) + viewportHeight - dockInset);
  }

  return <View ref={viewport} collapsable={false} style={styles.viewport}>
    <KeyboardScrollView ref={scroll} contentContainerStyle={ui.scroll} keyboardShouldPersistTaps="handled"
      bottomObstruction={showDock ? buttonHeight + 2 * dockInset : 0}
      onLayout={event => {
        layout.current.viewportHeight = event.nativeEvent.layout.height;
        alignDock();
        updateDock();
      }}
      onScroll={event => {
        layout.current.offset = event.nativeEvent.contentOffset.y;
        updateDock();
      }}>
      <View style={[ui.page, ui.stack]} onLayout={event => {
        const { y, height } = event.nativeEvent.layout;
        layout.current.pageBottom = y + height;
        alignDock();
        updateDock();
      }}>
        {header}
        {panelHeader ? <View ref={panel} collapsable={false} style={ui.panel}>
          {panelHeader}
          {children}
          {saveButton && <View style={{ minHeight: buttonHeight }}>
            {!showDock && saveButton}
          </View>}
        </View> : children}
      </View>
    </KeyboardScrollView>
    {showDock && <View style={[styles.dock, dockFrame, {
      paddingHorizontal: ui.panel.padding, borderWidth: ui.panel.borderWidth,
      borderTopLeftRadius: ui.panel.borderRadius, borderTopRightRadius: ui.panel.borderRadius,
      backgroundColor: colors.paper, borderColor: colors.line,
    }]}>
      <View onLayout={event => setButtonHeight(event.nativeEvent.layout.height)}>{saveButton}</View>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  viewport: { flex: 1 },
  dock: { position: 'absolute', bottom: 0, paddingVertical: dockPadding },
});
