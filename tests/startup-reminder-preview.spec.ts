import { devices, expect, test } from '@playwright/test';
import { shiftDay, todayInVietnam } from '../src/features/tasks/taskDates';

test.use({ ...devices['iPhone 13'], defaultBrowserType: 'chromium' });

test('Nhắc việc khi vào app và hiện lại khi quay về app', async ({ page, request }) => {
  const id = `startup-reminder-${Date.now()}`;
  const today = todayInVietnam();
  const admin = 'quantri@example.test';
  const staff = 'nhanvien@example.test';
  const task = `Việc đến hạn ${id}`;
  const assignee = `Người phụ trách ${id}`;
  const host = process.env.EXPO_PUBLIC_EMULATOR_HOST || '127.0.0.1';
  const port = process.env.EXPO_PUBLIC_FIRESTORE_EMULATOR_PORT || 8080;
  const base = `http://${host}:${port}/v1/projects/demo-marchix-mobile/databases/(default)/documents`;
  const headers = { Authorization: 'Bearer owner' };
  const fixtures = [
    [`tasks/${id}`, { title: task, status: 'Đang làm', due: today, assigneeEmail: admin }],
    [`tasks/${id}-late`, { title: 'Việc của nhân viên', status: 'Vướng',
      due: shiftDay(today, -1), assigneeEmail: staff, assignee }],
    [`cash/${id}`, { type: 'chi', note: 'Khoản cần duyệt', status: 'Chờ duyệt', createdBy: staff }],
    [`requests/${id}`, { type: 'Nghỉ phép', status: 'Chờ duyệt', createdBy: staff }],
  ] as const;
  const dialog = page.getByRole('dialog', { name: 'Chào Quản trị demo — cần chú ý hôm nay' });

  try {
    for (const [path, fields] of fixtures) {
      const response = await request.patch(`${base}/${path}`, { headers, data: {
        fields: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, { stringValue: value }])),
      } });
      expect(response.ok()).toBe(true);
    }
    await page.goto(process.env.MARCHIX_PREVIEW_URL ?? 'http://localhost:8081');
    await page.getByRole('button', { name: 'Đăng nhập quản trị (mô phỏng)' }).click();
    await expect(dialog.getByText(`Đến hạn hôm nay: ${task}`, { exact: true })).toBeVisible();
    await expect(dialog.getByText(/đề nghị thu chi và \d+ đơn từ chờ duyệt/)).toBeVisible();
    await expect(dialog.getByText(/Nhân viên đang có/)).toContainText(assignee);

    await dialog.getByRole('button', { name: 'Đã xem' }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole('button', { name: 'Mở menu' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Công việc', exact: true }).click();
    await expect(dialog).toBeHidden();

    for (const visibilityState of ['hidden', 'visible']) {
      await page.evaluate(state => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
        document.dispatchEvent(new Event('visibilitychange'));
      }, visibilityState);
    }
    await expect(dialog.getByText(`Đến hạn hôm nay: ${task}`, { exact: true })).toBeVisible();
  } finally {
    await Promise.all(fixtures.map(([path]) => request.delete(`${base}/${path}`, { headers })));
  }
});
