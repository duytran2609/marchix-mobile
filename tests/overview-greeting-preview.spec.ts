import { test } from './helpers/startupReminder';
import { devices, expect } from '@playwright/test';

test.use({ ...devices['iPhone 13'], defaultBrowserType: 'chromium' });

test('Tổng quan chào theo tên, cập nhật trực tiếp và không tràn màn hình', async ({ page, request }) => {
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
    await expect(page.getByRole('heading', { name: 'Xin chào, Quản trị demo!', exact: true })).toBeVisible();
    const longName = 'Nguyễn Thị Hoàng Anh Minh Châu';
    await setName({ stringValue: longName });
    const greeting = page.getByRole('heading', { name: `Xin chào, ${longName}!`, exact: true });
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(greeting).toBeVisible();
      await expect(greeting).toHaveCSS('font-weight', '400');
      const highlightedName = greeting.getByText(longName, { exact: true });
      await expect(highlightedName).toHaveCSS('color', 'rgb(96, 65, 189)');
      await expect(highlightedName).toHaveCSS('font-weight', '700');
      const bounds = await greeting.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      const card = await page.getByRole('heading', { name: 'Dòng tiền thực tế', exact: true }).boundingBox();
      expect(card!.y).toBeGreaterThan(bounds!.y + bounds!.height);
    }
    await setName({ stringValue: '' });
    await expect(page.getByRole('heading', { name: 'Xin chào!', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Mở menu', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Công việc', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Xin chào!', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Mở menu', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Tổng quan', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Xin chào!', exact: true })).toBeVisible();
  } finally {
    await setName(originalName);
  }
});
