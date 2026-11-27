import { useEffect, useRef, useState, type ComponentRef, type ReactNode, type Ref } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
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

export function DiscussionHeader({ sort, onSort, action }: {
  sort: DiscussionSort; onSort?: (sort: DiscussionSort) => void; action?: ReactNode;
}) {
  const styles = useStyles();
  const ui = useScreenStyles();
  return <View style={styles.titleRow}>
    <Text accessibilityRole="header" style={ui.cardTitle}>Trao đổi</Text>
    {onSort && <Dropdown label="Sắp xếp theo thời gian" hideLabel style={styles.sortControl}
      value={sort} choices={sortChoices} onChange={onSort} highlightSelection={false} />}
    {action}
  </View>;
}

export function DiscussionHistory({ children }: { children: ReactNode }) {
  const ui = useScreenStyles();
  const styles = useStyles();
  return <View style={[ui.panel, styles.history]}>{children}</View>;
}

export function DiscussionMessage({ author, photoURL, time, first, indented, children, onReply, replyDisabled, actions, footerActions }: {
  author: string; photoURL?: string | null; time: string; first?: boolean; children: ReactNode;
  indented?: boolean; onReply?: () => void; replyDisabled?: boolean; actions?: ReactNode; footerActions?: ReactNode;
}) {
  const ui = useScreenStyles();
  const styles = useStyles();
  return <View style={[ui.detailRow, styles.row, first && styles.firstRow, indented && styles.indentedRow]}>
    <MemberAvatar name={author} photoURL={photoURL} />
    <View style={styles.content}>
      <View style={[styles.messageHeader, !!actions && styles.messageHeaderWithActions]}>
        <Text style={[ui.label, styles.author]}>{author}</Text>
        {!!time && <Text style={styles.time}>{time}</Text>}
      </View>
      {children}
      {(onReply || footerActions) && <View style={styles.messageFooter}>
        {onReply && <Pressable accessibilityRole="button" accessibilityLabel={`Trả lời trao đổi của ${author}`}
          disabled={replyDisabled} style={[styles.replyButton, styles.messageReply]} onPress={onReply}>
          <Text style={styles.replyAction}>Trả lời</Text>
        </Pressable>}
        {footerActions}
      </View>}
    </View>
    {actions}
  </View>;
}

function DiscussionReplyLabel({ author }: { author: string }) {
  const ui = useScreenStyles();
  const styles = useStyles();
  return <Text style={[ui.label, styles.replyLabel]}>Trả lời <Text style={ui.label}>{author}</Text></Text>;
}

export function DiscussionQuote({ author, text }: { author: string; text?: string }) {
  const styles = useStyles();
  const ui = useScreenStyles();
  return <View style={styles.quote}>
    <DiscussionReplyLabel author={author} />
    {!!text && <Text numberOfLines={2} ellipsizeMode="tail" style={ui.muted}>{text}</Text>}
  </View>;
}

export function DiscussionAttachment({ file, detail, onOpen, openLabel = `Xem tệp ${file.name}`, disabled, action }: {
  file: { name: string; type: string }; detail: string; onOpen?: () => void; openLabel?: string;
  disabled?: boolean; action?: ReactNode;
}) {
  const ui = useScreenStyles();
  const styles = useStyles();
  const content = <AttachmentLabel file={file}>
    <Text style={ui.label}>{file.name}</Text>
    <Text style={ui.muted}>{detail}</Text>
  </AttachmentLabel>;
  const style = [ui.secondary, styles.attachment];
  const trigger = onOpen && <Pressable accessibilityRole="button" accessibilityLabel={openLabel}
    disabled={disabled} style={action ? styles.attachmentDetails : style} onPress={onOpen}>{content}</Pressable>;
  return action ? <View style={[style, styles.attachmentWithAction]}>
    {trigger || <View style={styles.attachmentDetails}>{content}</View>}
    {action}
  </View> : trigger || <View style={style}>{content}</View>;
}

