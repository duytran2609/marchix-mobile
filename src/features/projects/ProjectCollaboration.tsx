import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { SearchableChoiceDropdown } from '../../components/SearchableChoiceList';
import { useScreenStyles } from '../../theme/screenStyles';
import { pilotMode } from '../../services/firebase/firebase';
import { AttachmentPreview } from '../cash/CashProofs';
import type { OpenCashFile } from '../cash/cashAttachments';
import type { Task, TaskAttachment } from '../tasks/tasks';
import { listTaskAssignees } from '../tasks/tasks';
import { CollaborationFeedback, toggleChoice, useCollaborationAction } from './ProjectCollaborationFields';
import { ProjectDiscussion } from './ProjectDiscussion';
import { ProjectLibrary } from './ProjectLibrary';
import { readProjectAttachment, saveProjectCollaborators, watchCollaborationMembers } from './projectCollaborationStore';
import type { CollaborationMember } from './projectCollaborationStore';
import type { Project } from './projects';

export function ProjectCollaboration(props: {
  project: Project; email: string; isAdmin: boolean; tasks: Task[]; onOpenTask: (task: Task) => void;
}) {
  const styles = useScreenStyles();
  const { project, email, isAdmin } = props;
  const hasAccess = isAdmin || project.ownerEmail === email || project.collaborators?.includes(email);
  return <View style={styles.stack}>
    <Text accessibilityRole="header" style={styles.cardTitle}>Trao đổi & tài liệu dự án</Text>
    {hasAccess ? <CollaborationWorkspace {...props} />
      : <Text style={styles.muted}>Quản trị, người phụ trách và thành viên được cấp quyền có thể xem mục này.</Text>}
  </View>;
}

function CollaborationWorkspace({ project, email, isAdmin, tasks, onOpenTask }: {
  project: Project; email: string; isAdmin: boolean; tasks: Task[]; onOpenTask: (task: Task) => void;
}) {
  const styles = useScreenStyles();
  const [members, setMembers] = useState<CollaborationMember[]>([]);
  const [membersError, setMembersError] = useState(false);
  const [memberRetry, setMemberRetry] = useState(0);
  const [showTeam, setShowTeam] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [libraryOpened, setLibraryOpened] = useState(false);
  const [preview, setPreview] = useState<OpenCashFile>();
  const read = useCollaborationAction();
  useEffect(() => {
    if (isAdmin || pilotMode) return watchCollaborationMembers(setMembers, () => setMembersError(true));
    let active = true;
    void listTaskAssignees().then(({ data }) => {
      if (active) setMembers(data.members.map(member => ({ id: member.email, name: member.name, role: 'staff' })));
    }, () => undefined);
    return () => { active = false; };
  }, [isAdmin, memberRetry]);
  const knownTeam = members.filter(member => member.role === 'admin' || member.id === project.ownerEmail ||
    project.collaborators?.includes(member.id));
  const fallbackTeam = members.length ? [] : [...new Set([project.ownerEmail, ...(project.collaborators ?? [])].filter(Boolean))]
    .map(id => ({ id, name: id, role: 'staff' }));
  const team = [...knownTeam, ...fallbackTeam];
  const memberName = (id: string) => members.find(member => member.id === id)?.name || id;
  function openFile(file: TaskAttachment) {
    void read.run(async () => { setPreview(await readProjectAttachment(project.id, file)); });
  }
  return <View style={styles.stack}>
    {membersError && <>
      <CollaborationFeedback error="Không tải được danh sách thành viên." />
      <Button label="Tải lại thành viên" secondary onPress={() => { setMembersError(false); setMemberRetry(value => value + 1); }} />
    </>}
    {isAdmin && <>
      <Button label={showTeam ? 'Ẩn quyền nhóm' : 'Thành viên được xem trao đổi và tệp'} secondary
        onPress={() => setShowTeam(value => !value)} />
      {showTeam && <ProjectAccessEditor project={project} members={members} disabled={membersError} />}
    </>}
    <Button label={showLibrary ? 'Ẩn thư viện' : 'Ảnh, tệp & thư mục'} secondary
      onPress={() => { setLibraryOpened(true); setShowLibrary(value => !value); }} />
    {libraryOpened && <View style={showLibrary ? styles.stack : { display: 'none' }}>
      <ProjectLibrary id={project.id} email={email} isAdmin={isAdmin} memberName={memberName} openFile={openFile} />
    </View>}
    {read.busy && <Text style={styles.muted}>Đang mở tệp…</Text>}
    <CollaborationFeedback error={read.error} />
    <ProjectDiscussion project={project} email={email} isAdmin={isAdmin} team={team} tasks={tasks}
      memberName={memberName} openFile={openFile} onOpenTask={onOpenTask} />
    {preview && <AttachmentPreview file={preview} projectFile onClose={() => setPreview(undefined)} />}
  </View>;
}

function ProjectAccessEditor({ project, members, disabled }: { project: Project; members: CollaborationMember[]; disabled: boolean }) {
  const styles = useScreenStyles();
  const [draft, setDraft] = useState<{ base: string[]; next: string[] }>();
  const persisted = project.collaborators ?? [];
  const selected = draft?.next ?? persisted;
  const action = useCollaborationAction();
  const choices = members.filter(member => member.role !== 'admin' && member.id !== project.ownerEmail)
    .map(member => ({ id: member.id, name: member.name || member.id }));
  const stale = !!draft && JSON.stringify(draft.base) !== JSON.stringify(persisted);
  return <View style={styles.detailRow}>
    <Text style={styles.muted}>Quản trị và người phụ trách luôn có quyền xem. Thành viên được chọn có quyền xem trao đổi và tệp của dự án.</Text>
    <SearchableChoiceDropdown title="Thành viên phối hợp" items={choices} selected={selected} disabled={disabled || action.busy || stale}
      multiple label="Tìm thành viên" emptyMessage="Không có thành viên phù hợp."
      onToggle={id => setDraft(current => ({ base: current?.base ?? persisted, next: toggleChoice(current?.next ?? persisted, id) }))} />
    <Button label="Lưu thành viên" secondary disabled={disabled || action.busy || !draft || stale} onPress={() => {
      if (draft) void action.run(async () => {
        await saveProjectCollaborators(project.id, draft.base, draft.next);
        setDraft(undefined);
        return 'Đã lưu quyền nhóm.';
      });
    }} />
    {stale && <>
      <CollaborationFeedback error="Danh sách thành viên đã thay đổi trong phiên khác." />
      <Button label="Dùng danh sách mới" secondary onPress={() => setDraft(undefined)} />
    </>}
    <CollaborationFeedback {...action} />
  </View>;
}
