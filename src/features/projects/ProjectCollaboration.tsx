import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { AttachmentPreview } from '../../components/AttachmentPreview';
import { Button } from '../../components/Button';
import { useScreenStyles } from '../../theme/screenStyles';
import { auth, pilotMode } from '../../services/firebase/firebase';
import type { AttachmentFile } from '../../utils/attachmentFile';
import type { Task, TaskAttachment } from '../tasks/tasks';
import { listTaskAssignees } from '../tasks/tasks';
import { CollaborationFeedback, useCollaborationAction } from './ProjectCollaborationFields';
import { ProjectDiscussion } from './ProjectDiscussion';
import { ProjectLibrary } from './ProjectLibrary';
import { readProjectAttachment, watchCollaborationMembers } from './projectCollaborationStore';
import type { CollaborationMember } from './projectCollaborationStore';
import type { Project } from './projects';

export function ProjectCollaboration(props: {
  section: 'discussion' | 'library'; project: Project; email: string; isAdmin: boolean; tasks: Task[]; onOpenTask: (task: Task) => void;
}) {
  const styles = useScreenStyles();
  const { project, email, isAdmin } = props;
  const hasAccess = isAdmin || project.ownerEmail === email || project.collaborators?.includes(email);
  return <View style={styles.stack}>
    {hasAccess ? <CollaborationWorkspace {...props} />
      : <Text style={styles.muted}>Quản trị, người phụ trách và thành viên được cấp quyền có thể xem mục này.</Text>}
  </View>;
}

function CollaborationWorkspace({ section, project, email, isAdmin, tasks, onOpenTask }: {
  section: 'discussion' | 'library'; project: Project; email: string; isAdmin: boolean; tasks: Task[]; onOpenTask: (task: Task) => void;
}) {
  const styles = useScreenStyles();
  const [members, setMembers] = useState<CollaborationMember[]>([]);
  const [membersError, setMembersError] = useState(false);
  const [memberRetry, setMemberRetry] = useState(0);
  const [preview, setPreview] = useState<AttachmentFile>();
  const read = useCollaborationAction();
  useEffect(() => {
    if (isAdmin || pilotMode) return watchCollaborationMembers(setMembers, () => setMembersError(true));
    let active = true;
    void listTaskAssignees().then(({ data }) => {
      if (active) setMembers(data.members.map(member => ({ id: member.email, name: member.name, role: 'staff',
        photoURL: member.photoURL })));
    }, () => undefined);
    return () => { active = false; };
  }, [isAdmin, memberRetry]);
  const knownTeam = members.filter(member => member.role === 'admin' || member.id === project.ownerEmail ||
    project.collaborators?.includes(member.id));
  const fallbackTeam = members.length ? [] : [...new Set([project.ownerEmail, ...(project.collaborators ?? [])].filter(Boolean))]
    .map(id => ({ id, name: id, role: 'staff' }));
  const team = [...knownTeam, ...fallbackTeam];
  const memberName = (id: string) => members.find(member => member.id === id)?.name || id;
  const memberPhoto = (id: string) => members.find(member => member.id === id)?.photoURL ||
    (id === email ? auth.currentUser?.photoURL : undefined);
  function openFile(file: TaskAttachment) {
    void read.run(async () => { setPreview(await readProjectAttachment(project.id, file)); });
  }
  return <View style={styles.stack}>
    {read.busy && <Text style={styles.muted}>Đang mở tệp…</Text>}
    <CollaborationFeedback error={read.error} />
    {section === 'discussion' ? <ProjectDiscussion project={project} email={email} isAdmin={isAdmin} team={team} tasks={tasks}
      memberName={memberName} memberPhoto={memberPhoto} onOpenTask={onOpenTask} />
      : <ProjectLibrary id={project.id} email={email} isAdmin={isAdmin} memberName={memberName} openFile={openFile} />}
    {membersError && <>
      <CollaborationFeedback error="Không tải được danh sách thành viên." />
      <Button label="Tải lại thành viên" secondary onPress={() => { setMembersError(false); setMemberRetry(value => value + 1); }} />
    </>}
    {preview && <AttachmentPreview file={preview} onClose={() => setPreview(undefined)} />}
  </View>;
}
