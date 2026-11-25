import { useEffect, useRef, useState } from 'react';
import type { ComponentRef, Ref } from 'react';
import { Text, View } from 'react-native';
import { EmptyState } from '../../components/EmptyState';
import { Button } from '../../components/Button';
import { PopupAction } from '../../components/PopupBody';
import { Dropdown } from '../../components/Dropdown';
import { DiscussionAttachment, DiscussionComposer, DiscussionHeader, DiscussionHistory,
  DiscussionMessage, DiscussionQuote } from '../../components/Discussion';
import type { DiscussionSort } from '../../components/Discussion';
import { SearchInput } from '../../components/SearchInput';
import { SearchableChoiceDropdown } from '../../components/SearchableChoiceList';
import { TextInput } from '../../components/TextInput';
import { useScreenStyles } from '../../theme/screenStyles';
import { formatVietnamDateTime } from '../../utils/dateTime';
import { auth, taskAssignmentEnabled } from '../../services/firebase/firebase';
import { cashFileList } from '../cash/cashAttachments';
import { TaskAssignmentForm } from '../tasks/TaskAssignmentForm';
import { ProjectFormPopup } from './ProjectFormPopup';
import { formatFileSize } from '../tasks/taskAttachments';
import type { PickedAttachment } from '../tasks/taskAttachments';
import type { Task, TaskAttachment } from '../tasks/tasks';
import { choice, CollaborationFeedback, CollaborationFilePicker, CollaborationInput,
  PickedCollaborationFiles, toggleChoice, useCollaborationAction, useCollaborationFilePicker } from './ProjectCollaborationFields';
import { pinProjectPost, postKinds, publishProjectComment, publishProjectPost, resolveProjectPost, toggleProjectLike,
  watchProjectComments, watchProjectLike, watchProjectPosts } from './projectCollaborationStore';
import type { CollaborationMember, PostKind, ProjectComment, ProjectPost } from './projectCollaborationStore';
import type { Project } from './projects';

const dateLabel = (stamp?: ProjectPost['createdAt']) => formatVietnamDateTime(stamp?.toDate?.());
const titleFromMessage = (body: string) => body.trim().split('\n')[0].trim().slice(0, 200);
type DiscussionProps = {
  project: Project; email: string; isAdmin: boolean; team: CollaborationMember[]; tasks: Task[];
  memberName: (id: string) => string; memberPhoto: (id: string) => string | null | undefined;
  openFile: (file: TaskAttachment) => void; onOpenTask: (task: Task) => void;
};

export function ProjectDiscussion(props: DiscussionProps) {
  const styles = useScreenStyles();
  const { project, email, tasks, team } = props;
  const [posts, setPosts] = useState<ProjectPost[]>();
  const [count, setCount] = useState(20);
  const [sort, setSort] = useState<DiscussionSort>('oldest');
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
  });
  if (sort === 'oldest') shown?.reverse();
  shown?.sort((a, b) => Number(b.pinned) - Number(a.pinned));

  return <View style={styles.stack}>
    <DiscussionHeader sort={sort} onSort={posts?.length ? setSort : undefined} />
    <SearchInput accessibilityLabel="Tìm bài trao đổi" placeholder="Tìm bài trao đổi"
      value={term} onChangeText={setTerm} maxLength={160} />
    <Dropdown label="Lọc bài trao đổi" value={filter} onChange={setFilter}
      choices={[choice('', 'Tất cả'), choice('open', 'Cần xử lý'), choice('mine', 'Bài của tôi'), ...postKinds.map(kind => choice(kind))]} />
    <DiscussionHistory>
      {loadError ? <>
        <CollaborationFeedback error="Không tải được trao đổi dự án." />
        <Button label="Tải lại trao đổi" secondary onPress={() => { setLoadError(false); setRetry(value => value + 1); }} />
      </> : !shown ? <Text style={styles.muted}>Đang tải trao đổi…</Text>
        : !shown.length ? <EmptyState icon={term || filter ? 'search' : 'chat'}
          message={term || filter ? 'Chưa có trao đổi khớp bộ lọc.' : 'Chưa có trao đổi.'} />
          : shown.map((post, index) => <ProjectPostCard key={post.id} {...props} post={post} first={index === 0}
            onCreateTask={() => setTaskSource(post)} />)}
    </DiscussionHistory>
    {!loadError && (posts?.length ?? 0) >= count && count < 100 && <Button label="Tải thêm trao đổi" secondary
      onPress={() => setCount(value => value + 20)} />}
    {!loadError && count === 100 && posts?.length === 100 && <Text style={styles.muted}>Đang hiện 100 bài gần nhất.</Text>}
    <Button label="Đăng trao đổi" disabled={loadError}
      onPress={() => { setComposeNotice(''); setCompose(true); }} />
    <ProjectPostComposer visible={compose} projectId={project.id} email={email} tasks={tasks} team={team}
      onClose={() => setCompose(false)} onPosted={notice => { setComposeNotice(notice); setCompose(false); }} />
    <CollaborationFeedback notice={composeNotice} />
    {taskSource && taskAssignmentEnabled && <TaskAssignmentForm email={email} initial={{
      title: taskSource.title.slice(0, 160), projectId: project.id,
      note: ('Trao đổi dự án ' + project.name + '\nMã bài: ' + taskSource.id + '\n\n' + taskSource.body).slice(0, 2000),
    }} onClose={() => setTaskSource(undefined)} onSaved={() => setTaskSource(undefined)} />}
  </View>;
}

