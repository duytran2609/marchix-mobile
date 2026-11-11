import { usePreference } from './usePreference';

export const reminderOptions = [
  { value: 'off', label: 'Tắt' },
  { value: '0', label: 'Đúng ngày' },
  { value: '1', label: 'Trước 1 ngày' },
  { value: '3', label: 'Trước 3 ngày' },
] as const;

export type ReminderWindow = typeof reminderOptions[number]['value'];
const reminderValues = reminderOptions.map(option => option.value);

export function useReminderSettings(email: string) {
  return usePreference(`marchix:due-reminders:${email}`, reminderValues, 'off');
}
