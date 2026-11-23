import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import type { ComponentRef, RefObject } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatVietnamDateTime } from '../../utils/dateTime';
import { db } from '../../services/firebase/firebase';
import { markNotificationsRead, watchNotifications } from './notifications';
import type { WorkspaceNotification } from './notifications';
import { ClickableCardHeader } from '../../components/CardChevron';
import { EmptyState } from '../../components/EmptyState';
import { PopupCloseButton } from '../../components/PopupCloseButton';
import { createThemedStyles, useTheme } from '../../theme/theme';
import { ToastLayer, useToast } from '../../components/Toast';

const inboxTabs = [{ id: 'all', label: 'Tất cả' }, { id: 'unread', label: 'Chưa đọc' }] as const;

export function WorkspaceNotifications({ email, header, edge, onOpenNote }: {
  email: string;
  header: RefObject<ComponentRef<typeof View> | null>;
  edge: number;
  onOpenNote: (note: WorkspaceNotification) => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [top, setTop] = useState<number | null>(null);
  const [tab, setTab] = useState<typeof inboxTabs[number]['id']>('all');
  const [notes, setNotes] = useState<WorkspaceNotification[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [seen, setSeen] = useState<Set<string> | null>(null);
  const showToast = useToast();
  const [saving, setSaving] = useState(false);
  const [retry, setRetry] = useState(0);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const seenKey = `marchix:seen-notifications:${db.app.options.projectId}:${email}`;
  const unread = notes?.filter(note => !note.read) ?? [];
  const visibleNotes = (tab === 'unread' ? unread : notes ?? []).slice(0, 30);
  const badgeCount = seen ? unread.filter(note => !seen.has(note.id)).length : 0;
  const opened = top !== null;

  useEffect(() => watchNotifications(email, setNotes, () => setLoadFailed(true)), [email, retry]);
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(seenKey).then(value => {
      const ids: unknown = value ? JSON.parse(value) : [];
      if (active) setSeen(new Set(Array.isArray(ids) ? ids.filter(id => typeof id === 'string') : []));
    }).catch(() => { if (active) setSeen(new Set()); });
    return () => { active = false; };
  }, [seenKey]);

  function openInbox() {
    header.current?.measureInWindow((_x, y, _width, headerHeight) => setTop(y + headerHeight + 6));
    if (badgeCount === 0) return;

    // Opening the bell clears its badge without changing the shared read flag used for email reminders.
    const ids = unread.map(note => note.id);
    setSeen(new Set(ids));
    void AsyncStorage.setItem(seenKey, JSON.stringify(ids)).catch(() => {
      showToast('Chưa lưu được số thông báo đã xem trên thiết bị.', 'error');
    });
  }

  function close() {
    setTop(null);
  }

  function reload() {
    setLoadFailed(false);
    setNotes(null);
    setRetry(value => value + 1);
  }

  async function markRead(items: WorkspaceNotification[]) {
    setSaving(true);
    try {
      await markNotificationsRead(items);
    } catch {
      showToast('Chưa lưu được trạng thái đã đọc. Vui lòng thử lại.', 'error');
    } finally {
      setSaving(false);
    }
  }

  function openNote(note: WorkspaceNotification) {
    if (!note.read) void markRead([note]);
    close();
    onOpenNote(note);
  }

  return (
    <>
      <Pressable accessibilityRole="button"
        accessibilityLabel={badgeCount ? `Thông báo, ${badgeCount} chưa đọc` : 'Thông báo'}
        aria-expanded={opened} onPress={openInbox}
        style={({ pressed }) => [styles.bellButton, (pressed || opened) && styles.pressed]}>
        <View aria-hidden style={styles.bellIcon}>
          <View style={styles.bellBody} />
          <View style={styles.bellRim} />
          <View style={styles.bellClapper} />
        </View>
        {badgeCount > 0 ? (
          <Text aria-hidden style={styles.count}>{badgeCount > 99 ? '99+' : badgeCount}</Text>
        ) : null}
      </Pressable>
      {top !== null ? (
        <Modal transparent statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessible={false}
            importantForAccessibility="no" tabIndex={-1} />
          <View accessibilityViewIsModal style={[styles.popup, {
            top, right: edge + insets.right,
            width: Math.min(320, width - insets.left - insets.right - edge * 2),
            maxHeight: Math.max(0, Math.min(480, height - top - insets.bottom - 10)),
          }]}>
            <View style={styles.header}>
              <Text accessibilityRole="header" style={styles.title}>Thông báo</Text>
              <PopupCloseButton label="Đóng thông báo" onPress={close} />
            </View>
            <View accessibilityRole="tablist" accessibilityLabel="Lọc thông báo" style={styles.tabs}>
              {inboxTabs.map(item => {
                const showCount = item.id === 'unread' && notes !== null && !loadFailed;
                const selected = tab === item.id;
                return (
                  <Pressable key={item.id} accessibilityRole="tab" aria-selected={selected}
                    accessibilityLabel={showCount ? `${item.label}, ${unread.length} thông báo` : item.label}
                    onPress={() => setTab(item.id)} style={[styles.tab, selected && styles.activeTab]}>
                    <Text style={[styles.tabLabel, selected && styles.activeTabLabel]}>{item.label}</Text>
                    {showCount ? <Text aria-hidden style={styles.tabCount}>{unread.length}</Text> : null}
                  </Pressable>
                );
              })}
            </View>
            {loadFailed ? (
              <View style={styles.feedback}>
                <Text accessibilityRole="alert" style={styles.error}>Không tải được thông báo.</Text>
                <Pressable accessibilityRole="button" onPress={reload} style={styles.action}>
                  <Text style={styles.actionText}>Thử lại</Text>
                </Pressable>
              </View>
            ) : notes === null ? (
              <ActivityIndicator accessibilityLabel="Đang tải thông báo" color={colors.accent} />
            ) : visibleNotes.length === 0 ? (
              <EmptyState icon="bell" message={tab === 'unread' ? 'Không có thông báo chưa đọc.' : 'Chưa có thông báo.'} announce />
            ) : (
              <>
                {unread.length > 0 ? (
                  <Pressable accessibilityRole="button" disabled={saving} onPress={() => void markRead(notes)}
                    style={styles.action}>
                    <Text style={styles.actionText}>Đánh dấu tất cả đã đọc</Text>
                  </Pressable>
                ) : null}
                <ScrollView key={tab} style={styles.list} contentContainerStyle={styles.listContent}>
                  {visibleNotes.map(note => {
                    const time = formatVietnamDateTime(note.createdAt);
                    return (
                      <Pressable key={note.id} accessibilityRole="button"
                        accessibilityLabel={note.read ? note.title : `Chưa đọc: ${note.title}`}
                        accessibilityHint={note.body || undefined} disabled={saving} onPress={() => openNote(note)}
                        style={({ pressed }) => [styles.note, !note.read && styles.unread, pressed && styles.pressed]}>
                        <ClickableCardHeader><Text style={styles.noteTitle}>{note.title}</Text></ClickableCardHeader>
                        {note.body ? <Text style={styles.muted}>{note.body}</Text> : null}
                        {time ? <Text style={styles.date}>{time}</Text> : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </>
            )}
          </View>
          <ToastLayer />
        </Modal>
      ) : null}
    </>
  );
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  bellButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  bellIcon: { alignItems: 'center' },
  bellBody: { width: 14, height: 14, borderWidth: 2, borderBottomWidth: 0,
    borderColor: colors.accent, borderTopLeftRadius: 7, borderTopRightRadius: 7 },
  bellRim: { width: 20, height: 2, borderRadius: 1, backgroundColor: colors.accent },
  bellClapper: { width: 4, height: 2, marginTop: 2, borderBottomLeftRadius: 2, borderBottomRightRadius: 2,
    backgroundColor: colors.accent },
  count: { position: 'absolute', top: -4, right: -5, minWidth: 19, paddingHorizontal: 4, borderRadius: 10,
    overflow: 'hidden', backgroundColor: colors.danger, color: colors.onAccent,
    textAlign: 'center', fontSize: 10, lineHeight: 17, fontWeight: '800' },
  popup: { position: 'absolute', padding: 14, gap: 8, borderRadius: 14, borderWidth: 1,
    borderColor: colors.line, backgroundColor: colors.paper, elevation: 8, boxShadow: '0 8px 24px rgba(33, 25, 53, 0.16)' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  tabs: { flexDirection: 'row', gap: 4, padding: 3, borderRadius: 10, backgroundColor: colors.surfaceMuted },
  tab: { flex: 1, flexDirection: 'row', gap: 6, minHeight: 44, paddingHorizontal: 6, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center' },
  activeTab: { backgroundColor: colors.paper },
  tabLabel: { color: colors.muted, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  activeTabLabel: { color: colors.accent },
  tabCount: { minWidth: 22, paddingHorizontal: 6, borderRadius: 10, overflow: 'hidden', textAlign: 'center',
    color: colors.accent, backgroundColor: colors.accentSoft, fontSize: 12, lineHeight: 20, fontWeight: '800' },
  feedback: { gap: 4 },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  error: { color: colors.danger, fontSize: 13 },
  action: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  actionText: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  list: { flexGrow: 0, flexShrink: 1 },
  listContent: { gap: 6 },
  note: { padding: 10, gap: 4, borderRadius: 8, backgroundColor: colors.background },
  unread: { backgroundColor: colors.accentSoft },
  pressed: { opacity: 0.75 },
  noteTitle: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  date: { color: colors.muted, fontSize: 11 },
}));
