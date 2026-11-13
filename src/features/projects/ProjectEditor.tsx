import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/Button';
import { FieldLabel } from '../../components/FieldLabel';
import { PopupCloseButton } from '../../components/PopupCloseButton';
import { useScreenStyles } from '../../theme/screenStyles';
import { createThemedStyles } from '../../theme/theme';
import { DateCalendarField } from '../tasks/CalendarDialog';
import { generateProjectId, projectStatuses, projectTextFields, saveProject } from './projects';
import type { Project, ProjectProfile } from './projects';

const fields = Object.keys(projectTextFields) as (keyof typeof projectTextFields)[];
const multilineFields = ['goal', 'risks', 'note'];

function validDate(value: string) {
  if (!value) return true;
  const date = new Date(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function ProjectEditor({ project, onCancel, onSaved }: {
  project?: Project; onCancel: () => void; onSaved: (id: string) => void;
}) {
  const styles = useScreenStyles();
  const popup = usePopupStyles();
  const [projectId] = useState(() => project?.id ?? generateProjectId());
  const [values, setValues] = useState(() => Object.fromEntries(
    fields.map(field => [field, project?.[field] || '']),
  ) as Record<typeof fields[number], string>);
  const [status, setStatus] = useState(project?.status || projectStatuses[0]);
  const [budget, setBudget] = useState(project?.budget ? String(project.budget) : '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const title = project ? 'Chỉnh sửa dự án' : 'Thêm dự án';

  function close() {
    if (!pending.current) onCancel();
  }

  async function submit() {
    if (pending.current) return;
    const profile = {
      ...Object.fromEntries(fields.map(field => [field, values[field].trim()])),
      status, budget: Number(budget || 0),
    } as ProjectProfile;
    if (!profile.name) return setError('Nhập tên dự án.');
    if (profile.ownerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.ownerEmail)) {
      return setError('Nhập email người phụ trách hợp lệ.');
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
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={popup.center}>
        <View role="dialog" accessibilityLabel={title} accessibilityViewIsModal style={popup.panel}>
          <View style={popup.header}>
            <Text accessibilityRole="header" style={styles.cardTitle}>{title}</Text>
            <PopupCloseButton label="Đóng biểu mẫu dự án" onPress={close} disabled={saving} />
          </View>
          <ScrollView style={popup.scroll} contentContainerStyle={popup.body} keyboardShouldPersistTaps="handled">
            {!project && <Text selectable style={styles.muted}>
              <Text style={popup.codeLabel}>Mã dự án: </Text>DA-{projectId}
            </Text>}
            {fields.map(field => {
              const label = projectTextFields[field];
              if (field === 'startDate' || field === 'deadline') {
                const value = values[field];
                const otherDate = values[field === 'startDate' ? 'deadline' : 'startDate'];
                const limit = validDate(otherDate) && otherDate ? otherDate : undefined;
                const day = validDate(value) && value ? value : '';
                return <DateCalendarField key={field} label={label} value={day} initialDay={day || limit}
                  min={field === 'deadline' ? limit : undefined} max={field === 'startDate' ? limit : undefined}
                  clearLabel={`Bỏ ${label.toLocaleLowerCase('vi')}`} disabled={saving}
                  onChange={date => setValues(current => ({ ...current, [field]: date }))} />;
              }
              const multiline = multilineFields.includes(field);
              return <View key={field} style={popup.field}>
                <FieldLabel style={styles.label} required={field === 'name'}>{label}</FieldLabel>
                <TextInput accessibilityLabel={label} editable={!saving} value={values[field]}
                  autoCapitalize={field === 'ownerEmail' ? 'none' : 'sentences'}
                  keyboardType={field === 'ownerEmail' ? 'email-address' : 'default'}
                  multiline={multiline} maxLength={multiline ? 4000 : 320}
                  onChangeText={value => setValues(current => ({ ...current, [field]: value }))}
                  style={[styles.input, multiline && styles.messageInput]} />
              </View>;
            })}
            <FieldLabel style={styles.label} required>Trạng thái</FieldLabel>
            <View style={styles.choices}>
              {projectStatuses.map(value => <Pressable key={value} accessibilityRole="button"
                accessibilityState={{ selected: value === status, disabled: saving }} disabled={saving}
                onPress={() => setStatus(value)} style={[styles.choice, value === status && styles.selected]}>
                <Text style={styles.label}>{value}</Text>
              </Pressable>)}
            </View>
            <Text style={styles.label}>Trần vốn dự án (đ)</Text>
            <TextInput accessibilityLabel="Trần vốn dự án (đ)" editable={!saving} keyboardType="number-pad"
              style={styles.input} value={budget.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
              onChangeText={value => setBudget(value.replace(/\D/g, ''))} />
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            <Button label={saving ? 'Đang lưu…' : 'Lưu dự án'} onPress={() => void submit()} disabled={saving} />
            <Button label="Hủy" onPress={close} secondary disabled={saving} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </Modal>;
}

const usePopupStyles = createThemedStyles(colors => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(33, 25, 53, 0.45)' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 12 },
  panel: { width: '100%', maxWidth: 560, flexShrink: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.paper },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16,
    paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.line },
  scroll: { flexShrink: 1, minHeight: 0 },
  body: { padding: 16, gap: 12 },
  codeLabel: { color: colors.metadataLabel, fontWeight: '700' },
  field: { gap: 6 },
}));
