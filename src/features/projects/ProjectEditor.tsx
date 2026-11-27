import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { TextInput } from '../../components/TextInput';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PopupAction, PopupBody } from '../../components/PopupBody';
import { KeyboardViewport } from '../../components/KeyboardViewport';
import { Button } from '../../components/Button';
import { ChoiceButtons } from '../../components/ChoiceButtons';
import { FieldLabel } from '../../components/FieldLabel';
import { PopupHeader } from '../../components/PopupHeader';
import { SearchableChoiceDropdown } from '../../components/SearchableChoiceList';
import { auth } from '../../services/firebase/firebase';
import { useScreenStyles } from '../../theme/screenStyles';
import { createThemedStyles, useTheme } from '../../theme/theme';
import { DateCalendarField } from '../tasks/CalendarDialog';
import { statusTone } from '../tasks/TaskProgress';
import { watchCollaborationMembers } from './projectCollaborationStore';
import type { CollaborationMember } from './projectCollaborationStore';
import { generateProjectId, projectStatuses, projectTextFields, saveProject } from './projects';
import type { Project, ProjectProfile } from './projects';

const fields = Object.keys(projectTextFields) as (keyof typeof projectTextFields)[];
const multilineFields = ['goal', 'risks', 'note'];
const placeholders = {
  name: 'Nhập tên dự án',
  goal: 'Nhập mục tiêu hoặc kết quả cần bàn giao',
  phase: 'Ví dụ: Kiểm thử nội bộ',
  risks: 'Ghi vướng mắc, rủi ro hoặc việc cần quyết định',
  note: 'Mô tả ngắn phạm vi hoặc bối cảnh dự án',
};

