import type { WorkspaceNotification } from './notifications';

export function useWorkspacePush(_email: string, _onOpen: (note: WorkspaceNotification) => void) {
  return async () => {};
}
