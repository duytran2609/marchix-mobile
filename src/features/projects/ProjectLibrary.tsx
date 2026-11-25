import { EmptyState } from '../../components/EmptyState';
import { PaginatedList } from '../../components/PaginatedList';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { Dropdown } from '../../components/Dropdown';
import { SegmentedButtons } from '../../components/SegmentedButtons';
import { useScreenStyles } from '../../theme/screenStyles';
import type { PickedAttachment } from '../tasks/taskAttachments';
import type { TaskAttachment } from '../tasks/tasks';
import { CollaborationFeedback, CollaborationFilePicker, CollaborationFiles, CollaborationInput, choice,
  useCollaborationAction } from './ProjectCollaborationFields';
import { createProjectFolder, moveProjectFile, uploadProjectFiles, watchProjectFolders, watchProjectLibrary } from './projectCollaborationStore';
import type { ProjectFolder, ProjectLibraryFile } from './projectCollaborationStore';

const libraryTabs = [{ value: 'create', label: 'Tạo thư mục' }, { value: 'view', label: 'Xem thư mục' }] as const;

export function ProjectLibrary({ id, email, isAdmin, memberName, openFile }: {
  id: string; email: string; isAdmin: boolean; memberName: (id: string) => string; openFile: (file: TaskAttachment) => void;
}) {
  const styles = useScreenStyles();
  const [tab, setTab] = useState<typeof libraryTabs[number]['value']>('create');
  const [files, setFiles] = useState<ProjectLibraryFile[]>();
  const [folders, setFolders] = useState<ProjectFolder[]>([]);
  const [folder, setFolder] = useState('');
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<PickedAttachment[]>([]);
  const [picking, setPicking] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const action = useCollaborationAction();
  useEffect(() => {
    const fail = () => setLoadError(true);
    const stopFolders = watchProjectFolders(id, setFolders, fail);
    const stopFiles = watchProjectLibrary(id, setFiles, fail);
    return () => { stopFolders(); stopFiles(); };
  }, [id, retry]);
  const paths = [...new Set(['Chung', 'Trao đổi', ...folders.map(entry => entry.path), ...(files ?? []).map(file => file.folderPath),
    folder].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));
  const choices = paths.map(path => choice(path));
  const shown = files?.filter(file => !folder || file.folderPath === folder || file.folderPath.startsWith(folder + '/'));
  const disabled = action.busy || picking || loadError;
  return <View style={styles.stack}>
    <SegmentedButtons label="Chức năng thư mục" choices={libraryTabs} value={tab} onChange={setTab} />
    {tab === 'create' ? <>
      <CollaborationInput label="Tên thư mục mới" value={name} onChange={setName} limit={120} disabled={disabled} />
      <Button label="+ Tạo thư mục" secondary style={local.createButton}
        disabled={disabled || !name.trim()} onPress={() => void action.run(async () => {
        setFolder(await createProjectFolder(id, email, '', name));
        setName('');
        return 'Đã tạo thư mục.';
      })} />
    </> : <>
      <Dropdown label="Thư mục" value={folder} choices={[choice('', 'Tất cả tệp'), ...choices]}
        onChange={setFolder} disabled={disabled} highlightSelection={false} />
      <CollaborationFilePicker label="Đính kèm ảnh / tài liệu" files={picked} onChange={setPicked}
        onPicking={setPicking} disabled={disabled} />
      <Button label={'Tải lên ' + (folder || 'Chung')} disabled={disabled || !picked.length} onPress={() => void action.run(async () => {
        await uploadProjectFiles(id, email, folder, picked);
        setPicked([]);
        return 'Đã tải tệp lên.';
      })} />
    </>}
    <CollaborationFeedback {...action} />
    {loadError ? <>
      <CollaborationFeedback error="Không tải được thư viện dự án." />
      <Button label="Tải lại thư viện" secondary onPress={() => { setLoadError(false); setFiles(undefined); setRetry(value => value + 1); }} />
    </> : tab === 'view' && <>
      {!shown ? <Text style={styles.muted}>Đang tải tệp…</Text> : !shown.length && <EmptyState icon="document" message="Chưa có tệp trong thư mục." />}
      <PaginatedList items={shown ?? []} resetKey={folder}>
        {pageItems => pageItems.map(file => <View key={file.id} style={styles.detailRow}>
          <CollaborationFiles files={[file]} open={openFile} />
          <Text style={styles.muted}>{file.folderPath} · {memberName(file.createdBy)}</Text>
          {(isAdmin || file.createdBy === email) && <Dropdown label={'Chuyển thư mục · ' + file.name}
            value={file.folderPath} choices={choices} disabled={disabled} onChange={path => void action.run(async () => {
              await moveProjectFile(id, file.id, path);
              return 'Đã chuyển tệp.';
            })} />}
        </View>)}
      </PaginatedList>
      {(files?.length ?? 0) >= 100 && <Text style={styles.muted}>Đang hiện 100 tệp mới nhất.</Text>}
    </>}
  </View>;
}

const local = StyleSheet.create({
  createButton: { alignSelf: 'flex-end' },
});
