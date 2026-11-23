import { test } from './helpers/startupReminder';
import { devices, expect } from '@playwright/test';

test.use({ ...devices['iPhone 13'], defaultBrowserType: 'chromium' });

const previewUrl = process.env.MARCHIX_PREVIEW_URL ?? 'http://localhost:8081';

test('Thanh điều hướng dưới chỉ ghim tối đa ba tab và nhớ sau khi tải lại', async ({ page }) => {
  await page.goto(previewUrl);
  await page.getByRole('button', { name: 'Đăng nhập bằng Google', exact: true }).click();

  const nav = page.getByRole('navigation', { name: 'Điều hướng dưới' });
  const tabs = nav.getByRole('button');
  await expect(tabs).toHaveCount(1);
  await expect(tabs.first()).toHaveAccessibleName('Tổng quan');

  const drawer = page.getByRole('dialog');
  const entry = (label: string) => drawer.getByRole('button', { name: label, exact: true });
  const openMenu = () => page.getByRole('button', { name: 'Mở menu', exact: true }).click();
  const hold = (label: string) => entry(label).click({ delay: 650 });
  await openMenu();
  for (const label of ['Công việc', 'Chấm công', 'KPI']) {
    await hold(label);
    await expect(entry(label).locator('img[src*="pin.png"]')).toHaveCount(1);
  }
  await hold('Thu chi');
  await expect(drawer.getByText(/Chỉ ghim được tối đa 3 tab/)).toBeVisible();
  await expect(entry('Thu chi').locator('img[src*="pin.png"]')).toHaveCount(0);
  await entry('Đóng menu').click();
  await expect(tabs).toHaveCount(4);

  await nav.getByRole('button', { name: 'Công việc', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'CÔNG VIỆC', exact: true })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Công việc', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.reload();
  await expect(tabs).toHaveCount(4);
  await expect(nav.getByRole('button', { name: 'KPI', exact: true })).toBeVisible();

  await openMenu();
  await hold('KPI');
  await expect(entry('KPI').locator('img[src*="pin.png"]')).toHaveCount(0);
  await hold('Thu chi');
  await expect(entry('Thu chi').locator('img[src*="pin.png"]')).toHaveCount(1);
  await entry('Đóng menu').click();
  await expect(tabs).toHaveCount(4);
  await expect(nav.getByRole('button', { name: 'KPI', exact: true })).toHaveCount(0);
  await expect(nav.getByRole('button', { name: 'Thu chi', exact: true })).toBeVisible();
});

test('Cảnh báo mất kết nối tự ẩn khi có mạng trở lại', async ({ page, context }) => {
  await page.goto(previewUrl);
  await page.getByRole('button', { name: 'Đăng nhập bằng Google', exact: true }).waitFor();
  const banner = page.getByRole('alert').filter({ hasText: 'Không có kết nối Internet' });
  await expect(banner).toHaveCount(0);
  await context.setOffline(true);
  try {
    await expect(banner).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
  await expect(banner).toHaveCount(0);
});
