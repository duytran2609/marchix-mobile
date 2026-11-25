import { devices, expect } from '@playwright/test';
import { test } from './helpers/startupReminder';
import { shiftDay, todayInVietnam } from '../src/features/tasks/taskDates';

test.use({ ...devices['iPhone 13'], defaultBrowserType: 'chromium' });

test('Việc hàng ngày tự cập nhật từ chấm công, thông báo và các khoản cần xử lý', async ({ page, request }) => {
  const host = process.env.EXPO_PUBLIC_EMULATOR_HOST || '127.0.0.1';
  const port = process.env.EXPO_PUBLIC_FIRESTORE_EMULATOR_PORT || 8080;
  const base = `http://${host}:${port}/v1/projects/demo-marchix-mobile/databases/(default)/documents`;
  const headers = { Authorization: 'Bearer owner' };
  const day = todayInVietnam();
  const tomorrow = shiftDay(day, 1);
  const email = 'quantri@example.test';
  const colleague = 'nguoigiao@example.test';
  const other = 'nhanvien@example.test';
  const id = `daily-${Date.now()}`;
  const attendance = `attendance/${email}_${day}`;
  const requestPath = `requests/${id}`;
  const cashPath = `cash/${id}`;
  const notePath = `notifications/${id}`;
  const settings = 'settings/work';
  const initialSettings = await request.get(`${base}/${settings}`, { headers });
  const initialOverrides = initialSettings.ok() ? (await initialSettings.json()).fields?.dayOverrides : undefined;
  const initialAttendance = await request.get(`${base}/${attendance}`, { headers });
  const previousAttendance = initialAttendance.ok() ? (await initialAttendance.json()).fields : undefined;
  const stringify = (value: string) => ({ stringValue: value });
  async function update(path: string, fields: Record<string, object>) {
    const mask = new URLSearchParams(Object.keys(fields).map(key => ['updateMask.fieldPaths', key]));
    const result = await request.patch(`${base}/${path}?${mask}`, { headers, data: { fields } });
    expect(result.ok(), await result.text()).toBe(true);
  }

  try {
    if (previousAttendance) await request.delete(`${base}/${attendance}`, { headers });
    await update(settings, { dayOverrides: { mapValue: { fields: {
      ...initialOverrides?.mapValue?.fields, [day]: { integerValue: '1' }, [tomorrow]: { integerValue: '1' },
    } } } });
    await update(requestPath, { type: stringify('Nghỉ phép'), reason: stringify('Xin nghỉ phép'),
      from: stringify(day), to: stringify(day), status: stringify('Chờ duyệt'),
      createdBy: stringify(other), approverEmail: stringify(email) });
    const cashFields = { type: stringify('chi'), status: stringify('Chờ chi'), amount: { integerValue: '200000' },
      date: stringify(day), dueDate: stringify(day), createdBy: stringify(other), approvedBy: stringify(colleague) };
    await update(cashPath, { ...cashFields, projectId: stringify('') });
    await update(`${cashPath}-project`, { ...cashFields, projectId: stringify('marchix-mobile-demo') });
    const noteFields = { read: { booleanValue: false }, to: stringify(email), from: stringify(other),
      createdAt: stringify(new Date().toISOString()) };
    await update(notePath, { ...noteFields, title: stringify('Thông báo chấm công'), link: stringify('#cham-cong') });
    await update(`${notePath}-task`, { ...noteFields, title: stringify('Bạn được giao việc mới'),
      link: stringify('#cong-viec'), taskId: stringify('cap-nhat-huong-dan') });
    await update(`${notePath}-project-cash`, { ...noteFields, title: stringify('Thu chi dự án chờ xử lý'),
      link: stringify(`#thu-chi/${id}-project`) });

    await page.clock.install({ time: Date.parse(`${day}T12:00:00+07:00`) });
    await page.goto(process.env.MARCHIX_PREVIEW_URL ?? 'http://localhost:8081');
    await page.getByRole('button', { name: 'Đăng nhập quản trị (mô phỏng)', exact: true }).click();
    const card = page.getByRole('heading', { name: 'Công việc hàng ngày', exact: true }).locator('..');
    const item = (title: string, complete: boolean) =>
      card.getByRole('button', { name: new RegExp(`^${title}\\. ${complete ? 'Đã' : 'Chưa'} hoàn thành`) });
    await expect(card.getByRole('textbox')).toHaveCount(0);
    await expect(card.getByText('Hôm nay đã hoàn thành 0/5 việc')).toBeVisible();
    await expect(card.getByText('Còn 1 thông báo chưa đọc ở chuông Thông báo')).toBeVisible();
    await expect(card.getByText('Còn 1 khoản cần xử lý')).toBeVisible();

    await update(attendance, { email: stringify(email), name: stringify('Quản trị demo'),
      date: stringify(day), inTs: { timestampValue: `${day}T01:00:00Z` } });
    await expect(item('Chấm công vào', true)).toContainText('✓');
    await expect(item('Chấm công ra', false)).toBeVisible();
    await update(attendance, { outTs: { timestampValue: `${day}T10:30:00Z` } });
    await expect(item('Chấm công ra', true)).toContainText('✓');

    await update(notePath, { read: { booleanValue: true } });
    await expect(card.getByLabel(/^Đọc thông báo vận hành\. Đã hoàn thành/)).toContainText('✓');
    await update(requestPath, { status: stringify('Đã duyệt') });
    await expect(item('Xử lý đơn từ chờ duyệt', true)).toContainText('✓');
    await update(cashPath, { status: stringify('Đã chi') });
    await expect(item('Xử lý thu chi cần duyệt hoặc đến hạn', true)).toContainText('✓');
    await expect(card.getByText('Hôm nay đã hoàn thành 5/5 việc')).toBeVisible();

    const midnight = Date.parse(`${tomorrow}T00:00:00+07:00`);
    await page.clock.fastForward(midnight + 1000 - await page.evaluate(() => Date.now()));
    await expect(item('Chấm công vào', false)).toBeVisible();
    await expect(item('Chấm công ra', false)).toBeVisible();

    await update(settings, { dayOverrides: { mapValue: { fields: { [tomorrow]: { integerValue: '0' } } } } });
    await expect(card.getByText('Chấm công vào', { exact: true })).toHaveCount(0);
    await expect(card.getByText('Chấm công ra', { exact: true })).toHaveCount(0);
  } finally {
    const fixtures = [attendance, requestPath, cashPath, `${cashPath}-project`, notePath, `${notePath}-task`,
      `${notePath}-project-cash`];
    await Promise.all(fixtures.map(path => request.delete(`${base}/${path}`, { headers })));
    if (previousAttendance) await update(attendance, previousAttendance);
    if (!initialSettings.ok()) await request.delete(`${base}/${settings}`, { headers });
    else {
      const restore = await request.patch(`${base}/${settings}?updateMask.fieldPaths=dayOverrides`, {
        headers, data: { fields: initialOverrides ? { dayOverrides: initialOverrides } : {} },
      });
      expect(restore.ok()).toBe(true);
    }
  }
});