export function DiscussionComposer({ inputRef, message, onChange, placeholder, maxLength, sending, disabled,
  attachmentBusy, onAttach, quote, onCancelReply, attachments, extras, sendLabel, onSend, canSend, collapseOnBlur }: {
  inputRef?: Ref<ComponentRef<typeof TextInput>>; message: string; onChange: (text: string) => void;
  placeholder: string; maxLength: number; sending: boolean; disabled?: boolean;
  attachmentBusy?: boolean; onAttach?: () => void; quote?: ReactNode; onCancelReply?: () => void;
  attachments?: ReactNode; extras?: ReactNode; sendLabel?: string; onSend: () => void; canSend?: boolean;
  collapseOnBlur?: boolean;
}) {
  const ui = useScreenStyles();
  const styles = useStyles();
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  // Keep the reply actions in place when pressing them blurs the input.
  const expanded = focused || (!collapseOnBlur && (Boolean(quote) || message.length > 0));
  const blurOnWeb = collapseOnBlur && Platform.OS === 'web';
  const composer = useRef<ComponentRef<typeof View>>(null);
  const pointerPressed = useRef(false);

  useEffect(() => {
    if (!blurOnWeb || !focused) return;
    let timer: number | undefined;
    function press() {
      pointerPressed.current = true;
    }
    function release() {
      pointerPressed.current = false;
      window.clearTimeout(timer);
      // Let the clicked control receive its press before the popup changes height.
      timer = window.setTimeout(() => {
        const element = composer.current as unknown as HTMLElement | null;
        if (!element?.contains(document.activeElement)) setFocused(false);
      }, 0);
    }

    window.addEventListener('pointerdown', press, true);
    window.addEventListener('pointerup', release, true);
    window.addEventListener('pointercancel', release, true);
    return () => {
      window.removeEventListener('pointerdown', press, true);
      window.removeEventListener('pointerup', release, true);
      window.removeEventListener('pointercancel', release, true);
      window.clearTimeout(timer);
      pointerPressed.current = false;
    };
  }, [blurOnWeb, focused]);

  const busy = disabled || sending || attachmentBusy;
  return <View ref={composer} style={ui.stack} onBlur={blurOnWeb ? event => {
    // Keep the composer in place while focus moves to an attachment or send button.
    const { currentTarget, relatedTarget } = event as unknown as { currentTarget: HTMLElement; relatedTarget: Node | null };
    if (!pointerPressed.current && !currentTarget.contains(relatedTarget)) setFocused(false);
  } : undefined}>
    {quote && <View style={styles.replyPreview}>
      {quote}
      <Pressable accessibilityRole="button" disabled={busy} style={styles.replyButton} onPress={onCancelReply}>
        <Text style={styles.replyAction}>Hủy trả lời</Text>
      </Pressable>
    </View>}
    <View style={attachments ? [ui.secondary, styles.attachmentFrame] : undefined}>
      <TextInput ref={inputRef} accessibilityLabel="Nội dung trao đổi" placeholder={placeholder}
        style={[ui.input, expanded ? ui.messageInput : styles.compactInput,
          onAttach && (expanded ? styles.inputWithAttachment : styles.compactInputWithAttachment),
          !!attachments && styles.borderlessInput]}
        value={message} onChangeText={onChange} multiline maxLength={maxLength} editable={!sending && !disabled}
        onFocus={() => setFocused(true)} onBlur={blurOnWeb ? undefined : () => setFocused(false)}
        accessory={onAttach && <Pressable accessibilityRole="button" accessibilityLabel="Đính kèm tệp"
          accessibilityHint="Tối đa 5 tệp mỗi lượt, 5 MB mỗi tệp và 8 MB tổng cộng."
          accessibilityState={{ busy: attachmentBusy }} disabled={busy} onPress={onAttach}
          style={({ pressed }) => [styles.attachButton, !expanded && styles.compactAttachButton,
            (pressed || busy) && ui.dimmed]}>
          {attachmentBusy ? <ActivityIndicator color={colors.accent} /> :
            <View aria-hidden pointerEvents="none" style={styles.paperclip}>
              <View style={[styles.paperclipStroke, styles.paperclipOuter]} />
              <View style={[styles.paperclipStroke, styles.paperclipTop]} />
              <View style={[styles.paperclipStroke, styles.paperclipInner]} />
            </View>}
        </Pressable>} />
      {attachments}
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
  attachmentWithAction: { flexDirection: 'row', alignItems: 'center', paddingEnd: 0 },
  attachmentDetails: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  firstRow: { borderTopWidth: 0, paddingTop: 0 },
  indentedRow: { marginStart: 20 },
  content: { flex: 1, minWidth: 0, gap: 3 },
  messageHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  messageHeaderWithActions: { marginEnd: -54 },
  messageFooter: { flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 },
  author: { flex: 1, minWidth: 0, fontWeight: '800' },
  time: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  quote: { flexShrink: 1, borderLeftWidth: 3, borderLeftColor: colors.accent, backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 8, paddingVertical: 5, gap: 2 },
  replyLabel: { fontWeight: '400' },
  replyPreview: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  replyButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  messageReply: { justifyContent: 'flex-start', paddingHorizontal: 0 },
  replyAction: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  attachmentFrame: { borderRadius: 9, overflow: 'hidden' },
  borderlessInput: { borderWidth: 0 },
  compactInput: { height: 44, paddingVertical: 10, textAlignVertical: 'center' },
  compactInputWithAttachment: { paddingRight: 48 },
  inputWithAttachment: { minHeight: 110, paddingBottom: 48 },
  attachButton: { position: 'absolute', right: 4, bottom: 4, width: 44, height: 44,
    alignItems: 'center', justifyContent: 'center' },
  compactAttachButton: { bottom: 0 },
  paperclip: { width: 20, height: 24, transform: [{ scale: 0.75 }] },
  paperclipStroke: { position: 'absolute', borderWidth: 2, borderColor: colors.accent },
  paperclipOuter: { left: 2, top: 5, width: 16, height: 19, borderTopWidth: 0,
    borderBottomLeftRadius: 8, borderBottomRightRadius: 8 },
  paperclipTop: { left: 7, top: 0, width: 11, height: 16, borderBottomWidth: 0,
    borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  paperclipInner: { left: 7, top: 8, width: 6, height: 11, borderTopWidth: 0,
    borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
}));
