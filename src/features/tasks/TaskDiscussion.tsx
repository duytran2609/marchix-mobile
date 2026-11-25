import { useEffect, useRef, useState } from 'react';
import type { ComponentRef, ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { EmptyState } from '../../components/EmptyState';
import { TextInput } from '../../components/TextInput';
import { AttachmentPreview } from '../../components/AttachmentPreview';
import { DiscussionAttachment, DiscussionComposer, DiscussionHeader, DiscussionHistory,
  DiscussionMessage, DiscussionQuote } from '../../components/Discussion';
import { SearchInput } from '../../components/SearchInput';
import { useToast } from '../../components/Toast';
import { auth, pilotMode, taskAssignmentEnabled } from '../../services/firebase/firebase';
import { formatVietnamDateTime } from '../../utils/dateTime';
import { attachmentLimit, formatFileSize, pickTaskAttachments, readTaskAttachment, readTaskAttachments } from './taskAttachments';
import type { AttachmentFile } from '../../utils/attachmentFile';
import { addTaskAttachments, addTaskComment, commentMaxLength, findTaskReplyIndex, getAssignmentComment } from './tasks';
import type { Task, TaskAssignee, TaskAttachment, TaskReplyTarget } from './tasks';
import { useScreenStyles } from '../../theme/screenStyles';
import { createThemedStyles } from '../../theme/theme';

export function TaskDiscussion({ task, email, name, members, children }: {
  task: Task; email: string; name: string; members: Map<string, TaskAssignee>;
  children: (history: ReactNode, composer: ReactNode) => ReactNode;
}) {
  const styles = useStyles();
  const screenStyles = useScreenStyles();
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
  const [term, setTerm] = useState('');
  const discussionOpen = task.status !== 'Xong' && (!pilotMode || taskAssignmentEnabled);
  const canComment = discussionOpen && task.assigneeEmail === email;
  const canReply = discussionOpen && (canComment || task.assignedBy === email);
  const canAttach = canComment && taskAssignmentEnabled && !replyTo;
  const allComments = task.comments ?? [];
  const assignmentMessage = getAssignmentComment(task);
  const comments = allComments.map((comment, index) => ({ comment, index }))
    .filter(({ comment }) => comment !== assignmentMessage);
  const query = term.trim().toLocaleLowerCase('vi');
  const recentStart = query ? 0 : Math.max(0, comments.length - 20);
  const messages = comments.filter(({ comment }, index) => index >= recentStart || discussionFiles(comment).length > 0);
  if (assignmentMessage && (assignmentMessage.text || discussionFiles(assignmentMessage).length)) {
    messages.unshift({ comment: assignmentMessage, index: allComments.indexOf(assignmentMessage) });
  }
  const orderedMessages = messages
    .filter(({ comment }) => !query || comment.text?.toLocaleLowerCase('vi').includes(query))
    .map(entry => ({ ...entry, time: Date.parse(entry.comment.at) || 0 }))
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
    return <DiscussionQuote author={authorName(target.by)}
      text={original ? original.text || discussionFiles(original).map(file => file.name).join(', ') || 'Trao đổi'
        : 'Trao đổi gốc không còn hiển thị.'} />;
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
      <DiscussionHeader sort={sort} onSort={messages.length > 0 ? setSort : undefined} />
      <SearchInput accessibilityLabel="Tìm trong trao đổi" placeholder="Tìm trong trao đổi"
        value={term} onChangeText={setTerm} maxLength={160} />
      <DiscussionHistory>
        {orderedMessages.length === 0 ? <EmptyState icon={query ? 'search' : 'chat'}
          message={query ? 'Không tìm thấy trao đổi phù hợp.' : 'Chưa có trao đổi.'} /> : null}
        {orderedMessages.map(({ comment, index }, position) => {
          const member = members.get(comment.by);
          const self = comment.by === email;
          const author = authorName(comment.by);
          const photo = member?.photoURL || (self ? auth.currentUser?.photoURL : null);
          const time = formatVietnamDateTime(comment.at);
          return <DiscussionMessage key={`${comment.at}-${index}`} author={author} time={time} photoURL={photo}
            first={position === 0} replyDisabled={sending || uploading}
            onReply={canReply && comment.by && comment.at ? () => setReplyTo({ index, by: comment.by, at: comment.at }) : undefined}>
            {comment === assignmentMessage ? <Text style={styles.discussionTime}>Lời nhắn khi giao việc</Text> : null}
            {comment.replyTo ? renderQuote(comment.replyTo) : null}
            {comment.text ? <Text style={screenStyles.body}>{comment.text}</Text> : null}
            {discussionFiles(comment).map((file, index) => <DiscussionAttachment key={`${file.id}-${index}`}
              file={file} detail={openingFileId === file.id ? 'Đang mở…' : formatFileSize(file.size)}
              disabled={!!openingFileId} onOpen={taskAssignmentEnabled ? () => void openFile(file) : undefined} />)}
          </DiscussionMessage>;
        })}
      </DiscussionHistory>
    </View>
  );

  const composer = canComment || (canReply && replyTo) ? (
    <DiscussionComposer inputRef={input} message={message} onChange={setMessage} placeholder="Nhập trao đổi về công việc"
      maxLength={commentMaxLength} sending={sending} attachmentBusy={uploading} onAttach={canAttach ? upload : undefined}
      quote={replyTo && renderQuote(replyTo)} onCancelReply={() => setReplyTo(undefined)} onSend={send} />
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
  discussionTime: { color: colors.muted, fontSize: 12, lineHeight: 17 },
}));
