import type { ComponentRef, ReactNode, Ref } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from './Button';
import { AttachmentLabel } from './AttachmentLabel';
import { Dropdown } from './Dropdown';
import { MemberAvatar } from './MemberAvatar';
import { TextInput } from './TextInput';
import { useScreenStyles } from '../theme/screenStyles';
import { createThemedStyles, useTheme } from '../theme/theme';

export type DiscussionSort = 'oldest' | 'newest';
const sortChoices = [
  { value: 'oldest', label: 'Cũ nhất → Mới nhất' },
  { value: 'newest', label: 'Mới nhất → Cũ nhất' },
] as const;

export function DiscussionHeader({ sort, onSort }: {
  sort: DiscussionSort; onSort?: (sort: DiscussionSort) => void;
}) {
  const styles = useStyles();
  const ui = useScreenStyles();
  return <View style={styles.titleRow}>
    <Text accessibilityRole="header" style={ui.cardTitle}>Trao đổi</Text>
    {onSort && <Dropdown label="Sắp xếp theo thời gian" hideLabel style={styles.sortControl}
      value={sort} choices={sortChoices} onChange={onSort} highlightSelection={false} />}
  </View>;
}

export function DiscussionHistory({ children }: { children: ReactNode }) {
  const ui = useScreenStyles();
  const styles = useStyles();
  return <View style={[ui.panel, styles.history]}>{children}</View>;
}

export function DiscussionMessage({ author, photoURL, time, first, children, onReply, replyDisabled }: {
  author: string; photoURL?: string | null; time: string; first?: boolean; children: ReactNode;
  onReply?: () => void; replyDisabled?: boolean;
}) {
  const ui = useScreenStyles();
  const styles = useStyles();
  return <View style={[ui.detailRow, styles.row, first && styles.firstRow]}>
    <MemberAvatar name={author} photoURL={photoURL} />
    <View style={styles.content}>
      <View style={styles.messageHeader}>
        <Text style={[ui.label, styles.author]}>{author}</Text>
        {!!time && <Text style={styles.time}>{time}</Text>}
      </View>
      {children}
      {onReply && <Pressable accessibilityRole="button" accessibilityLabel={`Trả lời trao đổi của ${author}`}
        disabled={replyDisabled} style={[styles.replyButton, styles.messageReply]} onPress={onReply}>
        <Text style={styles.replyAction}>Trả lời</Text>
      </Pressable>}
    </View>
  </View>;
}

export function DiscussionQuote({ author, text }: { author: string; text: string }) {
  const styles = useStyles();
  const ui = useScreenStyles();
  return <View style={styles.quote}>
    <Text style={ui.label}>Trả lời {author}</Text>
    <Text numberOfLines={2} style={ui.muted}>{text}</Text>
  </View>;
}

export function DiscussionAttachment({ file, detail, onOpen, disabled }: {
  file: { name: string; type: string }; detail: string; onOpen?: () => void; disabled?: boolean;
}) {
  const ui = useScreenStyles();
  const styles = useStyles();
  const content = <AttachmentLabel file={file}>
    <Text style={ui.label}>{file.name}</Text>
    <Text style={ui.muted}>{detail}</Text>
  </AttachmentLabel>;
  const style = [ui.secondary, styles.attachment];
  return onOpen ? <Pressable accessibilityRole="button" accessibilityLabel={`Xem tệp ${file.name}`}
    disabled={disabled} style={style} onPress={onOpen}>{content}</Pressable>
    : <View style={style}>{content}</View>;
}

export function DiscussionComposer({ inputRef, message, onChange, placeholder, maxLength, sending, disabled,
  attachmentBusy, onAttach, quote, onCancelReply, extras, sendLabel, onSend, canSend }: {
  inputRef?: Ref<ComponentRef<typeof TextInput>>; message: string; onChange: (text: string) => void;
  placeholder: string; maxLength: number; sending: boolean; disabled?: boolean;
  attachmentBusy?: boolean; onAttach?: () => void; quote?: ReactNode; onCancelReply?: () => void;
  extras?: ReactNode; sendLabel?: string; onSend: () => void; canSend?: boolean;
}) {
  const ui = useScreenStyles();
  const styles = useStyles();
  const { colors } = useTheme();
  const busy = disabled || sending || attachmentBusy;
  return <View style={ui.stack}>
    {quote && <View style={styles.replyPreview}>
      {quote}
      <Pressable accessibilityRole="button" disabled={busy} style={styles.replyButton} onPress={onCancelReply}>
        <Text style={styles.replyAction}>Hủy trả lời</Text>
      </Pressable>
    </View>}
    <View>
      <TextInput ref={inputRef} accessibilityLabel="Nội dung trao đổi" placeholder={placeholder}
        style={[ui.input, ui.messageInput, onAttach && styles.inputWithAttachment]}
        value={message} onChangeText={onChange} multiline maxLength={maxLength} editable={!sending && !disabled} />
      {onAttach && <Pressable accessibilityRole="button" accessibilityLabel="Đính kèm tệp"
        accessibilityHint="Tối đa 5 tệp mỗi lượt, 5 MB mỗi tệp và 8 MB tổng cộng."
        accessibilityState={{ busy: attachmentBusy }} disabled={busy} onPress={onAttach}
        style={({ pressed }) => [styles.attachButton, (pressed || busy) && ui.dimmed]}>
        {attachmentBusy ? <ActivityIndicator color={colors.accent} /> :
          <View aria-hidden pointerEvents="none" style={styles.paperclip}>
            <View style={[styles.paperclipStroke, styles.paperclipOuter]} />
            <View style={[styles.paperclipStroke, styles.paperclipTop]} />
            <View style={[styles.paperclipStroke, styles.paperclipInner]} />
          </View>}
      </Pressable>}
    </View>
    {extras}
    <Button label={sending ? 'Đang gửi…' : sendLabel ?? (quote ? 'Gửi trả lời' : 'Gửi trao đổi')}
      onPress={onSend} disabled={busy || !(canSend ?? message.trim())} />
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  sortControl: { width: 172, maxWidth: '65%' },
  history: { gap: 4 },
  attachment: { padding: 10, borderRadius: 9 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  firstRow: { borderTopWidth: 0, paddingTop: 0 },
  content: { flex: 1, minWidth: 0, gap: 3 },
  messageHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  author: { flex: 1, minWidth: 0, fontWeight: '800' },
  time: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  quote: { flexShrink: 1, borderLeftWidth: 3, borderLeftColor: colors.accent, backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 8, paddingVertical: 5, gap: 2 },
  replyPreview: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  replyButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  messageReply: { justifyContent: 'flex-start', paddingHorizontal: 0 },
  replyAction: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  inputWithAttachment: { minHeight: 110, paddingBottom: 48 },
  attachButton: { position: 'absolute', right: 4, bottom: 4, width: 44, height: 44,
    alignItems: 'center', justifyContent: 'center' },
  paperclip: { width: 20, height: 24, transform: [{ scale: 0.75 }] },
  paperclipStroke: { position: 'absolute', borderWidth: 2, borderColor: colors.accent },
  paperclipOuter: { left: 2, top: 5, width: 16, height: 19, borderTopWidth: 0,
    borderBottomLeftRadius: 8, borderBottomRightRadius: 8 },
  paperclipTop: { left: 7, top: 0, width: 11, height: 16, borderBottomWidth: 0,
    borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  paperclipInner: { left: 7, top: 8, width: 6, height: 11, borderTopWidth: 0,
    borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
}));
