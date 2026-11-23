import { devices, expect, type Page } from '@playwright/test';
import { acknowledgeStartupReminder, test } from './helpers/startupReminder';

const previewUrl = process.env.MARCHIX_PREVIEW_URL ?? 'http://localhost:8081';
const host = process.env.EXPO_PUBLIC_EMULATOR_HOST || '127.0.0.1';
const port = process.env.EXPO_PUBLIC_FIRESTORE_EMULATOR_PORT || 8080;
const documents = `http://${host}:${port}/v1/projects/demo-marchix-mobile/databases/(default)/documents`;
const headers = { Authorization: 'Bearer owner' };
const reviewerEmail = 'nguoigiao@example.test';
const profileUrl = `${documents}/members/${reviewerEmail}`;
const reviewerName = 'Người giao việc demo';
const mobile = devices['iPhone 13'];

test.use({ ...mobile, defaultBrowserType: 'chromium', actionTimeout: 10_000 });
test.setTimeout(90_000);

async function login(page: Page, label: string) {
  await page.goto(previewUrl);
  await page.getByRole('button', { name: label, exact: true }).click();
}

async function openSection(page: Page, name: string) {
  const option = page.getByRole('dialog').getByRole('button', { name, exact: true });
  await expect(async () => {
    if (!await option.isVisible()) await page.getByRole('button', { name: 'Mở menu' }).click({ timeout: 2_000 });
    await option.click({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
}

async function setGrant(admin: Page, grant: string, enabled: boolean) {
  await admin.getByText(reviewerName, { exact: true }).click();
  const form = admin.getByRole('dialog', { name: 'Chỉnh sửa tài khoản' });
  const toggle = form.getByRole('switch', { name: grant, exact: true });
  await expect(toggle).toBeVisible();
  if (await toggle.getAttribute('aria-checked') !== String(enabled)) await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', String(enabled));
  await form.getByRole('button', { name: 'Lưu cài đặt' }).click();
  await expect(form).toBeHidden();
}

test('Người giao việc có thể nhận việc để duyệt sau khi được cấp quyền và chỉ định lại sau khi bị thu hồi', async ({ page, browser, request }) => {
  const admin = await browser.newPage(mobile);
  await acknowledgeStartupReminder(admin);
  const profile = await request.get(profileUrl, { headers });
  expect(profile.ok()).toBe(true);
  const original = await profile.json();
  const id = `permission-review-${Date.now()}`;
  const taskUrl = `${documents}/tasks/${id}`;
  const title = `Kiểm thử chỉ định người duyệt ${id}`;
  const doneAt = new Date().toISOString();
  const taskFields = {
    title: { stringValue: title }, status: { stringValue: 'Chờ duyệt' },
    assignedBy: { stringValue: reviewerEmail }, assigneeEmail: { stringValue: 'nhanvien@example.test' },
    progress: { integerValue: '100' }, doneAt: { stringValue: doneAt },
  };
  try {
    expect((await request.patch(taskUrl, { headers, data: { fields: taskFields } })).ok()).toBe(true);
    await login(admin, 'Đăng nhập quản trị (mô phỏng)');
    await openSection(admin, 'Cài đặt');
    await admin.getByRole('tab', { name: 'Tài khoản', exact: true }).click();
    const needsReviewer = page.getByRole('button', { name: `Xem công việc: ${title}`, exact: true });
    const ready = page.getByRole('button', { name: `Duyệt công việc: ${title}`, exact: true });
    await setGrant(admin, 'Duyệt công việc', true);
    const granted = await (await request.get(profileUrl, { headers })).json();
    expect(granted.fields.grants.arrayValue.values).toContainEqual({ stringValue: 'taskReview' });
    await login(page, 'Đăng nhập người giao việc (mô phỏng)');
    await openSection(page, 'Phê duyệt');
    await expect(needsReviewer).toBeVisible();
    await expect(ready).toHaveCount(0);
    await appoint(page, needsReviewer, reviewerName);
    const selfAssigned = await (await request.get(taskUrl, { headers })).json();
    expect(selfAssigned.fields).toMatchObject({ ...taskFields, approverEmail: { stringValue: reviewerEmail } });
    await expect(ready).toBeVisible();
    await ready.click();
    await expect(page.getByRole('dialog', { name: 'Chi tiết phê duyệt công việc' })
      .getByRole('button', { name: 'Duyệt', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Đóng chi tiết phê duyệt' }).click();
    await setGrant(admin, 'Duyệt công việc', false);
    await expect(ready).toHaveCount(0);
    await expect(needsReviewer).toBeVisible({ timeout: 15_000 });
    await appoint(page, needsReviewer, 'Quản trị demo');
    await expect(needsReviewer).toHaveCount(0);
    const saved = await (await request.get(taskUrl, { headers })).json();
    expect(saved.fields).toMatchObject({ ...taskFields, approverEmail: { stringValue: 'quantri@example.test' } });
  } finally {
    await request.patch(profileUrl, { headers, data: { fields: original.fields } });
    await request.delete(taskUrl, { headers });
    await admin.close();
  }
});

async function appoint(page: Page, card: ReturnType<Page['getByRole']>, name: string) {
  await card.click();
  await page.getByRole('button', { name: 'Chỉ định người duyệt', exact: true }).click();
  await page.getByRole('button', { name: 'Chỉnh sửa', exact: true }).click();
  await page.getByText('Tùy chọn', { exact: true }).click();
  await page.getByRole('button', { name: /^Người duyệt:/ }).click();
  await page.getByRole('dialog', { name: 'Người duyệt', exact: true }).getByRole('checkbox', { name, exact: true }).click();
  await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Chỉnh sửa công việc' })).toBeHidden();
  await openSection(page, 'Phê duyệt');
}

test('Thu hồi quyền duyệt đơn từ cập nhật danh sách người duyệt đang mở', async ({ page, browser, request }) => {
  const admin = await browser.newPage(mobile);
  await acknowledgeStartupReminder(admin);
  const profile = await request.get(profileUrl, { headers });
  expect(profile.ok()).toBe(true);
  const original = await profile.json();
  try {
    await login(admin, 'Đăng nhập quản trị (mô phỏng)');
    await openSection(admin, 'Cài đặt');
    await admin.getByRole('tab', { name: 'Tài khoản', exact: true }).click();
    await setGrant(admin, 'Duyệt đơn từ', true);
    await login(page, 'Đăng nhập bằng Google');
    await openSection(page, 'Đơn từ');
    await page.getByRole('button', { name: '+ Tạo đơn', exact: true }).click();
    await page.getByRole('button', { name: /^Người duyệt:/ }).click();
    const picker = page.getByRole('dialog', { name: 'Người duyệt', exact: true });
    const option = picker.getByRole('checkbox', { name: reviewerName, exact: true });
    await expect(option).toBeVisible();
    await setGrant(admin, 'Duyệt đơn từ', false);
    await expect(option).toHaveCount(0, { timeout: 15_000 });
    await expect(picker).toBeVisible();
    await setGrant(admin, 'Duyệt đơn từ', true);
    await expect(option).toBeVisible({ timeout: 15_000 });
  } finally {
    await request.patch(profileUrl, { headers, data: { fields: original.fields } });
    await admin.close();
  }
});
