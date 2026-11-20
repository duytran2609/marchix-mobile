import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

export function usePreference<T extends string>(key: string, values: readonly T[], fallback: T) {
  const parse = useCallback((stored: string | null) => values.find(option => option === stored) ?? fallback, [values, fallback]);
  return useStoredPreference(key, fallback, parse, String);
}

export function useStoredPreference<T>(key: string, fallback: T, parse: (value: string | null) => T,
  serialize: (value: T) => string) {
  const [value, setValue] = useState(fallback);
  const [ready, setReady] = useState(false);
  const pendingWrite = useRef(Promise.resolve());
  const revision = useRef(0);
  const savedValue = useRef(fallback);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(key).then(stored => {
      if (!active) return;
      savedValue.current = parse(stored);
      setValue(savedValue.current);
    }).catch(() => {}).finally(() => {
      if (active) setReady(true);
    });
    return () => { active = false; };
  }, [key, parse]);

  function save(next: T) {
    const current = ++revision.current;
    setValue(next);
    const write = pendingWrite.current.then(async () => {
      await AsyncStorage.setItem(key, serialize(next));
      savedValue.current = next;
    });
    pendingWrite.current = write.catch(() => {
      if (current === revision.current) setValue(savedValue.current);
    });
    return write;
  }

  return { value, ready, save };
}
