import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Switch, Text, TextInput, View } from 'react-native';
import { Dropdown } from '../../components/Dropdown';
import { Button } from '../../components/Button';
import { useToast } from '../../components/Toast';
import { useScreenStyles } from '../../theme/screenStyles';
import { useTheme } from '../../theme/theme';
import { budgetFields, memberFields, payrollFields, readFields, recurringFields, validateFields, workFields } from './adminSettingsFields';
import type { AdminSettingsTab, Field, FieldValue, FieldValues } from './adminSettingsFields';
import { generateMonthlyExpenses, loadProjectChoices, loadSettings, protectedOwner, removeRecurring, saveMember, saveRecurring, saveSettings } from './adminSettingsStore';
import type { SettingsRow } from './adminSettingsStore';

const documentFields = { work: workFields, budget: budgetFields, payroll: payrollFields };
const emptyRow: SettingsRow = { id: '', data: {} };
const formatMoney = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });

function SettingsField({ field, value, disabled, onChange }: {
  field: Field; value: FieldValue; disabled: boolean; onChange: (next: FieldValue) => void;
}) {
  const ui = useScreenStyles();
  const { colors } = useTheme();
  if (typeof field.initial === 'boolean') return (
    <View style={ui.listHeader}>
      <Text style={[ui.label, ui.listHeading]}>{field.label}</Text>
      <Switch accessibilityLabel={field.label} value={value === true} disabled={disabled}
        trackColor={{ true: colors.accent, false: colors.line }} onValueChange={onChange} />
    </View>
  );
  if (field.choices) return (
    <View style={ui.detailRow}>
      <Dropdown label={field.label} value={typeof value === 'boolean' ? String(value) : value} disabled={disabled}
        choices={field.choices.map(([value, label]) => ({ value, label }))} onChange={onChange} />
    </View>
  );
  return (
    <View style={ui.detailRow}>
      <Text style={ui.label}>{field.label}</Text>
      <TextInput accessibilityLabel={field.label} editable={!disabled} value={String(value)} style={ui.input}
        autoCapitalize={field.key === 'email' ? 'none' : undefined}
        inputMode={field.key === 'email' ? 'email' : typeof field.initial === 'number' && field.min !== undefined && field.min >= 0 ? 'decimal' : 'text'}
        placeholder={field.time ? 'HH:mm' : undefined} placeholderTextColor={colors.muted} maxLength={250}
        onChangeText={onChange} />
    </View>
  );
}

