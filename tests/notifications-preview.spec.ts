import { test } from './helpers/startupReminder';
import { devices, expect } from '@playwright/test';

test.use({ ...devices['iPhone 13'], defaultBrowserType: 'chromium' });

test('Chuông thông báo mở đúng công việc, đơn từ, thu chi và kỳ lương', async ({ page, request }) => {
  test.setTimeout(120_000);
  page.setDefaultTimeout(15_000);
  const host = process.env.EXPO_PUBLIC_EMULATOR_HOST || '127.0.0.1';
  const port = process.env.EXPO_PUBLIC_FIRESTORE_EMULATOR_PORT || 8080;
  const root = `http://${host}:${port}/v1/projects/demo-marchix-mobile/databases/(default)/documents`;
  const headers = { Authorization: 'Bearer owner' };
  const uid = 'inbox-' + Date.now();
  const staff = 'nhanvien@example.test';
  const now = new Date().toISOString();
  const paths: string[] = [];
  async function fixture(path: string, values: Record<string, string | number | boolean>) {
    paths.push(path);
    const fields = Object.fromEntries(Object.entries(values).map(([key, value]) => [key,
      typeof value === 'boolean' ? { booleanValue: value }
        : typeof value === 'number' ? { integerValue: String(value) } : { stringValue: value }]));
    const response = await request.patch(`${root}/${path}`, { headers, data: { fields } });
    expect(response.ok(), path).toBe(true);
  }
  async function note(name: string, title: string, link: string, target: Record<string, string> = {}) {
    await fixture(`notifications/${uid}-${name}`, { title, link, to: staff, body: '',
      from: 'quantri@example.test', createdAt: now, read: false, ...target });
  }
  async function openNote(title: string) {
    await page.getByRole('button', { name: /^Thông báo(?:,|$)/ }).click();
    await page.getByRole('button', { name: 'Chưa đọc: ' + title, exact: true }).click();
  }
  try {
    await fixture('requests/' + uid, { type: 'Nghỉ phép', status: 'Đã duyệt', createdBy: staff,
      reason: 'Nội dung đơn thử từ chuông', from: '2026-11-16', to: '2026-11-16', days: 1 });
    await fixture('cash/' + uid, { type: 'chi', status: 'Đã chi', createdBy: staff, amount: 10000,
      date: '2026-11-16', note: 'Chứng từ thử từ chuông' });
    await fixture('payroll/2026-07_' + uid, { month: '2026-07', email: staff, status: 'Đã chốt' });
    await Promise.all([
      note('task', 'Thông báo thử giao việc', '#cong-viec', { taskId: 'cap-nhat-huong-dan' }),
      note('request', 'Thông báo thử đơn từ', '#don-tu/' + uid),
      note('cash', 'Thông báo thử thu chi', '#thu-chi/' + uid),
      note('payroll', 'Thông báo thử phiếu lương', '#luong/2026-07'),
    ]);
    await page.goto(process.env.MARCHIX_PREVIEW_URL ?? 'http://localhost:8081', {
      timeout: 90_000, waitUntil: 'domcontentloaded',
    });
    await page.getByRole('button', { name: 'Đăng nhập Google (mô phỏng)', exact: true }).click();
    const reminder = page.getByRole('dialog', { name: /cần chú ý hôm nay/ });
    if (await reminder.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true, () => false)) {
      await reminder.getByRole('button', { name: 'Đã xem', exact: true }).click();
      await expect(reminder).toBeHidden();
    }

    await openNote('Thông báo thử giao việc');
    await expect(page.getByRole('heading', { name: 'Cập nhật hướng dẫn bàn giao', exact: true })).toBeVisible();
    await openNote('Thông báo thử đơn từ');
    await expect(page.getByRole('dialog', { name: 'Chi tiết đơn' })).toContainText('Nội dung đơn thử từ chuông');
    await page.getByRole('button', { name: 'Đóng đơn', exact: true }).click();
    await openNote('Thông báo thử thu chi');
    await expect(page.getByRole('heading', { name: 'Chứng từ thử từ chuông', exact: true })).toBeVisible();
    await openNote('Thông báo thử phiếu lương');
    await expect(page.getByRole('button', { name: 'Chọn tháng: 07/2026', exact: true })).toBeVisible();
    await expect(page.getByText('Tháng 07/2026', { exact: true })).toBeVisible();
  } finally {
    await Promise.all(paths.map(path => request.delete(`${root}/${path}`, { headers })));
  }
});
