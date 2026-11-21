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
  const blockedId = `${id}-blocked`;
  const email = 'quantri@example.test';
  const title = `Kiểm thử trạng thái ${id}`;
  async function change(status: string, taskId = id) {
    expect((await request.patch(`${base}/tasks/${taskId}`, { headers, data: { fields: {
      title: { stringValue: taskId === id ? title : 'Việc đang vướng' }, assigneeEmail: { stringValue: email }, assignedBy: { stringValue: email },
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
    const ring = page.getByLabel(`${own.length} công việc`, { exact: true });
    await expect(ring).toBeVisible();
    for (const [status, count] of counts) {
      await expect(page.getByRole('button', { name: `${status} ${count}`, exact: true })).toBeVisible();
    }
    await expect(page.getByRole('button', { name: /^Đang mở khác/ })).toHaveCount(0);
    return { counts, ring, total: own.length };
  }
  try {
    await change('Chưa làm');
    await change('Vướng', blockedId);
    await page.goto(process.env.MARCHIX_PREVIEW_URL ?? 'http://localhost:8081');
    await page.getByRole('button', { name: 'Đăng nhập quản trị (mô phỏng)', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Truy cập nhanh', exact: true })).toHaveCount(0);
    const { counts, ring, total } = await check();
    const position = (status: string) => {
      let offset = 0;
      for (const [key, count] of counts) {
        if (key === status) {
          const angle = 2 * Math.PI * (offset + count / 2) / total;
          return { x: 60 + 52 * Math.sin(angle), y: 60 - 52 * Math.cos(angle) };
        }
        offset += count;
      }
      throw new Error(`Không có trạng thái ${status}`);
    };
    const legend = (status: string) => page.getByRole('button', { name: `${status} ${counts.get(status)}`, exact: true });
    const sector = (status: string) => page.getByTestId(`task-ring-sector-${status}`);
    await ring.tap({ position: position('Chưa làm') });
    await expect(ring.getByText('Chưa làm', { exact: true })).toBeVisible();
    await expect(ring.getByText(String(counts.get('Chưa làm')), { exact: true })).toBeVisible();
    await expect(legend('Chưa làm')).toHaveAttribute('aria-expanded', 'true');
    await expect(legend('Vướng')).toHaveCSS('opacity', '0.38');
    await expect(sector('Chưa làm')).toHaveCSS('opacity', '1');
    await expect(sector('Vướng')).toHaveCSS('opacity', '0.38');
    await expect(page.getByRole('button', { name: new RegExp(title) })).toBeVisible();
    await ring.click({ position: position('Vướng') });
    await expect(ring.getByText('Vướng', { exact: true })).toBeVisible();
    await expect(legend('Vướng')).toHaveAttribute('aria-expanded', 'true');
    await expect(legend('Chưa làm')).toHaveCSS('opacity', '0.38');
    await expect(sector('Vướng')).toHaveCSS('opacity', '1');
    await expect(sector('Chưa làm')).toHaveCSS('opacity', '0.38');
    await ring.tap({ position: position('Vướng') });
    await expect(ring.getByText('công việc', { exact: true })).toBeVisible();
    await expect(ring.getByText(String(total), { exact: true })).toBeVisible();
    await expect(legend('Vướng')).toHaveAttribute('aria-expanded', 'false');
    await expect(legend('Chưa làm')).toHaveCSS('opacity', '1');
    await expect(sector('Chưa làm')).toHaveCSS('opacity', '1');
    for (const status of [...taskStatuses, 'Trạng thái cũ', '']) {
      await change(status);
      await check();
    }
    expect((await request.delete(`${base}/tasks/${id}`, { headers })).ok()).toBe(true);
    await check();
  } finally {
    await request.delete(`${base}/tasks/${id}`, { headers });
    await request.delete(`${base}/tasks/${blockedId}`, { headers });
  }
});
