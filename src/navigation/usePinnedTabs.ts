import { useStoredPreference } from '../features/settings/usePreference';
import { workspaceTabs } from './workspaceRoutes';
import type { WorkspaceTab } from './workspaceRoutes';

export type PinnableTab = Exclude<WorkspaceTab, 'tong-quan'>;
export const maxPinnedTabs = 3;
const defaultPins: PinnableTab[] = [];

function parsePins(value: string | null): PinnableTab[] {
  if (!value) return defaultPins;
  const saved: unknown = JSON.parse(value);
  if (!Array.isArray(saved)) return defaultPins;
  const valid = saved.filter((id): id is PinnableTab =>
    id !== 'tong-quan' && workspaceTabs.some(tab => tab.id === id));
  return [...new Set(valid)].slice(0, maxPinnedTabs);
}

export function usePinnedTabs(email: string) {
  return useStoredPreference(`marchix:pinned-tabs:${email}`, defaultPins, parsePins, JSON.stringify);
}
