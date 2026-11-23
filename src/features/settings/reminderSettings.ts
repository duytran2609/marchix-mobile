import { useStoredPreference } from './usePreference';

export const reminderOptions = [
  { value: '0', label: 'Đúng ngày' },
  { value: '1', label: 'Trước 1 ngày' },
  { value: '3', label: 'Trước 3 ngày' },
] as const;

export const maxReminderDays = 365;
export type ReminderWindow = 'off' | number;

type ReminderPreference = { enabled: boolean; timing: number };
const defaultPreference: ReminderPreference = { enabled: false, timing: 1 };

export function parseReminderDays(value: string): number | null {
  if (!/^\d{1,3}$/.test(value)) return null;
  const days = Number(value);
  return days <= maxReminderDays ? days : null;
}

function parseReminder(stored: string | null): ReminderPreference {
  if (stored === null) return defaultPreference;
  const disabled = stored.startsWith('off:');
  const timing = parseReminderDays(disabled ? stored.slice(4) : stored);
  return timing === null ? defaultPreference : { enabled: !disabled, timing };
}

function serializeReminder({ enabled, timing }: ReminderPreference) {
  return enabled ? String(timing) : `off:${timing}`;
}

export function useReminderSettings(email: string) {
  const { value, ready, save } = useStoredPreference(
    `marchix:due-reminders:${email}`, defaultPreference, parseReminder, serializeReminder,
  );
  const window: ReminderWindow = ready && value.enabled ? value.timing : 'off';
  return {
    ...value,
    ready,
    window,
    setEnabled: (enabled: boolean) => save({ ...value, enabled }),
    setTiming: (timing: number) => save({ ...value, timing }),
  };
}
