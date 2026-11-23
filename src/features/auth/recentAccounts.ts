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
  const stored = await AsyncStorage.getItem(storageKey);
  try {
    const accounts: unknown = stored ? JSON.parse(stored) : [];
    return Array.isArray(accounts) ? accounts.filter(isRecentAccount).slice(0, maxAccounts) : [];
  } catch {
    return [];
  }
}

export async function loadRecentAccounts() {
  await pendingWrite;
  return readAccounts().catch(() => []);
}

function queueWrite(write: () => Promise<void>) {
  const result = pendingWrite.then(write);
  pendingWrite = result.catch(() => undefined);
  return result;
}

function withoutAccount(accounts: RecentAccount[], email: string) {
  return accounts.filter(account => account.email.toLowerCase() !== email.toLowerCase());
}

export function rememberAccount(account: RecentAccount) {
  void queueWrite(async () => {
    const others = withoutAccount(await readAccounts(), account.email);
    const updated = [account, ...others].slice(0, maxAccounts);
    await AsyncStorage.setItem(storageKey, JSON.stringify(updated));
  });
}

export function removeRecentAccount(email: string) {
  return queueWrite(async () => {
    const updated = withoutAccount(await readAccounts(), email);
    await AsyncStorage.setItem(storageKey, JSON.stringify(updated));
  });
}

export function clearRecentAccounts() {
  return queueWrite(() => AsyncStorage.removeItem(storageKey));
}
