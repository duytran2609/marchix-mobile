import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from '../../services/firebase/firebase';

export type RecentAccount = { email: string; name: string; photoURL: string | null };

const storageKey = `marchix:recent-accounts:v1:${auth.app.options.projectId}`;
const maxAccounts = 3;
let pendingWrite = Promise.resolve();

function isRecentAccount(value: unknown): value is RecentAccount {
  return !!value && typeof value === 'object' &&
    'email' in value && typeof value.email === 'string' && !!value.email &&
    'name' in value && typeof value.name === 'string' && !!value.name &&
    'photoURL' in value && (value.photoURL === null || typeof value.photoURL === 'string');
}

async function readAccounts(): Promise<RecentAccount[]> {
  try {
    const stored = await AsyncStorage.getItem(storageKey);
    const accounts: unknown = stored ? JSON.parse(stored) : [];
    return Array.isArray(accounts) ? accounts.filter(isRecentAccount).slice(0, maxAccounts) : [];
  } catch {
    return [];
  }
}

export async function loadRecentAccounts() {
  await pendingWrite;
  return readAccounts();
}

export function rememberAccount({ email, name, photoURL }: RecentAccount) {
  pendingWrite = pendingWrite.then(async () => {
    const accounts = await readAccounts();
    const others = accounts.filter(account => account.email.toLowerCase() !== email.toLowerCase());
    const updated = [{ email, name, photoURL }, ...others].slice(0, maxAccounts);
    await AsyncStorage.setItem(storageKey, JSON.stringify(updated));
  }).catch(() => {
    // Local storage can be unavailable. Signing in still works in that case.
  });
}
