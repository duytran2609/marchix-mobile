import { EmptyState } from '../../components/EmptyState';
import { PaginatedList } from '../../components/PaginatedList';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { FileTypeIcon } from '../../components/AttachmentLabel';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DeleteIconButton } from '../../components/DeleteIconButton';
import { Dropdown } from '../../components/Dropdown';
import { useScreenStyles } from '../../theme/screenStyles';
import { createThemedStyles } from '../../theme/theme';
import { attachmentMimeType } from '../../utils/attachmentFile';
import { attachmentImageUri, canPreviewImage } from '../../utils/attachmentImage';
import type { TaskAttachment } from '../tasks/tasks';
import { CollaborationFeedback, CollaborationFilePicker, CollaborationFiles, CollaborationInput, choice,
  isCollaborationImage, useCollaborationAction } from './ProjectCollaborationFields';
import { ProjectFormPopup } from './ProjectFormPopup';
import { createProjectFolder, readProjectAttachment, removeProjectLibraryEntry, uploadProjectFiles,
  watchProjectFolders, watchProjectLibrary } from './projectCollaborationStore';
import type { ProjectFolder, ProjectLibraryFile } from './projectCollaborationStore';

const tabs = [['images', 'Hình ảnh'], ['files', 'Tệp']] as const;
type LibraryTab = typeof tabs[number][0];

export function ProjectLibrary({ id, email, isAdmin, openFile }: {
  id: string; email: string; isAdmin: boolean; openFile: (file: TaskAttachment) => void;
}) {
  const styles = useScreenStyles();
  const local = useStyles();
  const [files, setFiles] = useState<ProjectLibraryFile[]>();
  const [folders, setFolders] = useState<ProjectFolder[]>([]);
  const [folder, setFolder] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TaskAttachment>();
  const [name, setName] = useState('');
  const [tab, setTab] = useState<LibraryTab>('images');
  const [picking, setPicking] = useState(false);
  const [uploadRevision, setUploadRevision] = useState(0);
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
  const images = tab === 'images';
  const shown = files?.filter(file => (!folder || file.folderPath === folder || file.folderPath.startsWith(folder + '/'))
    && isCollaborationImage(file) === images);
  const disabled = action.busy || picking || loadError;
  const itemLabel = images ? 'ảnh' : 'tệp';
  const cancelDelete = () => {
    if (action.busy) return;
    action.clearFeedback();
    setDeleteTarget(undefined);
  };

  return <View style={styles.stack}>
    <View style={local.folderRow}>
      <Dropdown label="Thư mục" value={folder} choices={[choice('', 'Tất cả tệp'), ...choices]}
        onChange={setFolder} style={local.folder} disabled={disabled} highlightSelection={false} singleLineValue />
      <Button label="+ Tạo thư mục" disabled={disabled} onPress={() => {
        setName('');
        action.clearFeedback();
        setCreatingFolder(true);
      }} />
    </View>
    <View accessibilityRole="tablist" accessibilityLabel="Loại tài liệu" style={local.tabs}>
      {tabs.map(([value, label]) => <Pressable key={value} accessibilityRole="tab" aria-selected={tab === value}
        disabled={action.busy || picking} onPress={() => {
          action.clearFeedback();
          setTab(value);
        }} style={[local.tab, tab === value && local.activeTab]}>
        <Text style={[local.tabLabel, tab === value && local.activeLabel]}>{label}</Text>
      </Pressable>)}
    </View>
    <CollaborationFilePicker key={tab} kind={tab} label={images ? 'Đính kèm ảnh' : 'Đính kèm tệp'}
      onPicking={value => { if (value) action.clearFeedback(); setPicking(value); }} disabled={disabled}
      onSelect={selected => action.run(async () => {
        await uploadProjectFiles(id, email, folder, selected);
        setUploadRevision(value => value + 1);
      })} />
    {!creatingFolder && !deleteTarget && <CollaborationFeedback {...action} />}
    {creatingFolder && <ProjectFormPopup title="Tạo thư mục" busy={action.busy} onClose={() => {
      action.clearFeedback();
      setCreatingFolder(false);
    }}>
      <CollaborationInput label="Tên thư mục mới" value={name} onChange={setName} limit={120} disabled={disabled} />
      <CollaborationFeedback error={action.error} />
      <Button label="Tạo thư mục" disabled={disabled || !name.trim()} onPress={() => void action.run(async () => {
        setFolder(await createProjectFolder(id, email, '', name));
        setCreatingFolder(false);
        return 'Đã tạo thư mục.';
      })} />
    </ProjectFormPopup>}
    {deleteTarget && <Modal visible transparent animationType="fade" onRequestClose={cancelDelete}>
      <ConfirmDialog label={`Xác nhận xóa ${itemLabel}`} title={`Xóa ${itemLabel}?`}
        message={`“${deleteTarget.name}” sẽ được gỡ khỏi thư viện dự án.`}
        action="Xác nhận xóa" pendingAction="Đang xóa…" pending={action.busy} error={action.error}
        onCancel={cancelDelete} onConfirm={() => void action.run(async () => {
          await removeProjectLibraryEntry(id, deleteTarget.id);
          setDeleteTarget(undefined);
        })} />
    </Modal>}
    {loadError ? <>
      <CollaborationFeedback error="Không tải được thư viện dự án." />
      <Button label="Tải lại thư viện" secondary onPress={() => { setLoadError(false); setFiles(undefined); setRetry(value => value + 1); }} />
    </> : <>
      {!shown ? <Text style={styles.muted}>{images ? 'Đang tải hình ảnh…' : 'Đang tải tệp…'}</Text>
        : !shown.length && <EmptyState icon="document" message={images ? 'Chưa có hình ảnh.' : 'Chưa có tệp.'} />}
      <PaginatedList items={shown ?? []} resetKey={`${tab}:${folder}:${uploadRevision}`} fixedPageSize={images ? 6 : 5}>
        {pageItems => {
          const rows = pageItems.map(file => {
            const deleteButton = (isAdmin || file.createdBy === email) && <DeleteIconButton
              label={`Xóa ${itemLabel} ${file.name}`} compact={images} disabled={disabled} onPress={() => {
                action.clearFeedback();
                setDeleteTarget(file);
              }} />;
            return images ? <View key={file.id} style={local.galleryCell}>
              <View style={local.imageCard}>
                <LibraryImage projectId={id} file={file} onPress={() => openFile(file)} />
                {deleteButton && <View style={local.imageDelete}>{deleteButton}</View>}
              </View>
            </View> : <CollaborationFiles key={file.id} files={[file]} open={openFile}
              renderAction={deleteButton ? () => deleteButton : undefined} />;
          });
          return images && rows.length ? <View style={local.gallery}>{rows}</View> : rows;
        }}
      </PaginatedList>
    </>}
  </View>;
}

