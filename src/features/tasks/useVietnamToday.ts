import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { todayInVietnam } from './taskDates';

export function useVietnamToday(enabled: boolean) {
  const [today, setToday] = useState(todayInVietnam);

  useEffect(() => {
    if (!enabled) return;
    const refresh = () => setToday(todayInVietnam());
    refresh();
    const timer = setInterval(refresh, 30_000);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') refresh();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [enabled]);

  return today;
}
