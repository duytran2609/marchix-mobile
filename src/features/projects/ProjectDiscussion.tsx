import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { EmptyState } from '../../components/EmptyState';
import { Button } from '../../components/Button';
import { Dropdown } from '../../components/Dropdown';
import { SearchableChoiceDropdown } from '../../components/SearchableChoiceList';
import { useScreenStyles } from '../../theme/screenStyles';
import { formatVietnamDateTime } from '../../utils/dateTime';
import { taskAssignmentEnabled } from '../../services/firebase/firebase';
import { TaskAssignmentForm } from '../tasks/TaskAssignmentForm';
import { ProjectFormPopup } from './ProjectFormPopup';
import type { PickedAttachment } from '../tasks/taskAttachments';
import type { Task, TaskAttachment } from '../tasks/tasks';
import { choice, CollaborationFeedback, CollaborationFilePicker, CollaborationFiles, CollaborationInput, toggleChoice,
  useCollaborationAction } from './ProjectCollaborationFields';
import { pinProjectPost, postKinds, publishProjectComment, publishProjectPost, resolveProjectPost, toggleProjectLike,
  watchProjectComments, watchProjectLike, watchProjectPosts } from './projectCollaborationStore';
import type { CollaborationMember, PostKind, ProjectComment, ProjectPost } from './projectCollaborationStore';
import type { Project } from './projects';

const dateLabel = (stamp?: ProjectPost['createdAt']) => formatVietnamDateTime(stamp?.toDate?.());
type DiscussionProps = {
  project: Project; email: string; isAdmin: boolean; team: CollaborationMember[]; tasks: Task[];
  memberName: (id: string) => string; openFile: (file: TaskAttachment) => void; onOpenTask: (task: Task) => void;
};

export function ProjectDiscussion(props: DiscussionProps) {
  const styles = useScreenStyles();
  const { project, email, tasks, team } = props;
  const [posts, setPosts] = useState<ProjectPost[]>();
  const [count, setCount] = useState(20);
  const [filter, setFilter] = useState('');
  const [term, setTerm] = useState('');
  const [compose, setCompose] = useState(false);
  const [composeNotice, setComposeNotice] = useState('');
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [taskSource, setTaskSource] = useState<ProjectPost>();
  useEffect(() => watchProjectPosts(project.id, count, setPosts, () => {
    setPosts(undefined);
    setLoadError(true);
  }), [project.id, count, retry]);
  const shown = posts?.filter(post => {
    const matchesFilter = !filter || (filter === 'open' ? post.status === 'open'
      : filter === 'mine' ? post.createdBy === email : post.kind === filter);
    return matchesFilter && (post.title + ' ' + post.body).toLocaleLowerCase('vi').includes(term.trim().toLocaleLowerCase('vi'));
  }).sort((a, b) => Number(b.pinned) - Number(a.pinned));

  return <View style={styles.stack}>
    <Button label="+ Đăng trao đổi / báo vướng" secondary disabled={loadError}
      onPress={() => { setComposeNotice(''); setCompose(true); }} />
    <ProjectPostComposer visible={compose} projectId={project.id} email={email} tasks={tasks} team={team}
      onClose={() => setCompose(false)} onPosted={notice => { setComposeNotice(notice); setCompose(false); }} />
    <CollaborationFeedback notice={composeNotice} />
    <Text accessibilityRole="header" style={styles.cardTitle}>Trao đổi gần đây</Text>
    <CollaborationInput label="Tìm bài trao đổi" value={term} onChange={setTerm} limit={160} />
    <Dropdown label="Lọc bài trao đổi" value={filter} onChange={setFilter}
      choices={[choice('', 'Tất cả'), choice('open', 'Cần xử lý'), choice('mine', 'Bài của tôi'), ...postKinds.map(kind => choice(kind))]} />
    {loadError ? <>
      <CollaborationFeedback error="Không tải được trao đổi dự án." />
      <Button label="Tải lại trao đổi" secondary onPress={() => { setLoadError(false); setRetry(value => value + 1); }} />
    </> : !shown ? <Text style={styles.muted}>Đang tải trao đổi…</Text>
      : !shown.length ? <EmptyState icon="search" message="Chưa có trao đổi khớp bộ lọc." />
        : shown.map(post => <ProjectPostCard key={post.id} {...props} post={post} onCreateTask={() => setTaskSource(post)} />)}
    {!loadError && (posts?.length ?? 0) >= count && count < 100 && <Button label="Tải thêm trao đổi" secondary
      onPress={() => setCount(value => value + 20)} />}
    {!loadError && count === 100 && posts?.length === 100 && <Text style={styles.muted}>Đang hiện 100 bài gần nhất.</Text>}
    {taskSource && taskAssignmentEnabled && <TaskAssignmentForm email={email} initial={{
      title: taskSource.title.slice(0, 160), projectId: project.id,
      note: ('Trao đổi dự án ' + project.name + '\nMã bài: ' + taskSource.id + '\n\n' + taskSource.body).slice(0, 2000),
    }} onClose={() => setTaskSource(undefined)} onSaved={() => setTaskSource(undefined)} />}
  </View>;
}