function ProjectMessageComposer({ placeholder, maxLength, disabled, quote, onCancelReply, onPublish, inputRef, sendLabel }: {
  placeholder: string; maxLength: number; disabled: boolean; quote?: { author: string; text: string };
  onCancelReply?: () => void; onPublish: (body: string, files: PickedAttachment[]) => Promise<string>;
  inputRef?: Ref<ComponentRef<typeof TextInput>>; sendLabel?: string;
}) {
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<PickedAttachment[]>([]);
  const action = useCollaborationAction();
  const { picking, error, pick } = useCollaborationFilePicker({ files, onChange: setFiles, disabled: disabled || action.busy });
  const message = body.trim() || files.map(file => file.name).join(', ').slice(0, maxLength);
  return <>
    <DiscussionComposer inputRef={inputRef} message={body} onChange={setBody} placeholder={placeholder} maxLength={maxLength}
      sending={action.busy} disabled={disabled} attachmentBusy={picking} onAttach={pick}
      quote={quote && <DiscussionQuote {...quote} />} onCancelReply={onCancelReply} sendLabel={sendLabel} canSend={!!message}
      extras={<PickedCollaborationFiles files={files} onChange={setFiles} disabled={disabled || picking || action.busy} error={error} />}
      onSend={() => void action.run(async () => {
        const notice = await onPublish(message, files);
        setBody('');
        setFiles([]);
        return notice;
      })} />
    <CollaborationFeedback {...action} />
  </>;
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
  return <ProjectFormPopup title="Đăng trao đổi" busy={disabled} onClose={onClose} footer={
    <PopupAction label={action.busy ? 'Đang đăng…' : 'Đăng trao đổi'} disabled={disabled || !title.trim() || !body.trim()}
      onPress={() => void action.run(async () => {
        const failed = await publishProjectPost(projectId, email, { title, body, kind, taskId, picked: files,
          mentions: mentions.filter(id => recipients.some(member => member.id === id)) });
        setTitle(''); setBody(''); setFiles([]); setMentions([]);
        onPosted(failed ? 'Đã đăng trao đổi. Có ' + failed + ' thông báo nhắc chưa gửi được.' : 'Đã đăng trao đổi.');
      })} />
  }>
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
    <CollaborationFeedback {...action} />
  </ProjectFormPopup>;
}

