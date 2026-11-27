import { useEffect, useRef, useState } from 'react';
import type { ComponentRef, ReactNode } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DeleteIconButton } from '../../components/DeleteIconButton';
import { DropdownOverlay, useDropdownAnchor } from '../../components/DropdownOverlay';
import { EmptyState } from '../../components/EmptyState';
import { TextInput } from '../../components/TextInput';
import { AttachmentPreview } from '../../components/AttachmentPreview';
import { DiscussionAttachment, DiscussionComposer, DiscussionHeader, DiscussionHistory,
  DiscussionMessage, DiscussionQuote } from '../../components/Discussion';
import type { DiscussionSort } from '../../components/Discussion';
import { PopupCloseButton } from '../../components/PopupCloseButton';
import { SearchInput } from '../../components/SearchInput';
import { useToast } from '../../components/Toast';
import { auth, pilotMode, taskAssignmentEnabled } from '../../services/firebase/firebase';
import { formatVietnamDateTime } from '../../utils/dateTime';
import { attachmentLimit, formatFileSize, pickTaskAttachments, readTaskAttachment, readTaskAttachments } from './taskAttachments';
import type { PickedAttachment } from './taskAttachments';
import type { AttachmentFile } from '../../utils/attachmentFile';
import { addTaskAttachments, addTaskComment, commentMaxLength, findTaskReplyIndex, getAssignmentComment,
  replyToTaskComment, updateTaskComment } from './tasks';
import type { Task, TaskAssignee, TaskAttachment, TaskReplyTarget } from './tasks';
import { useScreenStyles } from '../../theme/screenStyles';
import { createThemedStyles } from '../../theme/theme';

