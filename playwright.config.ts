import { defineConfig } from '@playwright/test';

const previewUrl = process.env.MARCHIX_PREVIEW_URL ?? 'http://localhost:8081';
const port = new URL(previewUrl).port || '8081';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts', // Node component/unit tests run separately via test:unit.
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    timezoneId: 'Asia/Ho_Chi_Minh',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run web -- --localhost --port ${port}`,
    url: previewUrl,
    timeout: 120_000,
    env: { EXPO_PUBLIC_FIREBASE_MODE: 'emulator', EXPO_PUBLIC_EMULATOR_HOST: process.env.EXPO_PUBLIC_EMULATOR_HOST || '127.0.0.1' },
  },
});
