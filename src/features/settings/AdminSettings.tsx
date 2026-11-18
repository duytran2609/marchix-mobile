import { KeyboardScrollView } from '../../components/KeyboardScrollView';
import { KeyboardSafeAreaView } from '../../components/KeyboardViewport';
import { PaginatedList } from '../../components/PaginatedList';
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { ClickableCardHeader } from '../../components/CardChevron';
import { Dropdown } from '../../components/Dropdown';
import { Button } from '../../components/Button';
import { FieldLabel } from '../../components/FieldLabel';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { MemberAvatar } from '../../components/MemberAvatar';
import { PopupCloseButton } from '../../components/PopupCloseButton';
import { ToastLayer, useToast } from '../../components/Toast';
import { useScreenStyles } from '../../theme/screenStyles';
import { useTheme } from '../../theme/theme';
import { budgetFields, grants, memberFields, payrollFields, readFields, recurringFields, validateFields, workFields } from './adminSettingsFields';
import type { AdminSettingsTab, Field, FieldValue, FieldValues } from './adminSettingsFields';
import { loadProjectChoices, loadSettings, protectedOwner, removeRecurring, saveMember, saveRecurring, saveSettings } from './adminSettingsStore';
import type { SettingsRow } from './adminSettingsStore';
import { RecurringExpenseTable } from './RecurringExpenseTable';

const documentFields = { work: workFields, budget: budgetFields, payroll: payrollFields };
const emptyRow: SettingsRow = { id: '', data: {} };
const clockChoices = (count: number) => Array.from({ length: count }, (_, index) => {
  const value = String(index).padStart(2, '0');
  return { value, label: value };
});
const hours = clockChoices(24);
const minutes = clockChoices(60);
const optionalHours = [{ value: '', label: 'Để trống' }, ...hours];

function SettingsField({ tab, field, value, disabled, onChange }: {
  field: Field; value: FieldValue; disabled: boolean; onChange: (next: FieldValue) => void;
  tab: AdminSettingsTab;
}) {
  const ui = useScreenStyles();
  const { colors } = useTheme();
  const required = field.required || typeof field.initial === 'number';
  const isRole = field.key === 'role';
  const isRecurring = tab === 'recurring';
  const isWorkday = /^day[0-6]$/.test(field.key);
  const showFieldLabel = isRole || isRecurring || isWorkday;
  const isMoneyInput = field.money === true;
  const digitsOnly = isMoneyInput || field.key === 'grace' || field.key === 'gpsRadius';
  const isCoordinate = field.key === 'gpsLat' || field.key === 'gpsLng';
  const label = isMoneyInput ? `${field.label} (VNĐ)` : field.label;
  const inputValue = isMoneyInput ? String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : String(value);
  const highlightSelection = !isRole && !isWorkday &&
    !(isRecurring && ['category', 'partyType'].includes(field.key));
  if (typeof field.initial === 'boolean') return (
    <View style={ui.listHeader}>
      <Text style={[ui.label, ui.listHeading]}>{field.label}</Text>
      <Switch accessibilityLabel={field.label} value={value === true} disabled={disabled}
        trackColor={{ true: colors.accent, false: colors.line }} onValueChange={onChange} />
    </View>
  );
  if (field.time) {
    const [hour = '', minute = ''] = String(value).split(':');
    return <View style={fieldStyles.plain}>
      <FieldLabel style={ui.label} required={required}>{field.label}</FieldLabel>
      <View style={fieldStyles.clockRow}>
        <Dropdown label={`${field.label} – Giờ`} hideLabel highlightSelection={false} style={fieldStyles.clockPart}
          value={hour} choices={field.required ? hours : optionalHours} fallbackLabel="Giờ" disabled={disabled}
          onChange={next => onChange(next ? `${next}:${minute || '00'}` : '')} />
        <Dropdown label={`${field.label} – Phút`} hideLabel highlightSelection={false} style={fieldStyles.clockPart}
          value={minute} choices={minutes} fallbackLabel="Phút" disabled={disabled || !hour}
          onChange={next => onChange(`${hour}:${next}`)} />
      </View>
    </View>;
  }
  if (field.choices) return (
    <View style={isWorkday ? fieldStyles.workdayRow : fieldStyles.plain}>
      {showFieldLabel && <FieldLabel style={[ui.label, isWorkday && fieldStyles.workdayLabel]} required={required || isRole}>{field.label}</FieldLabel>}
      <Dropdown label={field.label} required={required} value={typeof value === 'boolean' ? String(value) : value} disabled={disabled}
        style={isWorkday ? fieldStyles.workdayDropdown : undefined}
        hideLabel={showFieldLabel} highlightSelection={highlightSelection}
        choices={field.choices.map(([value, label]) => ({ value, label }))} onChange={onChange} />
    </View>
  );
  return (
    <View style={fieldStyles.plain}>
      <FieldLabel style={ui.label} required={required}>{label}</FieldLabel>
      <TextInput accessibilityLabel={label} editable={!disabled} value={inputValue} style={ui.input}
        autoCapitalize={field.key === 'email' ? 'none' : undefined}
        inputMode={digitsOnly ? 'numeric' : field.key === 'email' ? 'email' :
          typeof field.initial === 'number' && field.min !== undefined && field.min >= 0 ? 'decimal' : 'text'}
        maxLength={250}
        onChangeText={text => {
          if (digitsOnly) {
            onChange(text.replace(/\D/g, '').replace(/^0+(?=\d)/, ''));
          } else if (isCoordinate) {
            const coordinate = text.replace(/[^\d.,-]/g, '').replace(/(?!^)-/g, '');
            onChange(coordinate.replace(/([.,])(.*)/, (_, separator: string, rest: string) =>
              separator + rest.replace(/[.,]/g, '')));
          } else {
            onChange(text);
          }
        }} />
    </View>
  );
}