function validDate(value: string) {
  if (!value) return true;
  const date = new Date(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function ProjectEditor({ project, canChangeOwner, onCancel, onSaved }: {
  project?: Project; canChangeOwner: boolean; onCancel: () => void; onSaved: (id: string) => void;
}) {
  const styles = useScreenStyles();
  const popup = usePopupStyles();
  const { colors } = useTheme();
  const [projectId] = useState(() => project?.id ?? generateProjectId());
  const [values, setValues] = useState(() => Object.fromEntries(
    fields.map(field => [field, project?.[field] || '']),
  ) as Record<typeof fields[number], string>);
  const [status, setStatus] = useState(project?.status || projectStatuses[0]);
  const [budget, setBudget] = useState(project?.budget ? String(project.budget) : '');
  const [members, setMembers] = useState<CollaborationMember[]>();
  const [membersError, setMembersError] = useState(false);
  const [memberRetry, setMemberRetry] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const title = project ? 'Chỉnh sửa dự án' : 'Thêm dự án';
  const ownerName = values.owner || values.ownerEmail;
  const currentMember = members?.find(member => member.id === values.ownerEmail);
  const user = auth.currentUser;

  useEffect(() => {
    if (canChangeOwner) return watchCollaborationMembers(setMembers, () => setMembersError(true));
  }, [canChangeOwner, memberRetry]);

  function changeOwner(member?: CollaborationMember) {
    setValues(current => ({ ...current, owner: member?.name || member?.id || '', ownerEmail: member?.id || '' }));
  }

  function close() {
    if (!pending.current) onCancel();
  }

  async function submit() {
    if (pending.current) return;
    const profile = {
      ...Object.fromEntries(fields.map(field => [field, values[field].trim()])),
      ...(!canChangeOwner && { owner: project?.owner ?? '', ownerEmail: project?.ownerEmail ?? '' }),
      status, budget: Number(budget || 0),
    } as ProjectProfile;
    if (!profile.name) return setError('Nhập tên dự án.');
    if (profile.ownerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.ownerEmail)) {
      return setError('Thông tin người phụ trách chưa hợp lệ.');
    }
    if (!/^\d*$/.test(budget) || !Number.isSafeInteger(profile.budget)) return setError('Nhập trần vốn bằng số nguyên dương hoặc để trống.');
    if (!validDate(profile.startDate) || !validDate(profile.deadline)) return setError('Chọn ngày hợp lệ trên lịch.');
    if (profile.startDate && profile.deadline && profile.deadline < profile.startDate) {
      return setError('Ngày kết thúc phải từ ngày bắt đầu trở đi.');
    }
    pending.current = true;
    setSaving(true);
    setError('');
    try {
      onSaved(await saveProject(profile, projectId, project ? 'edit' : 'create'));
    } catch {
      setError('Không lưu được dự án. Kiểm tra kết nối và quyền chỉnh sửa rồi thử lại.');
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  return <Modal transparent visible onRequestClose={close} statusBarTranslucent navigationBarTranslucent>
    <SafeAreaView style={popup.overlay}>
      <KeyboardViewport style={popup.center}>
        <View role="dialog" accessibilityLabel={title} accessibilityViewIsModal style={popup.panel}>
          <PopupHeader title={title} closeLabel="Đóng biểu mẫu dự án" onClose={close} disabled={saving} />
          <PopupBody contentContainerStyle={popup.body} footer={
            <PopupAction label={saving ? 'Đang lưu…' : 'Lưu dự án'} onPress={() => void submit()} disabled={saving} />
          }>
            {!project && <Text selectable style={[styles.muted, styles.metadataValue]}>
              <Text style={styles.metadataLabel}>Mã dự án: </Text>DA-{projectId}
            </Text>}
            {fields.filter(field => field !== 'ownerEmail').map(field => {
              const label = projectTextFields[field];
              if (field === 'owner') return <View key={field} style={popup.field}>
                <View style={popup.fieldLabelRow}>
                  <FieldLabel style={styles.label}>{label}</FieldLabel>
                  {canChangeOwner && !!ownerName && <Pressable accessibilityRole="button" accessibilityLabel="Bỏ người phụ trách"
                    disabled={saving} onPress={() => changeOwner()} style={popup.clearOwner}>
                    <Text style={popup.clearOwnerLabel}>Bỏ chọn</Text>
                  </Pressable>}
                </View>
                {canChangeOwner && members && !membersError ? <SearchableChoiceDropdown title={label}
                  items={members.map(member => ({
                    id: member.id, name: member.name || member.id, self: member.id === user?.email,
                    photoURL: member.photoURL || (member.id === user?.email ? user?.photoURL : null),
                  }))}
                  selected={currentMember ? [currentMember.id] : []} disabled={saving} label="Tìm thành viên"
                  placeholder={ownerName || 'Chọn người phụ trách'} placeholderStyle={!ownerName && styles.unsetValue}
                  emptyMessage="Không có thành viên phù hợp."
                  onToggle={id => {
                    const member = members.find(entry => entry.id === id);
                    if (member) changeOwner(member);
                  }} /> : <>
                  <Text style={ownerName ? styles.metadataValue : styles.unsetValue}>{ownerName || 'Chưa phân công'}</Text>
                  {canChangeOwner && (membersError ? <>
                    <Text accessibilityRole="alert" style={styles.error}>Không tải được danh sách thành viên.</Text>
                    <Button label="Tải lại thành viên" secondary disabled={saving}
                      onPress={() => { setMembersError(false); setMembers(undefined); setMemberRetry(value => value + 1); }} />
                  </> : <ActivityIndicator accessibilityLabel="Đang tải thành viên" color={colors.accent} />)}
                </>}
              </View>;
              if (field === 'startDate' || field === 'deadline') {
                const value = values[field];
                const otherDate = values[field === 'startDate' ? 'deadline' : 'startDate'];
                const limit = validDate(otherDate) && otherDate ? otherDate : undefined;
                const day = validDate(value) && value ? value : '';
                return <DateCalendarField key={field} label={label} value={day} initialDay={day || limit}
                  min={field === 'deadline' ? limit : undefined} max={field === 'startDate' ? limit : undefined}
                  emptyLabel={field === 'startDate' ? 'Chọn ngày bắt đầu' : 'Chọn ngày kết thúc'}
                  clearLabel={`Bỏ ${label.toLocaleLowerCase('vi')}`} disabled={saving}
                  onChange={date => setValues(current => ({ ...current, [field]: date }))} />;
              }
              const multiline = multilineFields.includes(field);
              return <View key={field} style={popup.field}>
                <FieldLabel style={styles.label} required={field === 'name'}>{label}</FieldLabel>
                <TextInput accessibilityLabel={label} editable={!saving} value={values[field]}
                  placeholder={placeholders[field]}
                  multiline={multiline} maxLength={multiline ? 4000 : 320}
                  onChangeText={value => setValues(current => ({ ...current, [field]: value }))}
                  style={[styles.input, multiline && styles.messageInput]} />
              </View>;
            })}
            <FieldLabel style={styles.label} required>Trạng thái</FieldLabel>
            <ChoiceButtons label="Trạng thái" items={projectStatuses.map(value => ({ value, label: value, tone: statusTone(value, colors) }))}
              value={status} onChange={setStatus} disabled={saving} />
            <Text style={styles.label}>Trần vốn dự án (VNĐ)</Text>
            <TextInput accessibilityLabel="Trần vốn dự án (VNĐ)" editable={!saving} keyboardType="number-pad"
              placeholder="Nhập số tiền, ví dụ 5.000.000" style={styles.input}
              value={budget.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
              onChangeText={value => setBudget(value.replace(/\D/g, ''))} />
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          </PopupBody>
        </View>
      </KeyboardViewport>
    </SafeAreaView>
  </Modal>;
}

const usePopupStyles = createThemedStyles(colors => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(33, 25, 53, 0.45)' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 12 },
  panel: { width: '100%', maxWidth: 560, flexShrink: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.paper },
  body: { padding: 16, gap: 12 },
  field: { gap: 6 },
  fieldLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  clearOwner: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  clearOwnerLabel: { color: colors.accent, fontSize: 13, fontWeight: '700' },
}));