export function TaskDiscussion({ task, email, name, members, inPopup, children }: {
  task: Task; email: string; name: string; members: Map<string, TaskAssignee>; inPopup: boolean;
  children: (history: ReactNode, composer: ReactNode, dismissComposer?: () => void) => ReactNode;
}) {
  const styles = useStyles();
  const screenStyles = useScreenStyles();
  const showToast = useToast();
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const [message, setMessage] = useState('');
  const [draftFiles, setDraftFiles] = useState<PickedAttachment[]>([]);
  const [replyTo, setReplyTo] = useState<TaskReplyTarget>();
  const [replyMessage, setReplyMessage] = useState('');
  const [replyFiles, setReplyFiles] = useState<PickedAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [picking, setPicking] = useState(false);
  const draftBusy = useRef(false);
  const [openingFileId, setOpeningFileId] = useState('');
  const [preview, setPreview] = useState<{ taskId: string; file: AttachmentFile }>();
  const openingFile = useRef(false);
  const [sort, setSort] = useState<DiscussionSort>('oldest');
  const [term, setTerm] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [edit, setEdit] = useState<{ target: TaskReplyTarget; text: string }>();
  const [deletion, setDeletion] = useState<TaskReplyTarget>();
  const [changing, setChanging] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const changeInFlight = useRef(false);
  const discussionOpen = task.status !== 'Xong' && (!pilotMode || taskAssignmentEnabled);
  const canComment = discussionOpen && task.assigneeEmail === email;
  const canReply = discussionOpen && (canComment || task.assignedBy === email);
  const canAttach = (replyTo ? canReply : canComment) && taskAssignmentEnabled;
  const text = (replyTo ? replyMessage : message).trim();
  const files = replyTo ? replyFiles : draftFiles;
  const setFiles = replyTo ? setReplyFiles : setDraftFiles;
  const hasDraftFiles = canAttach && files.length > 0;
  const allComments = task.comments ?? [];
  const assignmentMessage = getAssignmentComment(task);
  const comments = allComments.map((comment, index) => ({ comment, index }))
    .filter(({ comment }) => comment !== assignmentMessage);
  const query = term.trim().toLocaleLowerCase('vi');
  const recentStart = query ? 0 : Math.max(0, comments.length - 20);
  if (assignmentMessage && (assignmentMessage.text || discussionFiles(assignmentMessage).length)) {
    comments.push({ comment: assignmentMessage, index: allComments.indexOf(assignmentMessage) });
  }
  const messages = comments.filter(({ comment }, index) => index >= recentStart || discussionFiles(comment).length > 0);
  const visibleIndices = new Set(messages
    .filter(({ comment }) => !query || comment.text?.toLocaleLowerCase('vi').includes(query))
    .map(({ index }) => index));
  const editIndex = edit ? findTaskReplyIndex(allComments, edit.target) : -1;

  async function changeComment(target: TaskReplyTarget, message: string | null) {
    if (changeInFlight.current || !canReply) return;
    changeInFlight.current = true;
    setChanging(true);
    setDeleteError('');
    try {
      await updateTaskComment({ taskId: task.id, target, message });
      if (message === null) {
        setDeletion(undefined);
        if (replyTo?.by === target.by && replyTo.at === target.at) {
          setReplyTo(undefined);
          setReplyMessage('');
          setReplyFiles([]);
        }
      } else {
        setEdit(undefined);
      }
      showToast(message === null ? 'Đã xóa trao đổi.' : 'Đã lưu trao đổi.');
    } catch {
      if (message === null) setDeleteError('Chưa xóa được trao đổi. Vui lòng thử lại.');
      else showToast('Chưa lưu được trao đổi. Vui lòng thử lại.', 'error');
    } finally {
      changeInFlight.current = false;
      setChanging(false);
    }
  }

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
    if (draftBusy.current || !(replyTo ? canReply : canComment) || (!text && !hasDraftFiles)) return;
    if (replyTo && findTaskReplyIndex(allComments, replyTo) < 0) {
      showToast('Trao đổi gốc không còn tồn tại.', 'error');
      return;
    }
    draftBusy.current = true;
    setSending(true);
    try {
      if (replyTo) {
        await replyToTaskComment({ taskId: task.id, message: text, replyTo,
          attachments: hasDraftFiles ? await readTaskAttachments(files) : [] });
      } else if (hasDraftFiles) {
        await addTaskAttachments({ taskId: task.id, message: text, attachments: await readTaskAttachments(files) });
      } else {
        await addTaskComment(task.id, email, text);
      }
      if (replyTo) {
        setReplyMessage('');
        setReplyFiles([]);
        setReplyTo(undefined);
      } else {
        setMessage('');
        setDraftFiles([]);
      }
      showToast(replyTo ? 'Đã gửi trả lời.' : hasDraftFiles ? 'Đã gửi trao đổi kèm tệp.' : 'Đã gửi trao đổi.');
    } catch {
      showToast(replyTo ? 'Chưa gửi được trả lời. Kiểm tra kết nối rồi thử lại.'
        : 'Chưa gửi được trao đổi. Kiểm tra kết nối rồi thử lại.', 'error');
    } finally {
      draftBusy.current = false;
      setSending(false);
    }
  }

  async function pickFiles() {
    if (!canAttach || draftBusy.current) return;
    draftBusy.current = true;
    setPicking(true);
    try {
      const picked = await pickTaskAttachments();
      if (!picked.length) return;
      const next = [...files, ...picked];
      const limit = attachmentLimit(next);
      if (limit) {
        showToast(limit, 'error');
        return;
      }
      setFiles(next);
    } catch {
      showToast('Không chọn được tệp. Vui lòng thử lại.', 'error');
    } finally {
      draftBusy.current = false;
      setPicking(false);
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

  function renderHistory(readOnly = false) {
    const indices = readOnly ? new Set(comments.map(({ index }) => index)) : visibleIndices;
    const orderedMessages = orderDiscussionMessages(allComments, indices, sort);
    const searching = !readOnly && !!query;
    return <DiscussionHistory>
      {orderedMessages.length === 0 ? <EmptyState icon={searching ? 'search' : 'chat'}
        message={searching ? 'Không tìm thấy trao đổi phù hợp.' : 'Chưa có trao đổi.'} /> : null}
      {orderedMessages.map(({ comment, index, parentIndex }, position) => {
        const member = members.get(comment.by);
        const self = comment.by === email;
        const author = authorName(comment.by);
        const photo = member?.photoURL || (self ? auth.currentUser?.photoURL : null);
        const time = formatVietnamDateTime(comment.at);
        const target = { index, by: comment.by, at: comment.at };
        const editing = !readOnly && canReply && edit && editIndex === index;
        return <DiscussionMessage key={`${comment.at}-${index}`} author={author} time={time} photoURL={photo}
          first={position === 0} indented={parentIndex >= 0} replyDisabled={sending || picking}
          actions={!readOnly && !editing && self && canReply && !!comment.at && comment !== assignmentMessage && comment.kind !== 'assignment' &&
            <TaskCommentMenu disabled={changing} onEdit={() => setEdit({ target, text: comment.text ?? '' })}
              onDelete={() => { setDeleteError(''); setDeletion(target); }} />}
          footerActions={editing && <View style={styles.editActions}>
            <Button label="Hủy" secondary disabled={changing} onPress={() => setEdit(undefined)} />
            <Button label={changing ? 'Đang lưu…' : 'Lưu'} disabled={changing || (!edit.text.trim() && !discussionFiles(comment).length)}
              onPress={() => void changeComment(edit.target, edit.text.trim())} />
          </View>}
          onReply={!readOnly && canReply && comment.by && comment.at
            ? () => setReplyTo({ index, by: comment.by, at: comment.at }) : undefined}>
          {comment === assignmentMessage ? <Text style={styles.discussionTime}>Lời nhắn khi giao việc</Text> : null}
          {comment.replyTo ? renderQuote(comment.replyTo) : null}
          {editing ? <TextInput accessibilityLabel="Chỉnh sửa nội dung trao đổi" value={edit.text} multiline
            autoFocus editable={!changing} maxLength={commentMaxLength} style={[screenStyles.input, screenStyles.messageInput]}
            onChangeText={text => setEdit({ ...edit, text })} />
            : comment.text ? <Text style={screenStyles.body}>{comment.text}</Text> : null}
          {discussionFiles(comment).map((file, index) => <DiscussionAttachment key={`${file.id}-${index}`}
            file={file} detail={!readOnly && openingFileId === file.id ? 'Đang mở…' : formatFileSize(file.size)}
            disabled={!!openingFileId} onOpen={!readOnly && taskAssignmentEnabled ? () => void openFile(file) : undefined} />)}
        </DiscussionMessage>;
      })}
    </DiscussionHistory>;
  }

  function dismissComposer() {
    if (input.current?.isFocused()) input.current.blur();
  }

  const history = <View style={screenStyles.stack}>
    <DiscussionHeader sort={sort} onSort={messages.length > 0 ? setSort : undefined} action={inPopup &&
      <Pressable accessibilityRole="button" accessibilityLabel="Mở rộng trao đổi" style={styles.expandButton}
        onPress={() => { dismissComposer(); setShowAll(true); }}>
        <Text aria-hidden style={styles.expandIcon}>⛶</Text>
      </Pressable>} />
    <SearchInput accessibilityLabel="Tìm trong trao đổi" placeholder="Tìm trong trao đổi"
      value={term} onChangeText={setTerm} maxLength={160} />
    {renderHistory()}
  </View>;

  const composer = canComment || (canReply && replyTo) ? (
    <DiscussionComposer inputRef={input} message={replyTo ? replyMessage : message} collapseOnBlur={inPopup}
      onChange={replyTo ? setReplyMessage : setMessage} placeholder="Nhập trao đổi về công việc"
      maxLength={commentMaxLength} sending={sending} attachmentBusy={picking} onAttach={canAttach ? pickFiles : undefined}
      attachments={hasDraftFiles && <ScrollView style={styles.draftFiles} keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.draftFileList}>
        {files.map((file, index) => <DiscussionAttachment key={index} file={file} detail={formatFileSize(file.size)}
          action={<DeleteIconButton label={`Bỏ tệp ${file.name}`} disabled={sending || picking}
            onPress={() => setFiles(current => current.filter((_, position) => position !== index))} />} />)}
      </ScrollView>}
      canSend={!!text || hasDraftFiles} quote={replyTo && renderQuote(replyTo)} onCancelReply={() => {
        setReplyTo(undefined);
        setReplyMessage('');
        setReplyFiles([]);
      }} onSend={send} />
  ) : null;

  const closeAll = () => setShowAll(false);
  return <>
    {children(history, composer, inPopup && Platform.OS !== 'web' ? dismissComposer : undefined)}
    {showAll && <Modal transparent onRequestClose={closeAll} statusBarTranslucent navigationBarTranslucent>
      <SafeAreaView style={styles.overlay}>
        <View role="dialog" accessibilityLabel="Toàn bộ trao đổi" accessibilityViewIsModal style={styles.fullHistoryPopup}>
          <View style={styles.fullHistoryHeader}>
            <PopupCloseButton label="Đóng toàn bộ trao đổi" onPress={closeAll} />
          </View>
          <ScrollView style={styles.fullHistoryScroll} contentContainerStyle={styles.fullHistoryContent}>
            {renderHistory(true)}
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>}
    {!!deletion && <Modal transparent statusBarTranslucent navigationBarTranslucent
      onRequestClose={() => { if (!changing) setDeletion(undefined); }}>
      <ConfirmDialog label="Xóa trao đổi" title="Xóa trao đổi?" message="Trao đổi này sẽ bị xóa khỏi công việc."
        action="Xóa" pendingAction="Đang xóa…" pending={changing} error={deleteError}
        onCancel={() => setDeletion(undefined)} onConfirm={() => void changeComment(deletion, null)} />
    </Modal>}
    {preview?.taskId === task.id && <AttachmentPreview file={preview.file} onClose={() => setPreview(undefined)} />}
  </>;
}