function SettingsForm({ tab, fields, row, email, onSave, onCancel, popupTitle }: {
  tab: AdminSettingsTab; fields: Field[]; row: SettingsRow; email: string;
  onSave: (values: FieldValues) => Promise<void>; onCancel?: () => void;
  popupTitle?: string;
}) {
  const ui = useScreenStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const [draft, setDraft] = useState(() => {
    const { days, grants, ...data } = row.data;
    if (tab === 'work' && days && typeof days === 'object') {
      for (const [day, value] of Object.entries(days)) data[`day${day}`] = value;
    }
    if (tab === 'members') {
      data.email ||= row.id;
      if (Array.isArray(grants)) for (const grant of grants) data[grant] = true;
    }
    return readFields(fields, data);
  });
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const protectedAccount = tab === 'members' && [protectedOwner, email].some(account =>
    account === row.id || account === row.data.email);

  async function run(action: () => Promise<void>, fallback: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await action();
    } catch (error) {
      toast(error instanceof Error && !('code' in error) ? error.message : fallback, 'error');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function locateOffice() {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) throw new Error('Cần quyền vị trí để lấy tọa độ văn phòng.');
    const { coords } = await Location.getCurrentPositionAsync({});
    setDraft(current => ({ ...current, gpsLat: coords.latitude, gpsLng: coords.longitude }));
  }

  function close() {
    if (!lock.current) onCancel?.();
  }

  const permissionFields = tab === 'members' ? fields.filter(field => Object.keys(grants).includes(field.key)) : [];
  const inheritsPermissions = draft.role === 'admin';
  const workdayFields = tab === 'work' ? fields.filter(field => /^day[0-6]$/.test(field.key)) : [];
  function renderField(field: Field, inherited = false) {
    return <SettingsField key={field.key} tab={tab} field={field} value={inherited ? true : draft[field.key]}
      disabled={busy || inherited || (tab === 'members' && ((Boolean(row.id) && field.key === 'email') ||
        (protectedAccount && ['role', 'enabled'].includes(field.key))))}
      onChange={value => setDraft(current => ({ ...current, [field.key]: value }))} />;
  }

  const content = (
    <View style={ui.stack}>
      {fields.filter(field => !permissionFields.includes(field)).map(field => {
        if (tab === 'members' && field.key === 'enabled') return <View key={field.key} style={fieldStyles.permissions}>
          {renderField(field)}
          {row.id && permissionFields.map(permission => renderField(permission, inheritsPermissions))}
          {row.id && inheritsPermissions && permissionFields.length > 0 &&
            <Text style={ui.muted}>Vai trò Quản trị tự động có các quyền này.</Text>}
        </View>;
        if (field === workdayFields[0]) return <View key={field.key} style={ui.stack}>
          <Text accessibilityRole="header" style={ui.label}>Thời gian làm việc</Text>
          {workdayFields.map(day => renderField(day))}
        </View>;
        return workdayFields.includes(field) ? null : renderField(field);
      })}
      {tab === 'work' && <Button label="Lấy vị trí hiện tại làm văn phòng" secondary disabled={busy}
        onPress={() => void run(locateOffice, 'Không lấy được vị trí hiện tại.')} />}
      <Button label={tab === 'budget' ? 'Lưu ngân sách' : 'Lưu cài đặt'} disabled={busy}
        onPress={() => void run(async () => onSave(validateFields(fields, draft)), 'Không lưu được cài đặt. Kiểm tra kết nối hoặc quyền truy cập.')} />
      {onCancel && <Button label="Hủy" secondary disabled={busy} onPress={close} />}
    </View>
  );
  if (!popupTitle) return content;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <KeyboardSafeAreaView style={popup.backdrop}>
        <View role="dialog" accessibilityLabel={popupTitle} accessibilityViewIsModal
          style={[popup.card, { backgroundColor: colors.paper }]}>
          <View style={popup.header}>
            <Text accessibilityRole="header" style={[ui.cardTitle, popup.title]}>{popupTitle}</Text>
            <PopupCloseButton label={`Đóng ${popupTitle.toLowerCase()}`} disabled={busy} onPress={close} />
          </View>
          <KeyboardScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={popup.body}>
            {content}
          </KeyboardScrollView>
        </View>
        <ToastLayer safeAreaApplied />
      </KeyboardSafeAreaView>
    </Modal>
  );
}

