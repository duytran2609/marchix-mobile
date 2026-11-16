import { PaginatedList } from '../../components/PaginatedList';
import { Bytes } from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { Dropdown } from '../../components/Dropdown';
import { useScreenStyles } from '../../theme/screenStyles';
import { cashFileLimit } from '../cash/cashAttachments';
import type { TaskAttachment } from '../tasks/tasks';
import { CollaborationFeedback, CollaborationFilePicker, CollaborationFiles, CollaborationInput, choice,
  useCollaborationAction } from './ProjectCollaborationFields';
import { createProjectFolder, moveProjectFile, uploadProjectFiles, watchProjectFolders, watchProjectLibrary } from './projectCollaborationStore';
import type { ProjectFolder, ProjectLibraryFile, ProjectUpload } from './projectCollaborationStore';

export function ProjectLibrary({ id, email, isAdmin, memberName, openFile }: {
  id: string; email: string; isAdmin: boolean; memberName: (id: string) => string; openFile: (file: TaskAttachment) => void;
}) {
  const styles = useScreenStyles();
  const [files, setFiles] = useState<ProjectLibraryFile[]>();
  const [folders, setFolders] = useState<ProjectFolder[]>([]);
  const [folder, setFolder] = useState('');
  const [name, setName] = useState('');
  const [term, setTerm] = useState('');
  const [picked, setPicked] = useState<ProjectUpload[]>([]);
  const [folderError, setFolderError] = useState('');
  const directoryInput = useRef<HTMLInputElement>(null);
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
  const shown = files?.filter(file => (!folder || file.folderPath === folder || file.folderPath.startsWith(folder + '/')) &&
    (file.name + ' ' + file.folderPath).toLocaleLowerCase('vi').includes(term.trim().toLocaleLowerCase('vi')));
  const disabled = action.busy || picking || loadError;
  return <View style={styles.stack}>
    <Text accessibilityRole="header" style={styles.cardTitle}>Ảnh, tệp & thư mục</Text>
    <Dropdown label="Thư mục" value={folder} choices={[choice('', 'Tất cả tệp'), ...choices]} onChange={setFolder} disabled={disabled} />
    <CollaborationInput label="Tên thư mục mới" value={name} onChange={setName} limit={120} disabled={disabled} />
    <Button label="+ Tạo thư mục" secondary disabled={disabled || !name.trim()} onPress={() => void action.run(async () => {
      setFolder(await createProjectFolder(id, email, folder, name));
      setName('');
      return 'Đã tạo thư mục.';
    })} />
    <CollaborationFilePicker label="Chọn ảnh / tài liệu" files={picked} onChange={files => { setFolderError(''); setPicked(files); }}
      onPicking={setPicking} disabled={disabled} />
    {Platform.OS === 'web' && <>
      <input ref={directoryInput} type="file" multiple {...{ webkitdirectory: '' }} hidden
        aria-label="Chọn thư mục từ máy tính" onChange={event => {
          const uploads = Array.from(event.currentTarget.files ?? []).map(file => ({
            name: file.name, type: file.type, size: file.size,
            relativeFolder: file.webkitRelativePath.split('/').slice(0, -1).filter(part => part && part !== '.' && part !== '..').join('/'),
            read: async () => Bytes.fromUint8Array(new Uint8Array(await file.arrayBuffer())).toBase64(),
          }));
          event.currentTarget.value = '';
          const problem = cashFileLimit(uploads);
          setFolderError(problem);
          if (!problem && uploads.length) setPicked(uploads);
        }} />
      <Button label="Chọn thư mục từ máy tính" secondary disabled={disabled} onPress={() => directoryInput.current?.click()} />
      <CollaborationFeedback error={folderError} />
    </>}
    <Button label={'Tải lên ' + (folder || 'Chung')} disabled={disabled || !picked.length} onPress={() => void action.run(async () => {
      await uploadProjectFiles(id, email, folder, picked);
      setPicked([]);
      return 'Đã tải tệp lên.';
    })} />
    <CollaborationFeedback {...action} />
    {loadError ? <>
      <CollaborationFeedback error="Không tải được thư viện dự án." />
      <Button label="Tải lại thư viện" secondary onPress={() => { setLoadError(false); setFiles(undefined); setRetry(value => value + 1); }} />
    </> : <>
      <CollaborationInput label="Tìm tệp" value={term} onChange={setTerm} limit={160} />
      {!shown ? <Text style={styles.muted}>Đang tải tệp…</Text> : !shown.length && <Text style={styles.muted}>Chưa có tệp khớp thư mục hoặc từ khóa.</Text>}
      <PaginatedList items={shown ?? []} resetKey={JSON.stringify([id, folder, term])}>
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
