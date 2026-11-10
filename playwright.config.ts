import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  workers: 1,
  use: {
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  },
  webServer: {
    command: 'npm run web -- --localhost --port 8081',
    url: 'http://localhost:8081',
    timeout: 120_000,
    env: { EXPO_PUBLIC_FIREBASE_MODE: 'emulator', EXPO_PUBLIC_EMULATOR_HOST: '127.0.0.1' },
  },
});
