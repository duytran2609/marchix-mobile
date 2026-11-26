import Constants from 'expo-constants';
import { useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { PageHeader } from '../components/PageHeader';
import { TextInput } from '../components/TextInput';
import { useToast } from '../components/Toast';
import { AdminSettings } from '../features/settings/AdminSettings';
import { SettingsPage } from '../features/settings/SettingsPage';
import { SettingsSwitch } from '../features/settings/SettingsSwitch';
import { maxReminderDays, parseReminderDays, reminderOptions } from '../features/settings/reminderSettings';
import type { useReminderSettings } from '../features/settings/reminderSettings';
import type { usePinningEnabled } from '../navigation/usePinnedTabs';
import { useInformationStyles, useScreenStyles } from '../theme/screenStyles';
import { useTheme } from '../theme/theme';
import type { ThemeMode } from '../theme/theme';

const appearanceOptions = [
  { value: 'system', label: 'Hệ thống', icon: 'monitor' },
  { value: 'light', label: 'Sáng', icon: '☀︎' },
  { value: 'dark', label: 'Tối', icon: '☾' },
] as const satisfies readonly { value: ThemeMode; label: string; icon: string }[];

const generalTab = { id: 'general', tabLabel: 'Chung' } as const;
const adminTabs = [
  { id: 'members', tabLabel: 'Tài khoản', label: 'Tài khoản đăng nhập', description: 'Quản lý tài khoản, vai trò và quyền truy cập.' },
  { id: 'recurring', tabLabel: 'Chi cố định', label: 'Chi phí cố định hằng tháng', description: 'Thiết lập các khoản chi định kỳ và tạo khoản chi cho tháng hiện tại.' },
  { id: 'work', tabLabel: 'Công & việc', label: 'Chấm công & công việc', description: 'Thiết lập lịch làm việc, quy tắc chấm công, nhắc qua email và duyệt công việc.' },
  { id: 'budget', tabLabel: 'Ngân sách', label: 'Ngân sách chi hằng tháng theo nhóm', description: 'Đặt hạn mức chi theo nhóm để nhận cảnh báo ngân sách.' },
  { id: 'payroll', tabLabel: 'Lương & BH', label: 'Lương & bảo hiểm', description: 'Thiết lập các thông số tính lương và tỷ lệ đóng bảo hiểm.' },
] as const;
const allTabs = [generalTab, ...adminTabs] as const;
const reminderChoices = [...reminderOptions, { value: 'custom', label: 'Tùy chỉnh' }] as const;

function operatingSystem() {
  if (Platform.OS === 'android') return 'Android';
  if (Platform.OS === 'ios') return 'iOS';
  if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
    const { userAgent, maxTouchPoints } = navigator;
    if (/Android/i.test(userAgent)) return 'Android';
    if (/iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)) return 'iOS';
    if (/Windows/i.test(userAgent)) return 'Windows';
    if (/Macintosh/i.test(userAgent)) return 'macOS';
    if (/CrOS/i.test(userAgent)) return 'ChromeOS';
    if (/Linux/i.test(userAgent)) return 'Linux';
  }
  return 'Chưa xác định';
}

