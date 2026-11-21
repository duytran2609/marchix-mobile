import Constants from 'expo-constants';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/Toast';
import { AdminSettings } from '../features/settings/AdminSettings';
import { reminderOptions } from '../features/settings/reminderSettings';
import type { useReminderSettings } from '../features/settings/reminderSettings';
import { useScreenStyles } from '../theme/screenStyles';
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

export function SettingsScreen({ reminders, isAdmin, email, onScrollTop }: {
  reminders: ReturnType<typeof useReminderSettings>;
  isAdmin: boolean;
  email: string;
  onScrollTop: () => void;
}) {
  const theme = useTheme();
  const styles = useScreenStyles();
  const [selectedTab, setSelectedTab] = useState<typeof allTabs[number]['id']>(generalTab.id);
  const adminTab = isAdmin ? adminTabs.find(tab => tab.id === selectedTab) : undefined;
  const activeTab = adminTab ?? generalTab;

  return (
    <View style={styles.stack}>
      <PageHeader title="Cài đặt" />
      <View accessibilityRole="tablist" accessibilityLabel="Nhóm cài đặt"
        style={[tabStyles.row, { backgroundColor: theme.colors.surfaceMuted }]}>
        {(isAdmin ? allTabs : [generalTab]).map(tab => {
          const selected = tab.id === activeTab.id;
          return (
            <Pressable key={tab.id} accessibilityRole="tab" aria-selected={selected}
              onPress={() => { setSelectedTab(tab.id); onScrollTop(); }}
              style={[tabStyles.tab, selected && { backgroundColor: theme.colors.paper }]}>
              <Text style={[tabStyles.label, { color: theme.colors.muted },
                selected && { color: theme.colors.accent, fontWeight: '800' }]}>
                {tab.tabLabel}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {adminTab ? (
        <View style={styles.panel}>
          <Text accessibilityRole="header" style={styles.cardTitle}>{adminTab.label}</Text>
          <Text style={styles.muted}>{adminTab.description}</Text>
          <AdminSettings key={adminTab.id} tab={adminTab.id} email={email} onScrollTop={onScrollTop} />
        </View>
      ) : (
        <>
          <View style={styles.panel}>
            <Text accessibilityRole="header" style={styles.cardTitle}>Chế độ hiển thị</Text>
            <Options label="Chế độ hiển thị" options={appearanceOptions} value={theme.mode}
              disabled={!theme.ready} onSelect={theme.setMode} />
          </View>
          <View style={styles.panel}>
            <Text accessibilityRole="header" style={styles.cardTitle}>Nhắc hạn công việc</Text>
            <Text style={styles.muted}>Hiển thị việc được giao sắp đến hạn trong tab Công việc, theo giờ Việt Nam.</Text>
            <Options label="Thời điểm nhắc hạn" options={reminderOptions} value={reminders.value}
              disabled={!reminders.ready} onSelect={reminders.save} />
          </View>
          <View style={styles.panel}>
            <Text accessibilityRole="header" style={styles.cardTitle}>Phiên bản ứng dụng</Text>
            <Text style={[styles.body, styles.metadataValue]}>{Constants.expoConfig?.version ?? 'Chưa xác định'}</Text>
          </View>
        </>
      )}
    </View>
  );
}

const optionStyles = StyleSheet.create({
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
