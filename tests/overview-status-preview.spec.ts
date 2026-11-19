import { test } from './helpers/startupReminder';
import { devices, expect } from '@playwright/test';
import { taskStatuses } from '../src/features/tasks/taskStatuses';

test.use({ ...devices['iPhone 13'], defaultBrowserType: 'chromium' });

test('Tình trạng công việc đếm đúng trạng thái, gồm Xong và không đếm trùng việc tự giao', async ({ page, request }) => {
  const host = process.env.EXPO_PUBLIC_EMULATOR_HOST || '127.0.0.1';
  const port = process.env.EXPO_PUBLIC_FIRESTORE_EMULATOR_PORT || 8080;
  const base = `http://${host}:${port}/v1/projects/demo-marchix-mobile/databases/(default)/documents`;
  const headers = { Authorization: 'Bearer owner' };
  const id = `overview-status-${Date.now()}`;
  const email = 'quantri@example.test';
  const title = `Kiểm thử trạng thái ${id}`;
  async function change(status: string) {
    expect((await request.patch(`${base}/tasks/${id}`, { headers, data: { fields: {
      title: { stringValue: title }, assigneeEmail: { stringValue: email }, assignedBy: { stringValue: email },
      status: { stringValue: status }, due: { stringValue: '2000-01-01' },
    } } })).ok()).toBe(true);
  }
  async function check() {
    const response = await request.post(base + ':runQuery', { headers, data: {
      structuredQuery: { from: [{ collectionId: 'tasks' }] },
    } });
    expect(response.ok()).toBe(true);
    const documents = await response.json();
    const own = documents.flatMap((row: any) => row.document ? [row.document.fields] : [])
      .filter((fields: any) => fields.assigneeEmail?.stringValue === email || fields.assignedBy?.stringValue === email);
    const counts = new Map<string, number>(taskStatuses.map(status => [status, 0]));
    for (const fields of own) {
      const status = fields.status?.stringValue || 'Chưa làm';
      const key = taskStatuses.some(value => value === status) ? status : 'Khác';
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    await expect(page.getByLabel(`${own.length} công việc`, { exact: true })).toBeVisible();
    for (const [status, count] of counts) {
      await expect(page.getByRole('button', { name: `${status} ${count}`, exact: true })).toBeVisible();
    }
    await expect(page.getByRole('button', { name: /^Đang mở khác/ })).toHaveCount(0);
  }
  try {
    await change('Chưa làm');
    await page.goto(process.env.MARCHIX_PREVIEW_URL ?? 'http://localhost:8081');
    await page.getByRole('button', { name: 'Đăng nhập quản trị (mô phỏng)', exact: true }).click();
    for (const status of [...taskStatuses, 'Trạng thái cũ', '']) {
      await change(status);
      await check();
    }
    expect((await request.delete(`${base}/tasks/${id}`, { headers })).ok()).toBe(true);
    await check();
  } finally {
    await request.delete(`${base}/tasks/${id}`, { headers });
  }
});