function ProjectPostComposer({ projectId, email, tasks, team, visible, onClose, onPosted }: {
  projectId: string; email: string; tasks: Task[]; team: CollaborationMember[];
  visible: boolean; onClose: () => void; onPosted: (notice: string) => void;
}) {
  const styles = useScreenStyles();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [kind, setKind] = useState<PostKind>('Cập nhật');
  const [taskId, setTaskId] = useState('');
  const [mentions, setMentions] = useState<string[]>([]);
  const [files, setFiles] = useState<PickedAttachment[]>([]);
  const [picking, setPicking] = useState(false);
  const action = useCollaborationAction();
  const disabled = action.busy || picking;
  const recipients = team.filter(member => member.id !== email).map(member => ({ id: member.id, name: member.name || member.id }));
  if (!visible) return null;
  return <ProjectFormPopup title="Đăng trao đổi / báo vướng" busy={disabled} onClose={onClose}>
    <Dropdown label="Loại bài" value={kind} choices={postKinds.map(value => ({ value, label: value }))} onChange={setKind} disabled={disabled} />
    <Dropdown label="Liên kết công việc" value={taskId} onChange={setTaskId} disabled={disabled}
      choices={[choice('', 'Trao đổi chung trong dự án'), ...tasks.map(task => choice(task.id, task.title))]} />
    <CollaborationInput label="Tiêu đề trao đổi" value={title} onChange={setTitle} limit={200} disabled={disabled} />
    <CollaborationInput label="Nội dung trao đổi" value={body} onChange={setBody} limit={10000} multiline disabled={disabled} />
    <CollaborationFilePicker label="Đính kèm ảnh / tài liệu vào bài" files={files} onChange={setFiles}
      onPicking={setPicking} disabled={action.busy} />
    {!!recipients.length && <>
      <Text style={styles.label}>Nhắc người cần phản hồi</Text>
      <SearchableChoiceDropdown title="Nhắc người cần phản hồi" items={recipients} selected={mentions}
        disabled={disabled} multiple label="Tìm thành viên" emptyMessage="Không có thành viên phù hợp."
        onToggle={id => setMentions(values => toggleChoice(values, id))} />
    </>}
    <Button label={action.busy ? 'Đang đăng…' : 'Đăng trao đổi'} disabled={disabled || !title.trim() || !body.trim()}
      onPress={() => void action.run(async () => {
        const failed = await publishProjectPost(projectId, email, { title, body, kind, taskId, picked: files,
          mentions: mentions.filter(id => recipients.some(member => member.id === id)) });
        setTitle(''); setBody(''); setFiles([]); setMentions([]);
        onPosted(failed ? 'Đã đăng trao đổi. Có ' + failed + ' thông báo nhắc chưa gửi được.' : 'Đã đăng trao đổi.');
      })} />
    <Button label="Hủy" secondary disabled={disabled} onPress={onClose} />
    <CollaborationFeedback {...action} />
  </ProjectFormPopup>;
}