function ProjectPostCard({ project, post, email, isAdmin, tasks, memberName, memberPhoto, openFile, onOpenTask, onCreateTask, first }: DiscussionProps & {
  post: ProjectPost; onCreateTask: () => void; first: boolean;
}) {
  const styles = useScreenStyles();
  const [liked, setLiked] = useState(false);
  const [comments, setComments] = useState(false);
  const [commentsOpened, setCommentsOpened] = useState(false);
  const [replyRequest, setReplyRequest] = useState(0);
  const [editing, setEditing] = useState(false);
  const [conclusion, setConclusion] = useState('');
  const action = useCollaborationAction();
  const canPin = isAdmin || project.ownerEmail === email;
  const canResolve = canPin || post.createdBy === email;
  const task = tasks.find(row => row.id === post.taskId);
  useEffect(() => watchProjectLike(project.id, post.id, email, setLiked), [project.id, post.id, email]);
  return <DiscussionMessage author={memberName(post.createdBy)} photoURL={memberPhoto(post.createdBy)}
    time={dateLabel(post.createdAt)} first={first} onReply={() => {
      setCommentsOpened(true);
      setComments(true);
      setReplyRequest(value => value + 1);
    }}>
    <Text style={styles.badge}>{[post.pinned ? 'Đã ghim' : '', post.status === 'resolved' ? 'Đã giải quyết'
      : post.kind === 'Cập nhật' ? 'Cập nhật' : 'Cần xử lý'].filter(Boolean).join(' · ')}</Text>
    {post.kind !== 'Cập nhật' && <Text style={styles.muted}>{post.kind}</Text>}
    {(post.kind !== 'Cập nhật' || post.title !== titleFromMessage(post.body)) &&
      <Text accessibilityRole="header" style={styles.cardTitle}>{post.title}</Text>}
    <Text selectable style={styles.body}>{post.body}</Text>
    {task && <Button label="Mở công việc liên quan" secondary onPress={() => onOpenTask(task)} />}
    {cashFileList(post.files).map(file => <DiscussionAttachment key={file.id} file={file}
      detail={formatFileSize(file.size)} onOpen={() => openFile(file)} />)}
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
      <ProjectComments projectId={project.id} post={post} email={email} memberName={memberName} memberPhoto={memberPhoto}
        openFile={openFile} replyRequest={replyRequest} />
    </View>}
  </DiscussionMessage>;
}

function ProjectComments({ projectId, post, email, memberName, memberPhoto, openFile, replyRequest }: {
  projectId: string; post: ProjectPost; email: string; replyRequest: number;
  memberName: DiscussionProps['memberName']; memberPhoto: DiscussionProps['memberPhoto']; openFile: DiscussionProps['openFile'];
}) {
  const styles = useScreenStyles();
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const [comments, setComments] = useState<ProjectComment[]>();
  const [reply, setReply] = useState<{ request: number; target?: ProjectComment }>();
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => watchProjectComments(projectId, post.id, setComments, () => {
    setComments(undefined); setLoadError(true);
  }), [projectId, post.id, retry]);
  useEffect(() => {
    if (replyRequest) input.current?.focus();
  }, [replyRequest]);
  const target = reply?.request === replyRequest ? reply.target : replyRequest ? post : undefined;
  const quote = (entry: ProjectComment) => ({ author: memberName(entry.createdBy), text: entry.body });
  const commentsById = new Map(comments?.map(comment => [comment.id, comment]));
  return <View role="region" accessibilityLabel="Bình luận dự án" style={styles.stack}>
    {loadError ? <>
      <CollaborationFeedback error="Không tải được bình luận." />
      <Button label="Tải lại bình luận" secondary onPress={() => { setLoadError(false); setRetry(value => value + 1); }} />
    </> : !comments ? <Text style={styles.muted}>Đang tải bình luận…</Text>
      : !comments.length && <EmptyState icon="chat" message="Chưa có bình luận." />}
    {comments?.map((comment, index) => {
      const original = commentsById.get(comment.replyTo);
      return <DiscussionMessage key={comment.id} author={memberName(comment.createdBy)} photoURL={memberPhoto(comment.createdBy)}
        time={dateLabel(comment.createdAt)} first={index === 0} replyDisabled={loadError} onReply={() => {
          setReply({ request: replyRequest, target: comment });
          input.current?.focus();
        }}>
        {original ? <DiscussionQuote {...quote(original)} /> : comment.replyTo &&
          <Text style={styles.muted}>Bình luận gốc không còn hiển thị.</Text>}
        <Text selectable style={styles.body}>{comment.body}</Text>
        {cashFileList(comment.files).map(file => <DiscussionAttachment key={file.id} file={file}
          detail={formatFileSize(file.size)} onOpen={() => openFile(file)} />)}
      </DiscussionMessage>;
    })}
    <ProjectMessageComposer inputRef={input} placeholder="Nhập bình luận" maxLength={5000} disabled={loadError}
      quote={target && quote(target)} onCancelReply={() => setReply({ request: replyRequest })}
      sendLabel={target ? 'Gửi trả lời' : 'Gửi bình luận'} onPublish={async (body, files) => {
        await publishProjectComment(projectId, post.id, email, body, target && target.id !== post.id ? target.id : '', files);
        setReply(current => current === reply ? { request: replyRequest } : current);
        return 'Đã gửi bình luận.';
      }} />
  </View>;
}
