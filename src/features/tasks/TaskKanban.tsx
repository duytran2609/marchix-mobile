import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentRef, ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { GestureResponderEvent, ViewProps } from 'react-native';
import { pilotMode, taskAssignmentEnabled } from '../../services/firebase/firebase';
import { editableStatus, editableStatuses, saveProgress } from './tasks';
import type { EditableStatus, Task } from './tasks';
import { colors } from '../../theme/theme';
import { useToast } from '../../components/Toast';

type Column = { status: string; tasks: Task[] };
type Point = { x: number; y: number };
type Viewport = Point & { width: number; height: number };
type Gesture = {
  task: Task;
  start: Point;
  point: Point;
  statuses: string[];
  timer: ReturnType<typeof setTimeout>;
  active: boolean;
  moved: boolean;
  viewport?: Viewport;
};
type Preview = { task: Task; x: number; y: number; target?: string };

const columnGap = 10;
const holdDelay = 380;
const movementSlop = 9;

function stopWebScroll(event: Event) {
  if (event.cancelable) event.preventDefault();
}

function unlockWebScroll() {
  if (Platform.OS !== 'web') return;
  document.removeEventListener('touchmove', stopWebScroll, true);
  document.removeEventListener('contextmenu', stopWebScroll, true);
}

function pointOf(event: GestureResponderEvent): Point {
  const touch = event.nativeEvent.changedTouches?.[0] ?? event.nativeEvent;
  return { x: touch.pageX, y: touch.pageY };
}

function columnAt(gesture: Gesture, offset: number, columnWidth: number) {
  const { viewport, point, statuses } = gesture;
  if (!viewport) return;
  const x = point.x - viewport.x;
  const y = point.y - viewport.y;
  if (x < 0 || x >= viewport.width || y < 0 || y >= viewport.height) return;
  const contentX = x + offset;
  const step = columnWidth + columnGap;
  if (contentX % step < columnWidth) return statuses[Math.floor(contentX / step)];
}