function TaskCommentMenu({ disabled, onEdit, onDelete }: { disabled: boolean; onEdit: () => void; onDelete: () => void }) {
  const styles = useStyles();
  const ui = useScreenStyles();
  const { trigger, anchor, open, close } = useDropdownAnchor();
  const icon = <Text aria-hidden style={styles.menuIcon}>⋯</Text>;
  return <>
    <Pressable ref={trigger} accessibilityRole="button" accessibilityLabel="Tùy chọn trao đổi"
      accessibilityState={{ expanded: !!anchor }} style={styles.menuButton} disabled={disabled} onPress={open}>
      {icon}
    </Pressable>
    {anchor && <DropdownOverlay anchor={anchor} onClose={close} triggerStyle={styles.menuButton}
      triggerContent={icon} panelStyle={styles.menuPanel} keepAttached minWidth={136} minHeight={90} maxHeight={110}>
      <ScrollView keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="button" style={styles.menuItem} onPress={() => { close(); onEdit(); }}>
          <Text style={ui.body}>Chỉnh sửa</Text>
        </Pressable>
        <Pressable accessibilityRole="button" style={styles.menuItem} onPress={() => { close(); onDelete(); }}>
          <Text style={[ui.body, styles.deleteAction]}>Xóa</Text>
        </Pressable>
      </ScrollView>
    </DropdownOverlay>}
  </>;
}

