import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';

export function usePreference<T extends string>(key: string, values: readonly T[], fallback: T) {
  const [value, setValue] = useState(fallback);
  const [ready, setReady] = useState(false);
  const pendingWrite = useRef(Promise.resolve());
  const revision = useRef(0);
  const savedValue = useRef(fallback);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(key).then(stored => {
      if (!active) return;
      savedValue.current = values.find(option => option === stored) ?? fallback;
      setValue(savedValue.current);
    }).catch(() => {}).finally(() => {
      if (active) setReady(true);
    });
    return () => { active = false; };
  }, [key, values, fallback]);

  function save(next: T) {
    const current = ++revision.current;
    setValue(next);
    const write = pendingWrite.current.then(async () => {
      await AsyncStorage.setItem(key, next);
      savedValue.current = next;
    });
    pendingWrite.current = write.catch(() => {
      if (current === revision.current) setValue(savedValue.current);
    });
    return write;
  }

  return { value, ready, save };
}