export function TaskKanban({ columns, columnWidth, email, columnColor, renderCard, onOpen, onDragChange }: {
  columns: Column[];
  columnWidth: number;
  email: string;
  columnColor: (status: string) => string;
  renderCard: (task: Task, open: (task: Task) => void) => ReactNode;
  onOpen: (task: Task) => void;
  onDragChange: (dragging: boolean) => void;
}) {
  const board = useRef<ComponentRef<typeof View>>(null);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const offset = useRef(0);
  const gesture = useRef<Gesture | null>(null);
  const frame = useRef<number>(0);
  const blockedClick = useRef<{ id: string; until: number } | null>(null);
  const saving = useRef(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pending, setPending] = useState(false);
  const showToast = useToast();
  const extraColumns = editableStatuses.filter(status => !columns.some(column => column.status === status));
  const displayed = preview ? [...columns, ...extraColumns.map(status => ({ status, tasks: [] }))] : columns;
  const ghostWidth = Math.min(200, columnWidth - 20);
  const canDrag = (!pilotMode || taskAssignmentEnabled) && columns.some(column => editableStatus(column.status) &&
    column.tasks.some(task => task.assigneeEmail === email && editableStatus(task.status)));

  useEffect(() => () => {
    if (gesture.current) {
      clearTimeout(gesture.current.timer);
      if (gesture.current.active) {
        unlockWebScroll();
        onDragChange(false);
      }
      gesture.current = null;
    }
    cancelAnimationFrame(frame.current);
  }, [onDragChange]);

  function paint(current: Gesture) {
    const viewport = current.viewport;
    if (!viewport) return;
    const x = Math.max(0, Math.min(current.point.x - viewport.x - ghostWidth / 2, viewport.width - ghostWidth));
    const y = Math.max(0, Math.min(current.point.y - viewport.y + 14, viewport.height - 52));
    const target = columnAt(current, offset.current, columnWidth);
    setPreview(last => last?.x === x && last.y === y && last.target === target
      ? last : { task: current.task, x, y, target });
  }

  function autoScroll(current: Gesture) {
    if (gesture.current !== current || !current.viewport) return;
    const viewport = current.viewport;
    const x = current.point.x - viewport.x;
    const y = current.point.y - viewport.y;
    const edge = 48;
    if (current.moved && y >= 0 && y < viewport.height && x >= -edge && x <= viewport.width + edge) {
      const direction = x < edge ? -1 : x > viewport.width - edge ? 1 : 0;
      if (direction) {
        const distance = direction < 0 ? x : viewport.width - x;
        const speed = Math.min(15, Math.max(2, (edge - distance) / 3));
        const max = Math.max(0, current.statuses.length * (columnWidth + columnGap) - columnGap - viewport.width);
        const next = Math.min(max, Math.max(0, offset.current + direction * speed));
        if (Math.abs(next - offset.current) > 0.1) {
          offset.current = next;
          scroll.current?.scrollTo({ x: next, animated: false });
          paint(current);
        }
      }
    }
    frame.current = requestAnimationFrame(() => autoScroll(current));
  }

  function start(task: Task, event: GestureResponderEvent) {
    if (saving.current || gesture.current) return;
    blockedClick.current = null;
    const point = pointOf(event);
    const current: Gesture = {
      task, start: point, point, statuses: [...columns.map(column => column.status), ...extraColumns],
      active: false, moved: false, timer: setTimeout(() => lift(current), holdDelay),
    };
    gesture.current = current;
  }

  function lift(current: Gesture) {
    if (gesture.current !== current) return;
    current.active = true;
    setPreview({ task: current.task, x: 0, y: 0 });
    onDragChange(true);
    scroll.current?.scrollTo({ x: offset.current, animated: false });
    const viewportReady = (x: number, y: number, width: number, height: number) => {
      if (gesture.current !== current) return;
      current.viewport = { x, y, width, height };
      paint(current);
      frame.current = requestAnimationFrame(() => autoScroll(current));
    };
    if (Platform.OS === 'web' && board.current) {
      // Keep normal touch scrolling enabled until the card has been lifted.
      document.addEventListener('touchmove', stopWebScroll, { passive: false, capture: true });
      document.addEventListener('contextmenu', stopWebScroll, true);
      const rect = (board.current as unknown as HTMLElement).getBoundingClientRect();
      viewportReady(rect.left + window.scrollX, rect.top + window.scrollY, rect.width, rect.height);
    } else {
      board.current?.measure((_x, _y, width, height, x, y) => viewportReady(x, y, width, height));
    }
  }

  function move(event: GestureResponderEvent) {
    const current = gesture.current;
    if (!current) return;
    current.point = pointOf(event);
    if (current.active) {
      current.moved = true;
      paint(current);
    } else if (Math.hypot(current.point.x - current.start.x, current.point.y - current.start.y) > movementSlop) {
      current.moved = true;
      clearTimeout(current.timer);
    }
  }

  function release(event?: GestureResponderEvent) {
    const current = gesture.current;
    if (!current) return;
    gesture.current = null;
    clearTimeout(current.timer);
    if (current.active || current.moved || !event) {
      blockedClick.current = { id: current.task.id, until: Date.now() + 450 };
    }
    if (!current.active) {
      if (event && !current.moved && Platform.OS !== 'web') onOpen(current.task);
      return;
    }
    cancelAnimationFrame(frame.current);
    unlockWebScroll();
    setPreview(null);
    onDragChange(false);
    if (!event) return;
    current.point = pointOf(event);
    const status = columnAt(current, offset.current, columnWidth);
    if (status && status !== current.task.status && editableStatus(status)) void commit(current.task, status);
    else if (status === 'Chờ duyệt' || status === 'Xong') {
      showToast('Dùng luồng báo hoàn thành và duyệt việc để cập nhật cột này.', 'neutral');
    }
  }

  async function commit(task: Task, status: EditableStatus) {
    saving.current = true;
    setPending(true);
    try {
      await saveProgress(task, email, status);
      showToast(`Đã chuyển công việc sang ${status}.`);
    } catch (error) {
      const conflict = error instanceof Error && error.message.startsWith('Công việc vừa thay đổi.');
      showToast(conflict ? 'Công việc vừa thay đổi. Hãy kéo lại từ cột hiện tại.'
        : 'Chưa đổi được trạng thái. Vui lòng thử lại.', 'error');
    } finally {
      saving.current = false;
      setPending(false);
    }
  }

  function handlers(task: Task): ViewProps | undefined {
    if ((pilotMode && !taskAssignmentEnabled) || task.assigneeEmail !== email || !editableStatus(task.status)) return;
    return {
      onStartShouldSetResponderCapture: () => !saving.current,
      onResponderGrant: event => start(task, event),
      onResponderMove: move,
      onResponderRelease: release,
      onResponderTerminate: () => release(),
      onResponderTerminationRequest: () => !gesture.current?.active,
      style: preview?.task.id === task.id && styles.source,
    };
  }

  const open = useCallback((task: Task) => {
    if (blockedClick.current?.id === task.id && Date.now() < blockedClick.current.until) return;
    onOpen(task);
  }, [onOpen]);

  return (
    <View style={styles.wrapper}>
      {canDrag ? <Text style={[styles.muted, styles.dragHint]}>Nhấn giữ thẻ, rồi kéo sang cột trạng thái.</Text> : null}
      <View ref={board} collapsable={false} style={styles.viewport}>
        <ScrollView ref={scroll} horizontal scrollEnabled={!preview} keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.columns} scrollEventThrottle={16}
          onScroll={event => { if (!gesture.current?.active) offset.current = Math.max(0, event.nativeEvent.contentOffset.x); }}>
          {displayed.map(column => {
            const target = preview && editableStatus(column.status) && column.status !== preview.task.status;
            return (
              <View key={column.status} style={[styles.column, { width: columnWidth },
                target && styles.target, target && preview.target === column.status && styles.hovered]}>
                <View style={styles.columnHeader}>
                  <Text accessibilityRole="header" style={[styles.columnTitle, { color: columnColor(column.status) }]}>
                    {column.status}
                  </Text>
                  <Text style={styles.muted}>{column.tasks.length}</Text>
                </View>
                {column.tasks.length ? column.tasks.map(task => (
                  <View key={task.id} {...handlers(task)}>{renderCard(task, open)}</View>
                )) : <Text style={styles.muted}>Chưa có việc</Text>}
              </View>
            );
          })}
        </ScrollView>
        {preview ? <View pointerEvents="none" accessible={false} aria-hidden
          style={[styles.ghost, { left: preview.x, top: preview.y, width: ghostWidth }]}>
          <Text numberOfLines={2} ellipsizeMode="tail" style={styles.ghostTitle}>{preview.task.title}</Text>
        </View> : null}
      </View>
      {pending ? <Text accessibilityLiveRegion="polite" style={styles.muted}>Đang đổi trạng thái…</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 6 },
  dragHint: { transform: [{ translateY: -4 }] },
  viewport: { overflow: 'hidden' },
  columns: { gap: columnGap, alignItems: 'stretch', paddingBottom: 10 },
  column: { padding: 9, gap: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.surfaceMuted,
    backgroundColor: colors.surfaceMuted, minHeight: 100 },
  columnHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  columnTitle: { fontSize: 14, fontWeight: '800' },
  muted: { color: colors.muted, fontSize: 13 },
  target: { borderColor: colors.accent, borderStyle: 'dashed' },
  hovered: { borderStyle: 'solid', backgroundColor: colors.accentSoft },
  source: { opacity: 0.45 },
  ghost: { position: 'absolute', padding: 9, borderWidth: 1, borderRadius: 10, borderColor: colors.accent,
    backgroundColor: colors.paper, boxShadow: '0 3px 12px rgba(33, 25, 53, 0.22)' },
  ghostTitle: { color: colors.accent, fontSize: 14, fontWeight: '800' },
});