function orderDiscussionMessages(comments: NonNullable<Task['comments']>, visible: Set<number>, sort: DiscussionSort) {
  const entries = comments.map((comment, index) => {
    const parent = comment.replyTo ? findTaskReplyIndex(comments, comment.replyTo) : -1;
    return { comment, index, parentIndex: parent < index ? parent : -1, time: Date.parse(comment.at) || 0 };
  });
  // A visible reply also needs its earlier ancestors, even outside the recent list or search results.
  for (let index = entries.length - 1; index >= 0; index--) {
    const { parentIndex } = entries[index];
    if (parentIndex >= 0 && visible.has(index)) visible.add(parentIndex);
  }
  const siblingsByParent = new Map<number, typeof entries>();
  const direction = sort === 'oldest' ? 1 : -1;
  for (const entry of entries.filter(({ index }) => visible.has(index))
    .sort((a, b) => direction * (a.time - b.time || a.index - b.index))) {
    const siblings = siblingsByParent.get(entry.parentIndex);
    if (siblings) siblings.push(entry);
    else siblingsByParent.set(entry.parentIndex, [entry]);
  }
  const ordered: typeof entries = [];
  const pending = (siblingsByParent.get(-1) ?? []).reverse();
  while (pending.length > 0) {
    const entry = pending.pop()!;
    ordered.push(entry);
    const replies = siblingsByParent.get(entry.index);
    if (replies) pending.push(...replies.reverse());
  }
  return ordered;
}

function discussionFiles(comment: NonNullable<Task['comments']>[number]) {
  return Array.isArray(comment.files) ? comment.files.filter(file =>
    typeof file?.id === 'string' && typeof file.name === 'string' && typeof file.size === 'number') : [];
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  expandButton: { width: 44, height: 44, marginStart: 'auto', alignItems: 'center', justifyContent: 'center' },
  expandIcon: { color: colors.accent, fontSize: 24, lineHeight: 30 },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 12, backgroundColor: 'rgba(33, 25, 53, 0.45)' },
  fullHistoryPopup: { width: '100%', maxWidth: 560, maxHeight: '95%', flexShrink: 1,
    borderRadius: 16, overflow: 'hidden', backgroundColor: colors.paper },
  fullHistoryHeader: { alignItems: 'flex-end', paddingHorizontal: 16, paddingTop: 4, flexShrink: 0 },
  fullHistoryScroll: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  fullHistoryContent: { paddingHorizontal: 16, paddingBottom: 16 },
  editActions: { marginStart: 'auto', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 },
  menuButton: { alignSelf: 'center', width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
    transform: [{ translateY: -4 }] },
  menuIcon: { color: colors.muted, fontSize: 24, lineHeight: 28, fontWeight: '700' },
  menuPanel: { borderWidth: 1, borderColor: colors.line, borderRadius: 9,
    backgroundColor: colors.paper, boxShadow: '0 8px 22px rgba(33, 25, 53, 0.18)' },
  menuItem: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  deleteAction: { color: colors.danger },
  discussionTime: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  draftFiles: { maxHeight: 124 },
  draftFileList: { paddingHorizontal: 8, paddingBottom: 8, gap: 6 },
}));
