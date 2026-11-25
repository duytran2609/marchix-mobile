import { test } from './helpers/startupReminder';
import { devices, expect } from '@playwright/test';
import { shiftDay, todayInVietnam } from '../src/features/tasks/taskDates';

test.use({ ...devices['iPhone 13'], defaultBrowserType: 'chromium' });

test('Tổng quan đổi lời chào và cảnh nền đúng giờ Việt Nam, giữ tên vừa màn hình', async ({ page, request }) => {
  const today = todayInVietnam();
  const time = (day: string, hour: string) => Date.parse(`${day}T${hour}:00:00+07:00`);
  await page.clock.install({ time: time(today, '11') });
  async function moveTo(day: string, hour: string) {
    const now = await page.evaluate(() => Date.now());
    await page.clock.fastForward(time(day, hour) - now + 1000);
  }
  const host = process.env.EXPO_PUBLIC_EMULATOR_HOST || '127.0.0.1';
  const port = process.env.EXPO_PUBLIC_FIRESTORE_EMULATOR_PORT || 8080;
  const member = `http://${host}:${port}/v1/projects/demo-marchix-mobile/databases/(default)/documents/members/quantri@example.test`;
  const headers = { Authorization: 'Bearer owner' };
  const original = await request.get(member, { headers });
  expect(original.ok()).toBe(true);
  const originalName = (await original.json()).fields.name;
  async function setName(value: { stringValue: string }) {
    expect((await request.patch(`${member}?updateMask.fieldPaths=name`, { headers,
      data: { fields: { name: value } },
    })).ok()).toBe(true);
  }
  try {
    await page.goto(process.env.MARCHIX_PREVIEW_URL ?? 'http://localhost:8081');
    await page.getByRole('button', { name: 'Đăng nhập quản trị (mô phỏng)', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Chào buổi sáng, Quản trị demo!', exact: true })).toBeVisible();
    const longName = 'Nguyễn Thị Hoàng Anh Minh Châu';
    await setName({ stringValue: longName });
    const greeting = page.getByRole('heading', { name: `Chào buổi sáng, ${longName}!`, exact: true });
    const suggestion = greeting.locator('..').getByText('Chọn một việc quan trọng hôm nay và bắt đầu từ bước nhỏ nhất.', { exact: true });
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(greeting).toBeVisible();
      await expect(suggestion).toBeVisible();
      await expect(greeting).toHaveCSS('font-weight', '400');
      await expect(greeting.locator('..')).toHaveCSS('background-color', 'rgb(255, 241, 229)');
      const highlightedName = greeting.getByText(longName, { exact: true });
      await expect(highlightedName).toHaveCSS('color', 'rgb(135, 63, 38)');
      await expect(highlightedName).toHaveCSS('font-weight', '800');
      const bounds = await greeting.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      const suggestionBounds = (await suggestion.boundingBox())!;
      expect(suggestionBounds.x).toBeGreaterThanOrEqual(0);
      expect(suggestionBounds.x + suggestionBounds.width).toBeLessThanOrEqual(width);
      expect(suggestionBounds.y).toBeGreaterThan(bounds!.y + bounds!.height);
      const card = await page.getByRole('heading', { name: 'Dòng tiền thực tế', exact: true }).boundingBox();
      expect(card!.y).toBeGreaterThan(suggestionBounds.y + suggestionBounds.height);
    }
    await setName({ stringValue: '' });
    const morning = page.getByRole('heading', { name: 'Chào buổi sáng!', exact: true });
    await expect(morning).toBeVisible();
    await page.getByRole('button', { name: 'Mở menu', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Công việc', exact: true }).click();
    await expect(morning).toHaveCount(0);
    await page.getByRole('button', { name: 'Mở menu', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Tổng quan', exact: true }).click();
    await expect(morning).toBeVisible();
    await moveTo(today, '12');
    const afternoon = page.getByRole('heading', { name: 'Chào buổi chiều!', exact: true });
    await expect(afternoon).toBeVisible();
    await expect(afternoon.locator('..')).toHaveCSS('background-color', 'rgb(233, 246, 245)');
    await moveTo(today, '18');
    const evening = page.getByRole('heading', { name: 'Chào buổi tối!', exact: true });
    await expect(evening).toBeVisible();
    await expect(evening.locator('..')).toHaveCSS('background-color', 'rgb(34, 35, 65)');
    await moveTo(shiftDay(today, 1), '05');
    await expect(morning).toBeVisible();
  } finally {
    await setName(originalName);
  }
});