function Options<T extends string>({ label, options, value, disabled, onSelect }: {
  label: string;
  options: readonly { value: T; label: string; icon?: string }[];
  value: T;
  disabled: boolean;
  onSelect: (value: T) => Promise<void>;
}) {
  const styles = useScreenStyles();
  const { colors } = useTheme();
  const showToast = useToast();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.choices}>
      {options.map(option => {
        const checked = option.value === value;
        return (
          <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={option.label}
            aria-checked={checked} aria-disabled={disabled}
            disabled={disabled}
            style={({ pressed }) => [styles.choice, option.icon && optionStyles.withIcon,
              checked && styles.selected, (pressed || disabled) && styles.dimmed]}
            onPress={() => void onSelect(option.value).catch(() =>
              showToast('Chưa lưu được cài đặt. Vui lòng thử lại.', 'error'))}>
            {option.icon === 'monitor' ? (
              <View aria-hidden style={optionStyles.monitor}>
                <View style={[optionStyles.monitorScreen, { borderColor: colors.ink }]} />
                <View style={[optionStyles.monitorStem, { backgroundColor: colors.ink }]} />
                <View style={[optionStyles.monitorBase, { backgroundColor: colors.ink }]} />
              </View>
            ) : option.icon && (
              <Text aria-hidden style={[styles.label, optionStyles.icon]}>{option.icon}</Text>
            )}
            <Text style={[styles.label, styles.metadataValue]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ReminderTimingOptions({ reminders }: { reminders: ReturnType<typeof useReminderSettings> }) {
  const styles = useScreenStyles();
  const showToast = useToast();
  const [draft, setDraft] = useState<string | null>(null);
  const preset = reminderOptions.find(option => Number(option.value) === reminders.timing);
  const choice = draft !== null ? 'custom' : (preset?.value ?? 'custom');
  const input = draft ?? String(reminders.timing);
  const days = parseReminderDays(input.trim());
  const canSave = reminders.ready && days !== null && days > 0 && days !== reminders.timing;

  async function saveTiming(timing: number) {
    try {
      await reminders.setTiming(timing);
      showToast(timing === 0 ? 'Đã đặt nhắc việc vào đúng ngày đến hạn.' : `Đã đặt nhắc việc trước hạn ${timing} ngày.`);
      return true;
    } catch {
      showToast('Chưa lưu được thời điểm nhắc hạn. Vui lòng thử lại.', 'error');
      return false;
    }
  }

  async function saveCustom() {
    if (!canSave) return;
    if (await saveTiming(days)) {
      setDraft(current => current === draft ? null : current);
    }
  }

  return (
    <>
      <Options label="Thời điểm nhắc hạn" options={reminderChoices} value={choice}
        disabled={!reminders.ready} onSelect={async value => {
          if (value === 'custom') {
            setDraft(current => current ?? (reminders.timing > 0 ? String(reminders.timing) : ''));
            return;
          }
          setDraft(null);
          const timing = Number(value);
          if (timing !== reminders.timing) await saveTiming(timing);
        }} />
      {choice === 'custom' && (
        <View style={styles.stack}>
          <Text style={styles.label}>Số ngày trước hạn</Text>
          <View style={optionStyles.customTimingRow}>
            <TextInput accessibilityLabel="Số ngày trước hạn" inputMode="numeric" keyboardType="number-pad"
              value={input} onChangeText={setDraft} style={[styles.input, optionStyles.customTimingInput]} />
            <Button label="Lưu thời điểm" disabled={!canSave} onPress={() => void saveCustom()} />
          </View>
          <Text style={styles.muted}>Nhập số ngày từ 1 đến {maxReminderDays}.</Text>
        </View>
      )}
    </>
  );
}

export function SettingsScreen({ reminders, pinning, isAdmin, email }: {
  reminders: ReturnType<typeof useReminderSettings>;
  pinning: ReturnType<typeof usePinningEnabled>;
  isAdmin: boolean;
  email: string;
}) {
  const theme = useTheme();
  const styles = useScreenStyles();
  const information = useInformationStyles();
  const showToast = useToast();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const [selectedTab, setSelectedTab] = useState<typeof allTabs[number]['id']>(generalTab.id);
  const adminTab = isAdmin ? adminTabs.find(tab => tab.id === selectedTab) : undefined;
  const activeTab = adminTab ?? generalTab;

  function openManagementWeb() {
    void Linking.openURL('https://quanly.marchix.vn/').catch(() =>
      showToast('Không mở được trang quản lý Marchix. Vui lòng thử lại.', 'error'));
  }

  function scrollTop() {
    scroll.current?.scrollTo({ y: 0, animated: false });
  }

  const header = (
    <>
      <PageHeader title="Cài đặt" />
      <View accessibilityRole="tablist" accessibilityLabel="Nhóm cài đặt"
        style={[tabStyles.row, { backgroundColor: theme.colors.surfaceMuted }]}>
        {(isAdmin ? allTabs : [generalTab]).map(tab => {
          const selected = tab.id === activeTab.id;
          return (
            <Pressable key={tab.id} accessibilityRole="tab" aria-selected={selected}
              onPress={() => { setSelectedTab(tab.id); scrollTop(); }}
              style={[tabStyles.tab, selected && { backgroundColor: theme.colors.paper }]}>
              <Text style={[tabStyles.label, { color: theme.colors.muted },
                selected && { color: theme.colors.accent, fontWeight: '800' }]}>
                {tab.tabLabel}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </>
  );

  if (adminTab) {
    const panelHeader = <>
      <Text accessibilityRole="header" style={styles.cardTitle}>{adminTab.label}</Text>
      <Text style={styles.muted}>{adminTab.description}</Text>
    </>;
    return <AdminSettings key={adminTab.id} tab={adminTab.id} email={email} onScrollTop={scrollTop}
      renderPage={(content, saveButton) => (
        <SettingsPage scroll={scroll} header={header} panelHeader={panelHeader} saveButton={saveButton}>
          {content}
        </SettingsPage>
      )} />;
  }

  const appInformation = [
    ['Phiên bản', Constants.expoConfig?.version ?? 'Chưa xác định'],
    ['Hệ điều hành', operatingSystem()],
  ];

  return (
    <SettingsPage scroll={scroll} header={header}>
      <View style={styles.panel}>
        <Text accessibilityRole="header" style={styles.cardTitle}>Chế độ hiển thị</Text>
        <Options label="Chế độ hiển thị" options={appearanceOptions} value={theme.mode}
          disabled={!theme.ready} onSelect={theme.setMode} />
      </View>
      <View style={[styles.panel, optionStyles.switchRow]}>
        <View style={optionStyles.switchText}>
          <Text accessibilityRole="header" style={styles.cardTitle}>Ghim mục yêu thích</Text>
          <Text style={styles.muted}>Ghim các mục từ menu vào thanh điều hướng dưới.</Text>
        </View>
        <SettingsSwitch label="Ghim mục yêu thích" disabled={!pinning.ready} checked={pinning.value}
          onChange={value => void pinning.save(value).catch(() =>
            showToast('Chưa lưu được cài đặt. Vui lòng thử lại.', 'error'))} />
      </View>
      <View style={styles.panel}>
        <View style={optionStyles.switchRow}>
          <View style={optionStyles.switchText}>
            <Text accessibilityRole="header" style={styles.cardTitle}>Nhắc hạn công việc</Text>
            <Text style={styles.muted}>Nhắc việc được giao sắp đến hạn và quá hạn trên chuông theo giờ Việt Nam. Việc sắp đến hạn cũng hiển thị trong tab Công việc.</Text>
          </View>
          <SettingsSwitch label="Nhắc hạn công việc" disabled={!reminders.ready} checked={reminders.enabled}
            onChange={enabled => void reminders.setEnabled(enabled).then(() =>
              showToast(enabled ? 'Đã bật nhắc hạn công việc trên chuông.' : 'Đã tắt nhắc hạn công việc trên chuông.'),
            () => showToast('Chưa lưu được cài đặt nhắc hạn. Vui lòng thử lại.', 'error'))} />
        </View>
        {reminders.enabled && <ReminderTimingOptions reminders={reminders} />}
      </View>
      <View style={styles.panel}>
        <Text accessibilityRole="header" style={styles.cardTitle}>Thông tin ứng dụng</Text>
        <View>
          {appInformation.map(([label, value], index) => (
            <View key={label} style={[information.row, index > 0 && information.divider]}>
              <Text style={information.label}>{label}</Text>
              <Text style={information.value}>{value}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={styles.panel}>
        <Button label="Web Quản lý Marchix ↗" secondary onPress={openManagementWeb} />
      </View>
    </SettingsPage>
  );
}

const optionStyles = StyleSheet.create({
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchText: { flex: 1, gap: 4 },
  customTimingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  customTimingInput: { flex: 1, minWidth: 0 },
  withIcon: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  icon: { fontSize: 16, fontWeight: '400', lineHeight: 18 },
  monitor: { width: 16, height: 18, alignItems: 'center', justifyContent: 'center' },
  monitorScreen: { width: 15, height: 10, borderWidth: 1, borderRadius: 2 },
  monitorStem: { width: 1, height: 2 },
  monitorBase: { width: 7, height: 1 },
});

const tabStyles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, padding: 3, borderRadius: 10 },
  tab: { flexGrow: 1, minHeight: 44, paddingHorizontal: 6, paddingVertical: 8,
    borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
});