export function AdminSettings({ tab, email, onScrollTop }: {
  tab: AdminSettingsTab; email: string; onScrollTop: () => void;
}) {
  const ui = useScreenStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const [rows, setRows] = useState<SettingsRow[]>();
  const [projects, setProjects] = useState<Awaited<ReturnType<typeof loadProjectChoices>>>([['', 'Không gắn dự án']]);
  const [edit, setEdit] = useState<SettingsRow>();
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const [removeTarget, setRemoveTarget] = useState<SettingsRow>();
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState('');
  const removeLock = useRef(false);
  const list = tab === 'members' || tab === 'recurring';

  useEffect(() => {
    let active = true;
    Promise.all([loadSettings(tab), tab === 'recurring' ? loadProjectChoices() : undefined]).then(([settings, choices]) => {
      if (!active) return;
      setRows(settings);
      if (choices) setProjects(choices);
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [tab, reload]);

  function refresh() {
    setError(false);
    setRows(undefined);
    setReload(current => current + 1);
  }

  function saved() {
    toast('Đã lưu cài đặt.');
    setEdit(undefined);
    refresh();
    if (!list) onScrollTop();
  }

  if (error) return <View style={ui.stack}>
    <Text accessibilityRole="alert" style={ui.error}>Không tải được cài đặt. Kiểm tra kết nối hoặc quyền truy cập.</Text>
    <Button label="Thử lại" onPress={refresh} />
  </View>;
  if (!rows) return <ActivityIndicator accessibilityLabel="Đang tải cài đặt" color={colors.accent} />;
  if (!list) return <SettingsForm tab={tab} fields={documentFields[tab]} row={rows[0]} email={email}
    onSave={async values => { await saveSettings(tab, values, email); saved(); }} />;

  const addTitle = tab === 'members' ? 'Thêm tài khoản' : 'Thêm khoản chi';
  let editor;
  if (edit) {
    const fields = tab === 'members' ? memberFields : recurringFields.map(field =>
      field.key === 'projectId' ? { ...field, choices: projects } : field);
    editor = <SettingsForm key={edit.id} tab={tab} fields={fields} row={edit} email={email}
      popupTitle={edit.id ? (tab === 'members' ? 'Chỉnh sửa tài khoản' : 'Chỉnh sửa khoản chi cố định') : addTitle}
      onSave={async values => {
        if (tab === 'members') await saveMember(values, email, edit.id || undefined);
        else await saveRecurring(values, edit.id || undefined);
        saved();
      }} onCancel={() => setEdit(undefined)} />;
  }

  function cancelRemove() {
    if (!removeLock.current) setRemoveTarget(undefined);
  }

  async function confirmRemove() {
    if (!removeTarget || removeLock.current) return;
    removeLock.current = true;
    setRemoving(true);
    setRemoveError('');
    try {
      await removeRecurring(removeTarget.id);
      setRows(current => current?.filter(row => row.id !== removeTarget.id));
      setRemoveTarget(undefined);
      toast('Đã xóa khoản chi cố định.');
    } catch {
      setRemoveError('Không xóa được khoản chi. Vui lòng thử lại.');
    } finally {
      removeLock.current = false;
      setRemoving(false);
    }
  }

  return (
    <View style={ui.stack}>
      <Button label={`+ ${addTitle}`} onPress={() => setEdit(emptyRow)} />
      {!rows.length && <Text style={ui.muted}>{tab === 'members' ? 'Chưa có tài khoản.' : 'Chưa có khoản chi cố định.'}</Text>}
      {tab === 'recurring' ? <RecurringExpenseTable rows={rows} onEdit={setEdit}
        onRemove={row => { setRemoveError(''); setRemoveTarget(row); }} /> : <PaginatedList items={rows}>
        {pageItems => pageItems.map(row => {
          const name = String(row.data.name || row.id);
          const photoURL = [row.data.photoURL, row.data.avatarUrl, row.data.avatarURL]
            .find((url): url is string => typeof url === 'string' && /^https:\/\//i.test(url));
          return (
            <View key={row.id} style={ui.detailRow}>
              <Pressable accessibilityRole="button" style={[fieldStyles.memberDetails, fieldStyles.memberRow]}
                onPress={() => setEdit(row)}>
                <MemberAvatar name={name} photoURL={photoURL} />
                <View style={fieldStyles.memberDetails}>
                  <ClickableCardHeader><Text style={ui.label}>{name}</Text></ClickableCardHeader>
                  <View style={fieldStyles.metadata}>
                    <Text style={ui.muted}><Text style={[fieldStyles.metaLabel, ui.metadataLabel]}>Email: </Text>{String(row.data.email || row.id)}</Text>
                    <Text style={ui.muted}><Text style={[fieldStyles.metaLabel, ui.metadataLabel]}>Vai trò: </Text>{row.data.role === 'admin' ? 'Quản trị' : 'Nhân viên'}</Text>
                    <Text style={ui.muted}><Text style={[fieldStyles.metaLabel, ui.metadataLabel]}>Trạng thái: </Text>{row.data.enabled === false ? 'Đã khóa' : 'Đang hoạt động'}</Text>
                  </View>
                </View>
              </Pressable>
            </View>
          );
        })}
      </PaginatedList>}
      {editor}
      {removeTarget && <Modal visible transparent animationType="fade" onRequestClose={cancelRemove}>
        <ConfirmDialog label="Xác nhận xóa khoản chi cố định" title="Xóa khoản chi cố định?"
          message={`Bạn có muốn xóa “${String(removeTarget.data.name || removeTarget.id)}”?`}
          action="Xóa khoản chi" pendingAction="Đang xóa…" pending={removing} error={removeError}
          onCancel={cancelRemove} onConfirm={() => void confirmRemove()} />
      </Modal>}
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  plain: { gap: 5 },
  clockRow: { flexDirection: 'row', gap: 8 },
  clockPart: { flex: 1 },
  workdayRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  workdayLabel: { flex: 1, fontWeight: '400' },
  workdayDropdown: { flex: 2 },
  permissions: { gap: 8 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  memberDetails: { flex: 1, minWidth: 0, gap: 5 },
  metadata: { gap: 5 },
  metaLabel: { fontWeight: '700' },
});

const popup = StyleSheet.create({
  backdrop: { flex: 1, padding: 16, justifyContent: 'center', alignItems: 'center', backgroundColor: '#17102588' },
  card: { width: '100%', maxWidth: 560, maxHeight: '92%', borderRadius: 18, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, gap: 8 },
  title: { flex: 1 },
  body: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 20 },
});