function LibraryImage({ projectId, file: { id, name, size, type }, onPress }: {
  projectId: string; file: TaskAttachment; onPress: () => void;
}) {
  const styles = useStyles();
  const supported = canPreviewImage(attachmentMimeType({ name, type }));
  const [uri, setUri] = useState<string>();

  useEffect(() => {
    if (!supported) return;
    let active = true;
    void readProjectAttachment(projectId, { id, name, size, type }).then(file => {
      if (active) setUri(attachmentImageUri(file.bytes, attachmentMimeType(file)));
    }).catch(() => { if (active) setUri(''); });
    return () => { active = false; };
  }, [projectId, id, name, size, type, supported]);

  return <Pressable accessibilityRole="button" accessibilityLabel={`Xem ảnh ${name}`} onPress={onPress}>
    <View style={styles.thumbnail}>
      {supported && uri ? <Image aria-hidden source={{ uri }} style={styles.thumbnailImage} resizeMode="cover"
        onError={() => setUri('')} />
        : supported && uri === undefined ? <ActivityIndicator /> : <FileTypeIcon name={name} type={type} />}
    </View>
  </Pressable>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  folderRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  folder: { flex: 1 },
  tabs: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 9, backgroundColor: colors.surfaceMuted },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 7 },
  activeTab: { backgroundColor: colors.paper },
  tabLabel: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  activeLabel: { color: colors.accent, fontWeight: '800' },
  gallery: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  galleryCell: { width: '33.3333%', padding: 4 },
  imageCard: { flex: 1, position: 'relative', borderRadius: 9, overflow: 'hidden' },
  imageDelete: { position: 'absolute', top: 0, right: 0 },
  thumbnail: { width: '100%', aspectRatio: 1,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted },
  thumbnailImage: { width: '100%', height: '100%' },
}));
