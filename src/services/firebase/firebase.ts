import { initializeApp } from 'firebase/app';
import { connectAuthEmulator } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { Platform } from 'react-native';
import { getAppAuth } from './authPersistence';

const mode = process.env.EXPO_PUBLIC_FIREBASE_MODE ?? 'emulator';
export const emulatorMode = mode === 'emulator';
export const pilotMode = mode === 'pilot';
const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID?.trim();
const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY?.trim();
const appId = process.env.EXPO_PUBLIC_FIREBASE_APP_ID?.trim();
const authDomain = process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim();

const marchixProject = 'quanly-marchix';
const validCloudConfig = projectId && apiKey && appId && authDomain === `${projectId}.firebaseapp.com`;
const validCloudTarget = pilotMode ? projectId === marchixProject :
  mode === 'staging' && projectId?.toLowerCase() !== marchixProject;
export const configError = emulatorMode || (validCloudConfig && validCloudTarget) ? null :
  pilotMode ? 'Bản pilot cần cấu hình Firebase Quản lý Marchix.' :
    'Cần cấu hình một dự án Firebase staging riêng trong tệp .env.';
export const taskAssignmentEnabled = emulatorMode ||
  (!configError && process.env.EXPO_PUBLIC_ENABLE_TASK_ASSIGNMENT === 'true');

const app = initializeApp(emulatorMode || configError
  ? { projectId: 'demo-marchix-mobile', apiKey: 'marchix-emulator-key', appId: 'demo-marchix-mobile' }
  : { projectId, apiKey, appId, authDomain });

export const auth = getAppAuth(app);
export const db = getFirestore(app);
export const taskFunctions = getFunctions(app);
export const emulatorHost = process.env.EXPO_PUBLIC_EMULATOR_HOST?.trim() ||
  (Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1');
const authEmulatorUrl = `http://${emulatorHost}:9099`;

if (emulatorMode) {
  connectAuthEmulator(auth, authEmulatorUrl, { disableWarnings: true });
  connectFirestoreEmulator(db, emulatorHost, 8080);
  connectFunctionsEmulator(taskFunctions, emulatorHost, 5001);
}

export async function checkAuthEmulator() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(authEmulatorUrl, { signal: controller.signal });
    if (!response.ok) throw new Error('Auth Emulator không phản hồi.');
  } finally {
    clearTimeout(timer);
  }
}
