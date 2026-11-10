import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../../components/Button';
import { MemberAvatar } from '../../components/MemberAvatar';
import { useToast } from '../../components/Toast';
import { auth, pilotMode, taskAssignmentEnabled } from '../../services/firebase/firebase';
import { formatVietnamDateTime } from '../../utils/dateTime';
import { formatFileSize, saveTaskAttachment } from './taskAttachments';
import { addTaskComment, commentMaxLength, getAssignmentComment } from './tasks';
import type { Task, TaskAssignee, TaskAttachment } from './tasks';
import { screenStyles } from '../../theme/screenStyles';
import { colors } from '../../theme/theme';

export function TaskDiscussion({ task, email, name, members }: {
  task: Task; email: string; name: string; members: Map<string, TaskAssignee>;
}) {
  const showToast = useToast();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [downloading, setDownloading] = useState('');
  const isAssignee = task.assigneeEmail === email;
  const canComment = isAssignee && (!pilotMode || taskAssignmentEnabled);
  const assignmentMessage = getAssignmentComment(task);
  const comments = task.comments?.filter(comment => comment !== assignmentMessage).slice(-20) ?? [];
  const messages = assignmentMessage?.text ? [assignmentMessage, ...comments] : comments;
  const files = task.comments?.flatMap(comment => Array.isArray(comment.files) ? comment.files.filter(file =>
    typeof file?.id === 'string' && typeof file.name === 'string' && typeof file.size === 'number') : []) ?? [];

  async function send() {
    if (!canComment || sending || !message.trim()) return;
    setSending(true);
    try {
      await addTaskComment(task.id, email, message);
      setMessage('');
    } catch {
      showToast('Chưa gửi được trao đổi. Kiểm tra kết nối và thử lại.', 'error');
    } finally {
      setSending(false);
    }
  }

  async function download(file: TaskAttachment) {
    setDownloading(file.id);
    try {
      await saveTaskAttachment(task.id, file);
    } catch {
      showToast('Chưa tải được tệp. Kiểm tra kết nối và thử lại.', 'error');
    } finally {
      setDownloading('');
    }
  }

  return (
    <View style={screenStyles.panel}>
      <Text accessibilityRole="header" style={screenStyles.cardTitle}>Trao đổi</Text>
      {messages.length === 0 ? <Text style={screenStyles.muted}>Chưa có trao đổi.</Text> : null}
      {messages.map((comment, index) => {
        const member = members.get(comment.by);
        const self = comment.by === email;
        const author = (self ? name : member?.name)
          || (comment.by === task.assigneeEmail ? task.assignee : '') || comment.by || 'Thành viên';
        const photo = member?.photoURL || (self ? auth.currentUser?.photoURL : null);
        const time = formatVietnamDateTime(comment.at);
        return <View key={`${comment.at}-${index}`} style={[screenStyles.detailRow, styles.discussionRow]}>
          <MemberAvatar name={author} photoURL={photo} />
          <View style={styles.discussionContent}>
            <View style={styles.discussionHeader}>
              <Text style={[screenStyles.label, styles.discussionName]}>{author}</Text>
              {time ? <Text style={styles.discussionTime}>{time}</Text> : null}
            </View>
            {comment === assignmentMessage ? <Text style={styles.discussionTime}>Lời nhắn khi giao việc</Text> : null}
            {comment.text ? <Text style={screenStyles.body}>{comment.text}</Text> : null}
          </View>
        </View>;
      })}
      {files.length ? <View style={screenStyles.detailRow}>
        <Text style={screenStyles.label}>Tệp đính kèm</Text>
        {files.map((file, index) => taskAssignmentEnabled
          ? <Pressable key={`${file.id}-${index}`} accessibilityRole="button" accessibilityLabel={`Tải tệp ${file.name}`}
              disabled={Boolean(downloading)} style={screenStyles.secondary} onPress={() => void download(file)}>
              <View style={styles.attachment}>
                <Text style={screenStyles.label}>{file.name}</Text>
                <Text style={screenStyles.muted}>{downloading === file.id ? 'Đang tải…' : `${formatFileSize(file.size)} · Tải tệp`}</Text>
              </View>
            </Pressable>
          : <Text key={`${file.id}-${index}`} style={screenStyles.muted}>{file.name} · {formatFileSize(file.size)}</Text>)}
      </View> : null}
      {canComment ? <>
        <TextInput accessibilityLabel="Nội dung trao đổi" placeholder="Nhập trao đổi về công việc"
          style={[screenStyles.input, screenStyles.messageInput]} value={message} onChangeText={setMessage}
          multiline maxLength={commentMaxLength} editable={!sending} />
        <Button label={sending ? 'Đang gửi…' : 'Gửi trao đổi'} onPress={send} disabled={sending || !message.trim()} />
      </> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  attachment: { padding: 10, gap: 3 },
  discussionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  discussionContent: { flex: 1, minWidth: 0, gap: 3 },
  discussionHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  discussionName: { flex: 1, minWidth: 0 },
  discussionTime: { color: colors.muted, fontSize: 12, lineHeight: 17 },
});
