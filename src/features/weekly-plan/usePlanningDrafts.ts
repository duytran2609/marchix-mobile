import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';

export function usePlanningDrafts(email: string) {
  const prefix = `marchix:weekly-plan-drafts:${encodeURIComponent(email)}:`;
  const [drafts, setDrafts] = useState<ReadonlyMap<string, string> | null>(null);
  const [storageError, setStorageError] = useState(false);
  const current = useRef<ReadonlyMap<string, string>>(new Map());
  const pendingWrite = useRef(Promise.resolve());

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const keys = (await AsyncStorage.getAllKeys()).filter(key => key.startsWith(prefix));
        const entries = keys.length ? await AsyncStorage.multiGet(keys) : [];
        if (active) {
          const restored = new Map<string, string>();
          for (const [key, value] of entries) {
            if (value !== null) restored.set(key.slice(prefix.length), value);
          }
          current.current = restored;
        }
      } catch {
        if (active) setStorageError(true);
      } finally {
        if (active) setDrafts(current.current);
      }
    }
    void load();
    return () => { active = false; };
  }, [prefix]);

  function updateDraft(week: string, value: string | undefined, expected?: string) {
    const previous = current.current.get(week);
    if (previous === value || (value === undefined && previous !== expected)) return;

    const next = new Map(current.current);
    if (value === undefined) next.delete(week);
    else next.set(week, value);
    current.current = next;
    setDrafts(next);

    pendingWrite.current = pendingWrite.current.then(async () => {
      try {
        const key = prefix + week;
        if (value === undefined) await AsyncStorage.removeItem(key);
        else await AsyncStorage.setItem(key, value);
        setStorageError(false);
      } catch {
        setStorageError(true);
      }
    });
  }

  return { drafts, storageError, updateDraft };
}
