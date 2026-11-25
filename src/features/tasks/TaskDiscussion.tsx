import { useEffect, useRef, useState } from 'react';
import type { ComponentRef, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { EmptyState } from '../../components/EmptyState';
import { TextInput } from '../../components/TextInput';
import { AttachmentLabel } from '../../components/AttachmentLabel';
import { AttachmentPreview } from '../../components/AttachmentPreview';
import { Button } from '../../components/Button';
import { Dropdown } from '../../components/Dropdown';
import { MemberAvatar } from '../../components/MemberAvatar';
import { useToast } from '../../components/Toast';
import { auth, pilotMode, taskAssignmentEnabled } from '../../services/firebase/firebase';
import { formatVietnamDateTime } from '../../utils/dateTime';
import { attachmentLimit, formatFileSize, pickTaskAttachments, readTaskAttachment, readTaskAttachments } from './taskAttachments';
import type { AttachmentFile } from '../../utils/attachmentFile';
import { addTaskAttachments, addTaskComment, commentMaxLength, findTaskReplyIndex, getAssignmentComment } from './tasks';
import type { Task, TaskAssignee, TaskAttachment, TaskReplyTarget } from './tasks';
import { useScreenStyles } from '../../theme/screenStyles';
import { createThemedStyles, useTheme } from '../../theme/theme';

const discussionSortChoices = [
  { value: 'oldest', label: 'Cũ nhất → Mới nhất' },
  { value: 'newest', label: 'Mới nhất → Cũ nhất' },
] as const;

export function TaskDiscussion({ task, email, name, members, children }: {
  task: Task; email: string; name: string; members: Map<string, TaskAssignee>;
  children: (history: ReactNode, composer: ReactNode) => ReactNode;
}) {
  const styles = useStyles();
  const screenStyles = useScreenStyles();
  const { colors } = useTheme();
  const showToast = useToast();
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const [message, setMessage] = useState('');
  const [replyTo, setReplyTo] = useState<TaskReplyTarget>();
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [openingFileId, setOpeningFileId] = useState('');
  const [preview, setPreview] = useState<{ taskId: string; file: AttachmentFile }>();
  const openingFile = useRef(false);
  const [sort, setSort] = useState<'oldest' | 'newest'>('oldest');
  const discussionOpen = task.status !== 'Xong' && (!pilotMode || taskAssignmentEnabled);
  const canComment = discussionOpen && task.assigneeEmail === email;
  const canReply = discussionOpen && (canComment || task.assignedBy === email);
  const canAttach = canComment && taskAssignmentEnabled && !replyTo;
  const allComments = task.comments ?? [];
  const assignmentMessage = getAssignmentComment(task);
  const comments = allComments.map((comment, index) => ({ comment, index }))
    .filter(({ comment }) => comment !== assignmentMessage);
  const recentStart = Math.max(0, comments.length - 20);
  const messages = comments.filter(({ comment }, index) => index >= recentStart || discussionFiles(comment).length > 0);
  if (assignmentMessage && (assignmentMessage.text || discussionFiles(assignmentMessage).length)) {
    messages.unshift({ comment: assignmentMessage, index: allComments.indexOf(assignmentMessage) });
  }
  const orderedMessages = messages.map(entry => ({ ...entry, time: Date.parse(entry.comment.at) || 0 }))
    .sort((a, b) => sort === 'oldest' ? a.time - b.time || a.index - b.index : b.time - a.time || b.index - a.index);

  useEffect(() => {
    if (replyTo && canReply) input.current?.focus();
  }, [replyTo, canReply]);

  function authorName(by: string) {
    return (by === email ? name : members.get(by)?.name)
      || (by === task.assigneeEmail ? task.assignee : '') || by || 'Thành viên';
  }

  function renderQuote(target: TaskReplyTarget) {
    const original = allComments[findTaskReplyIndex(allComments, target)];
    return <View style={styles.quote}>
      <Text style={screenStyles.label}>Trả lời {authorName(target.by)}</Text>
      <Text numberOfLines={2} style={screenStyles.muted}>
        {original ? original.text || discussionFiles(original).map(file => file.name).join(', ') || 'Trao đổi'
          : 'Trao đổi gốc không còn hiển thị.'}
      </Text>
    </View>;
  }

  async function send() {
    if (!(replyTo ? canReply : canComment) || sending || uploading || !message.trim()) return;
    if (replyTo && findTaskReplyIndex(allComments, replyTo) < 0) {
      showToast('Trao đổi gốc không còn tồn tại.', 'error');
      return;
    }
    setSending(true);
    try {
      await addTaskComment(task.id, email, message, replyTo);
      setMessage('');
      setReplyTo(undefined);
    } catch {
      showToast('Chưa gửi được trao đổi. Kiểm tra kết nối và thử lại.', 'error');
    } finally {
      setSending(false);
    }
  }

  async function upload() {
    if (!canAttach || sending || uploading) return;
    setUploading(true);
    try {
      const files = await pickTaskAttachments();
      if (!files.length) return;
      const limit = attachmentLimit(files);
      if (limit) {
        showToast(limit, 'error');
        return;
      }
      await addTaskAttachments({ taskId: task.id, attachments: await readTaskAttachments(files) });
    } catch {
      showToast('Chưa gửi được tệp. Kiểm tra kết nối và thử lại.', 'error');
    } finally {
      setUploading(false);
    }
  }

  async function openFile(file: TaskAttachment) {
    if (openingFile.current) return;
    openingFile.current = true;
    setOpeningFileId(file.id);
    try {
      setPreview({ taskId: task.id, file: await readTaskAttachment(task.id, file) });
    } catch {
      showToast('Không mở được tệp. Kiểm tra kết nối và thử lại.', 'error');
    } finally {
      openingFile.current = false;
      setOpeningFileId('');
    }
  }

  const history = (
    <View style={screenStyles.stack}>
      <View style={styles.discussionTitleRow}>
        <Text accessibilityRole="header" style={screenStyles.cardTitle}>Trao đổi</Text>
        {messages.length > 0 && <Dropdown label="Sắp xếp theo thời gian" hideLabel style={styles.sortControl}
          value={sort} choices={discussionSortChoices} onChange={setSort} highlightSelection={false} />}
      </View>
      <View style={[screenStyles.panel, styles.discussionPanel]}>
        {messages.length === 0 ? <EmptyState icon="chat" message="Chưa có trao đổi." /> : null}
        {orderedMessages.map(({ comment, index }, position) => {
          const member = members.get(comment.by);
          const self = comment.by === email;
          const author = authorName(comment.by);
          const photo = member?.photoURL || (self ? auth.currentUser?.photoURL : null);
          const time = formatVietnamDateTime(comment.at);
          return <View key={`${comment.at}-${index}`}
            style={[screenStyles.detailRow, styles.discussionRow, position === 0 && styles.firstDiscussionRow]}>
            <MemberAvatar name={author} photoURL={photo} />
            <View style={styles.discussionContent}>
              <View style={styles.discussionHeader}>
                <Text style={[screenStyles.label, styles.discussionName]}>{author}</Text>
                {time ? <Text style={styles.discussionTime}>{time}</Text> : null}
              </View>
              {comment === assignmentMessage ? <Text style={styles.discussionTime}>Lời nhắn khi giao việc</Text> : null}
              {comment.replyTo ? renderQuote(comment.replyTo) : null}
              {comment.text ? <Text style={screenStyles.body}>{comment.text}</Text> : null}
              {discussionFiles(comment).map((file, index) => {
                const key = `${file.id}-${index}`;
                const content = <AttachmentLabel file={file}>
                  <Text style={screenStyles.label}>{file.name}</Text>
                  <Text style={screenStyles.muted}>{openingFileId === file.id ? 'Đang mở…' : formatFileSize(file.size)}</Text>
                </AttachmentLabel>;
                const style = [screenStyles.secondary, styles.attachment];
                return taskAssignmentEnabled
                  ? <Pressable key={key} accessibilityRole="button" accessibilityLabel={`Xem tệp ${file.name}`}
                      disabled={!!openingFileId} style={style} onPress={() => void openFile(file)}>{content}</Pressable>
                  : <View key={key} style={style}>{content}</View>;
              })}
              {canReply && comment.by && comment.at ? <Pressable accessibilityRole="button"
                accessibilityLabel={`Trả lời trao đổi của ${author}`}
                disabled={sending || uploading} style={[styles.replyButton, styles.commentReply]}
                onPress={() => setReplyTo({ index, by: comment.by, at: comment.at })}>
                <Text style={styles.replyAction}>Trả lời</Text>
              </Pressable> : null}
            </View>
          </View>;
        })}
      </View>
    </View>
  );

  const composer = canComment || (canReply && replyTo) ? (
    <View style={screenStyles.stack}>
      {replyTo && <View style={styles.replyPreview}>
        {renderQuote(replyTo)}
        <Pressable accessibilityRole="button" disabled={sending} style={styles.replyButton}
          onPress={() => setReplyTo(undefined)}>
          <Text style={styles.replyAction}>Hủy trả lời</Text>
        </Pressable>
      </View>}
      <View>
        <TextInput ref={input} accessibilityLabel="Nội dung trao đổi" placeholder="Nhập trao đổi về công việc"
          style={[screenStyles.input, screenStyles.messageInput, canAttach && styles.messageInputWithAttachment]}
          value={message} onChangeText={setMessage} multiline maxLength={commentMaxLength} editable={!sending} />
        {canAttach && <Pressable accessibilityRole="button" accessibilityLabel="Đính kèm tệp"
          accessibilityHint="Tối đa 5 tệp mỗi lượt, 5 MB mỗi tệp và 8 MB tổng cộng."
          accessibilityState={{ busy: uploading }} disabled={sending || uploading} onPress={() => void upload()}
          style={({ pressed }) => [styles.attachButton, (pressed || sending) && screenStyles.dimmed]}>
          {uploading ? <ActivityIndicator color={colors.accent} /> :
            <View aria-hidden pointerEvents="none" style={styles.paperclip}>
              <View style={[styles.paperclipStroke, styles.paperclipOuter]} />
              <View style={[styles.paperclipStroke, styles.paperclipTop]} />
              <View style={[styles.paperclipStroke, styles.paperclipInner]} />
            </View>}
        </Pressable>}
      </View>
      <Button label={sending ? 'Đang gửi…' : replyTo ? 'Gửi trả lời' : 'Gửi trao đổi'}
        onPress={send} disabled={sending || uploading || !message.trim()} />
    </View>
  ) : null;

  return <>
    {children(history, composer)}
    {preview?.taskId === task.id && <AttachmentPreview file={preview.file} onClose={() => setPreview(undefined)} />}
  </>;
}

function discussionFiles(comment: NonNullable<Task['comments']>[number]) {
  return Array.isArray(comment.files) ? comment.files.filter(file =>
    typeof file?.id === 'string' && typeof file.name === 'string' && typeof file.size === 'number') : [];
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  discussionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  sortControl: { width: 172, maxWidth: '65%' },
  discussionPanel: { gap: 4 },
  attachment: { padding: 10, borderRadius: 9 },
  discussionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  firstDiscussionRow: { borderTopWidth: 0, paddingTop: 0 },
  discussionContent: { flex: 1, minWidth: 0, gap: 3 },
  discussionHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  discussionName: { flex: 1, minWidth: 0, fontWeight: '800' },
  discussionTime: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  quote: { flexShrink: 1, borderLeftWidth: 3, borderLeftColor: colors.accent, backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 8, paddingVertical: 5, gap: 2 },
  replyPreview: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  replyButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  commentReply: { justifyContent: 'flex-start', paddingHorizontal: 0 },
  replyAction: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  messageInputWithAttachment: { minHeight: 110, paddingBottom: 48 },
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