function SettingsForm({ tab, fields, row, email, onSave, onCancel, onRemove }: {
  tab: AdminSettingsTab; fields: Field[]; row: SettingsRow; email: string;
  onSave: (values: FieldValues) => Promise<void>; onCancel?: () => void; onRemove?: () => Promise<void>;
}) {
  const ui = useScreenStyles();
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
  const [confirmRemove, setConfirmRemove] = useState(false);
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

  return (
    <View style={ui.stack}>
      {fields.map(field => (
        <SettingsField key={field.key} field={field} value={draft[field.key]}
          disabled={busy || (tab === 'members' && ((Boolean(row.id) && field.key === 'email') ||
            (protectedAccount && ['role', 'enabled'].includes(field.key))))}
          onChange={value => setDraft(current => ({ ...current, [field.key]: value }))} />
      ))}
      {tab === 'work' && <Button label="Lấy vị trí hiện tại làm văn phòng" secondary disabled={busy}
        onPress={() => void run(locateOffice, 'Không lấy được vị trí hiện tại.')} />}
      <Button label={tab === 'budget' ? 'Lưu ngân sách' : 'Lưu cài đặt'} disabled={busy}
        onPress={() => void run(async () => onSave(validateFields(fields, draft)), 'Không lưu được cài đặt. Kiểm tra kết nối hoặc quyền truy cập.')} />
      {onCancel && <Button label="Hủy chỉnh sửa" secondary disabled={busy} onPress={onCancel} />}
      {onRemove && (confirmRemove ? (
        <View style={ui.stack}>
          <Text style={ui.error}>Xóa khoản chi cố định này?</Text>
          <Button label="Xác nhận xóa" disabled={busy} onPress={() => void run(onRemove, 'Không xóa được khoản chi.')} />
          <Button label="Giữ khoản chi" secondary disabled={busy} onPress={() => setConfirmRemove(false)} />
        </View>
      ) : <Button label="Xóa khoản chi cố định" secondary disabled={busy} onPress={() => setConfirmRemove(true)} />)}
    </View>
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
  const [generating, setGenerating] = useState(false);
  const generationLock = useRef(false);
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
    onScrollTop();
  }

  function openEditor(row: SettingsRow) {
    setEdit(row);
    onScrollTop();
  }

  if (error) return <View style={ui.stack}>
    <Text accessibilityRole="alert" style={ui.error}>Không tải được cài đặt. Kiểm tra kết nối hoặc quyền truy cập.</Text>
    <Button label="Thử lại" onPress={refresh} />
  </View>;
  if (!rows) return <ActivityIndicator accessibilityLabel="Đang tải cài đặt" color={colors.accent} />;
  if (!list) return <SettingsForm tab={tab} fields={documentFields[tab]} row={rows[0]} email={email}
    onSave={async values => { await saveSettings(tab, values, email); saved(); }} />;

  if (edit) {
    const fields = tab === 'members' ? memberFields : recurringFields.map(field =>
      field.key === 'projectId' ? { ...field, choices: projects } : field);
    return <SettingsForm key={edit.id} tab={tab} fields={fields} row={edit} email={email}
      onSave={async values => {
        if (tab === 'members') await saveMember(values, email, edit.id || undefined);
        else await saveRecurring(values, edit.id || undefined);
        saved();
      }} onCancel={() => { setEdit(undefined); onScrollTop(); }}
      onRemove={tab === 'recurring' && edit.id ? async () => {
        await removeRecurring(edit.id);
        toast('Đã xóa khoản chi cố định.');
        setEdit(undefined);
        refresh();
        onScrollTop();
      } : undefined} />;
  }

  async function generate() {
    if (generationLock.current) return;
    generationLock.current = true;
    setGenerating(true);
    try {
      const count = await generateMonthlyExpenses(await loadSettings('recurring'), email);
      toast(count ? `Đã tạo ${count} khoản chi chờ duyệt.` : 'Không có khoản chi cố định mới cần tạo.');
    } catch (error) {
      toast(error instanceof Error && !('code' in error) ? error.message : 'Không tạo được khoản chi tháng này.', 'error');
    } finally {
      generationLock.current = false;
      setGenerating(false);
    }
  }

  return (
    <View style={ui.stack}>
      <Button label={tab === 'members' ? '+ Thêm tài khoản' : '+ Thêm khoản chi'} onPress={() => openEditor(emptyRow)} />
      {tab === 'recurring' && <>
        <Button label="Tạo khoản chi cố định tháng này" secondary disabled={generating} onPress={() => void generate()} />
        <Text style={ui.muted}>Tổng đang áp dụng / tháng {formatMoney.format(rows.reduce((sum, row) =>
          sum + (row.data.active === false ? 0 : Number(row.data.amount) || 0), 0))}</Text>
      </>}
      {!rows.length && <Text style={ui.muted}>{tab === 'members' ? 'Chưa có tài khoản.' : 'Chưa có khoản chi cố định.'}</Text>}
      {rows.map(row => (
        <Pressable key={row.id} accessibilityRole="button" style={ui.detailRow} onPress={() => openEditor(row)}>
          <Text style={ui.label}>{String(row.data.name || row.id)}</Text>
          <Text style={ui.muted}>{tab === 'members'
            ? `${row.data.email || row.id} · ${row.data.role === 'admin' ? 'Quản trị' : 'Nhân viên'} · ${row.data.enabled === false ? 'Đã khóa' : 'Đang hoạt động'}`
            : `${formatMoney.format(Number(row.data.amount) || 0)} / tháng · Ngày ${row.data.day || 1} · ${row.data.active === false ? 'Tạm dừng' : 'Đang áp dụng'}`}</Text>
        </Pressable>
      ))}
    </View>
  );
}