function ProjectPostCard({ project, post, email, isAdmin, tasks, memberName, openFile, onOpenTask, onCreateTask }: DiscussionProps & {
  post: ProjectPost; onCreateTask: () => void;
}) {
  const styles = useScreenStyles();
  const [liked, setLiked] = useState(false);
  const [comments, setComments] = useState(false);
  const [commentsOpened, setCommentsOpened] = useState(false);
  const [editing, setEditing] = useState(false);
  const [conclusion, setConclusion] = useState('');
  const action = useCollaborationAction();
  const canPin = isAdmin || project.ownerEmail === email;
  const canResolve = canPin || post.createdBy === email;
  const task = tasks.find(row => row.id === post.taskId);
  useEffect(() => watchProjectLike(project.id, post.id, email, setLiked), [project.id, post.id, email]);
  return <View style={[styles.detailRow, { gap: 8 }]}>
    <Text style={styles.muted}>{[memberName(post.createdBy), dateLabel(post.createdAt), post.kind].filter(Boolean).join(' · ')}</Text>
    <Text style={styles.badge}>{[post.pinned ? 'Đã ghim' : '', post.status === 'resolved' ? 'Đã giải quyết'
      : post.kind === 'Cập nhật' ? 'Cập nhật' : 'Cần xử lý'].filter(Boolean).join(' · ')}</Text>
    <Text accessibilityRole="header" style={styles.cardTitle}>{post.title}</Text>
    <Text selectable style={styles.body}>{post.body}</Text>
    {task && <Button label="Mở công việc liên quan" secondary onPress={() => onOpenTask(task)} />}
    <CollaborationFiles files={post.files} open={openFile} />
    {!!post.mentions?.length && <Text style={[styles.muted, styles.metadataValue]}>
      <Text style={styles.metadataLabel}>Cần phản hồi · </Text>{post.mentions.map(memberName).join(', ')}
    </Text>}
    {!!post.conclusion && <View style={styles.detailRow}>
      <Text style={[styles.label, styles.metadataLabel]}>Kết luận trao đổi</Text>
      <Text selectable style={[styles.body, styles.metadataValue]}>{post.conclusion}</Text>
    </View>}
    <View style={styles.choices}>
      <Button label={liked ? 'Đã thích' : 'Thích'} secondary selected={liked} disabled={action.busy}
        onPress={() => void action.run(() => toggleProjectLike(project.id, post.id, email))} />
      <Button label={comments ? 'Ẩn bình luận' : 'Bình luận'} secondary onPress={() => { setCommentsOpened(true); setComments(value => !value); }} />
      {taskAssignmentEnabled && <Button label="Tạo công việc" secondary onPress={onCreateTask} />}
      {canPin && <Button label={post.pinned ? 'Bỏ ghim' : 'Ghim bài'} secondary disabled={action.busy}
        onPress={() => void action.run(() => pinProjectPost(project.id, post.id, !post.pinned))} />}
      {canResolve && !editing && <Button label={post.status === 'resolved' ? 'Mở lại' : 'Chốt kết luận'} secondary disabled={action.busy}
        onPress={() => {
          if (post.status === 'resolved') void action.run(() => resolveProjectPost(project.id, post.id));
          else { setConclusion(post.conclusion || ''); setEditing(true); }
        }} />}
    </View>
    {editing && <>
      <CollaborationInput label="Kết luận / việc tiếp theo" value={conclusion} onChange={setConclusion} limit={5000}
        multiline disabled={action.busy} />
      <Button label="Lưu kết luận" disabled={action.busy || !conclusion.trim()} onPress={() => void action.run(async () => {
        await resolveProjectPost(project.id, post.id, conclusion);
        setEditing(false);
      })} />
      <Button label="Hủy kết luận" secondary disabled={action.busy} onPress={() => setEditing(false)} />
    </>}
    <CollaborationFeedback {...action} />
    {commentsOpened && <View style={comments ? styles.stack : { display: 'none' }}>
      <ProjectComments projectId={project.id} postId={post.id} email={email} memberName={memberName} openFile={openFile} />
    </View>}
  </View>;
}

function ProjectComments({ projectId, postId, email, memberName, openFile }: {
  projectId: string; postId: string; email: string; memberName: (id: string) => string; openFile: (file: TaskAttachment) => void;
}) {
  const styles = useScreenStyles();
  const [comments, setComments] = useState<ProjectComment[]>();
  const [body, setBody] = useState('');
  const [reply, setReply] = useState('');
  const [files, setFiles] = useState<PickedAttachment[]>([]);
  const [picking, setPicking] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const action = useCollaborationAction();
  useEffect(() => watchProjectComments(projectId, postId, setComments, () => {
    setComments(undefined); setLoadError(true);
  }), [projectId, postId, retry]);
  const disabled = action.busy || picking || loadError;
  return <View style={styles.stack}>
    {loadError ? <>
      <CollaborationFeedback error="Không tải được bình luận." />
      <Button label="Tải lại bình luận" secondary onPress={() => { setLoadError(false); setRetry(value => value + 1); }} />
    </> : !comments ? <Text style={styles.muted}>Đang tải bình luận…</Text>
      : !comments.length && <EmptyState icon="chat" message="Chưa có bình luận." />}
    {comments?.map(comment => <View key={comment.id} style={[styles.detailRow, comment.replyTo && { marginLeft: 12 }]}>
      <Text style={styles.muted}>{[memberName(comment.createdBy), dateLabel(comment.createdAt)].filter(Boolean).join(' · ')}</Text>
      {!!comment.replyTo && <Text style={styles.muted}>Trả lời bình luận</Text>}
      <Text selectable style={styles.body}>{comment.body}</Text>
      <CollaborationFiles files={comment.files} open={openFile} />
      <Button label="Trả lời" secondary disabled={disabled} onPress={() => setReply(comment.id)} />
    </View>)}
    <Dropdown label="Trả lời bình luận" value={reply} onChange={setReply} disabled={disabled}
      choices={[choice('', 'Bình luận chung'), ...(comments ?? []).map(comment =>
        choice(comment.id, memberName(comment.createdBy) + ' · ' + comment.body.slice(0, 60)))]} />
    <CollaborationInput label="Nội dung bình luận" value={body} onChange={setBody} limit={5000} multiline disabled={disabled} />
    <CollaborationFilePicker label="Đính kèm tệp vào bình luận" files={files} onChange={setFiles}
      onPicking={setPicking} disabled={action.busy || loadError} />
    <Button label={action.busy ? 'Đang gửi…' : 'Gửi bình luận'} disabled={disabled || !body.trim()}
      onPress={() => void action.run(async () => {
        await publishProjectComment(projectId, postId, email, body, reply, files);
        setBody(''); setFiles([]); setReply('');
        return 'Đã gửi bình luận.';
      })} />
    <CollaborationFeedback {...action} />
  </View>;
}
