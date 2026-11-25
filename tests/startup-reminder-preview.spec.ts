import { devices, expect, test } from '@playwright/test';
import { shiftDay, todayInVietnam } from '../src/features/tasks/taskDates';

test.use({ ...devices['iPhone 13'], defaultBrowserType: 'chromium' });

test('Nhắc việc một lần mỗi lần đăng nhập, kể cả khi mở lại app giữa hai lần đăng nhập', async ({ page, request }) => {
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
  const signIn = page.getByRole('button', { name: 'Đăng nhập quản trị (mô phỏng)' });

  try {
    for (const [path, fields] of fixtures) {
      const response = await request.patch(`${base}/${path}`, { headers, data: {
        fields: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, { stringValue: value }])),
      } });
      expect(response.ok()).toBe(true);
    }
    await page.goto(process.env.MARCHIX_PREVIEW_URL ?? 'http://localhost:8081');
    await signIn.click();
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
    await expect(dialog).toBeHidden();

    await page.reload();
    await expect(page.getByRole('button', { name: /^Cần quyết định \(\d+\)$/ })).toBeVisible();
    await expect(dialog).toBeHidden();

    await page.getByRole('button', { name: 'Mở menu' }).click();
    await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
    await page.getByRole('alertdialog', { name: 'Xác nhận đăng xuất' })
      .getByRole('button', { name: 'Đăng xuất', exact: true }).click();
    await signIn.click();
    await expect(dialog.getByText(`Đến hạn hôm nay: ${task}`, { exact: true })).toBeVisible();
  } finally {
    await Promise.all(fixtures.map(([path]) => request.delete(`${base}/${path}`, { headers })));
  }
});

test('Nhắc chấm công và ghi giờ vào trực tiếp từ popup đăng nhập', async ({ page, request }) => {
  const today = todayInVietnam();
  const email = 'nhanvien@example.test';
  const host = process.env.EXPO_PUBLIC_EMULATOR_HOST || '127.0.0.1';
  const port = process.env.EXPO_PUBLIC_FIRESTORE_EMULATOR_PORT || 8080;
  const base = `http://${host}:${port}/v1/projects/demo-marchix-mobile/databases/(default)/documents`;
  const headers = { Authorization: 'Bearer owner' };
  const record = `${base}/attendance/${email}_${today}`;
  const settings = `${base}/settings/work`;
  const task = `${base}/tasks/startup-attendance-${Date.now()}`;
  const taskTitle = 'Việc đến hạn để kiểm tra popup chấm công';
  const dialog = page.getByRole('dialog', { name: /cần chú ý hôm nay/ });
  const checkIn = dialog.getByRole('button', { name: 'Chấm công', exact: true });
  const signIn = page.getByRole('button', { name: 'Đăng nhập bằng Google', exact: true });

  async function readFields(path: string) {
    const response = await request.get(path, { headers });
    if (response.status() === 404) return null;
    expect(response.ok()).toBe(true);
    return (await response.json()).fields as Record<string, { timestampValue?: string }>;
  }

  async function writeFields(path: string, fields: Record<string, unknown>) {
    const response = await request.patch(path, { headers, data: { fields } });
    expect(response.ok()).toBe(true);
  }

  const savedRecord = await readFields(record);
  const savedSettings = await readFields(settings);
  try {
    if (savedRecord) await request.delete(record, { headers });
    await writeFields(settings, { ...savedSettings, gpsOn: { booleanValue: false } });
    await writeFields(task, {
      title: { stringValue: taskTitle },
      status: { stringValue: 'Đang làm' },
      due: { stringValue: today },
      assigneeEmail: { stringValue: email },
    });

    await page.goto(process.env.MARCHIX_PREVIEW_URL ?? 'http://localhost:8081');
    await signIn.click();
    await expect(dialog.getByText('Bạn chưa chấm công vào hôm nay.', { exact: true })).toBeVisible();
    await checkIn.click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Chấm công', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Chấm công ra', exact: true })).toBeVisible();
    await expect.poll(async () => (await readFields(record))?.inTs?.timestampValue).toBeTruthy();
    const checkedIn = await readFields(record);
    expect(checkedIn?.outTs).toBeUndefined();

    await page.getByRole('button', { name: 'Mở menu' }).click();
    await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
    await page.getByRole('alertdialog', { name: 'Xác nhận đăng xuất' })
      .getByRole('button', { name: 'Đăng xuất', exact: true }).click();
    await signIn.click();
    await expect(dialog.getByText(`Đến hạn hôm nay: ${taskTitle}`, { exact: true })).toBeVisible();
    await expect(checkIn).toBeHidden();
    expect(await readFields(record)).toEqual(checkedIn);
  } finally {
    await Promise.all([
      savedRecord ? writeFields(record, savedRecord) : request.delete(record, { headers }),
      savedSettings ? writeFields(settings, savedSettings) : request.delete(settings, { headers }),
      request.delete(task, { headers }),
    ]);
  }
});
