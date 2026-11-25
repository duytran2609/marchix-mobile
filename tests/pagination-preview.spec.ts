import { test } from './helpers/startupReminder';
import { devices, expect } from '@playwright/test';

test.use({ ...devices['iPhone 13'], defaultBrowserType: 'chromium' });

test('Sổ thu chi chuyển trang, đổi số dòng và đặt lại trang khi lọc', async ({ page, request }) => {
  const host = process.env.EXPO_PUBLIC_EMULATOR_HOST || '127.0.0.1';
  const port = process.env.EXPO_PUBLIC_FIRESTORE_EMULATOR_PORT || 8080;
  const ledger = `http://${host}:${port}/v1/projects/demo-marchix-mobile/databases/(default)/documents/cash`;
  const headers = { Authorization: 'Bearer owner' };
  const prefix = `pagination-${Date.now()}`;
  const ids = Array.from({ length: 12 }, (_, index) => `${prefix}-${index + 1}`);
  const button = (name: string) => page.getByRole('button', { name, exact: true });
  const entries = page.getByRole('button', { name: new RegExp(prefix) });

  try {
    const saved = await Promise.all(ids.map((id, i) => request.patch(`${ledger}/${id}`, {
      headers,
      data: { fields: {
        date: { stringValue: `2099-12-${String(i + 1).padStart(2, '0')}` },
        type: { stringValue: i === 0 ? 'chi' : 'thu' },
        note: { stringValue: id },
        amount: { integerValue: '10000' },
      } },
    })));
    expect(saved.every(response => response.ok())).toBe(true);

    await page.goto(process.env.MARCHIX_PREVIEW_URL ?? 'http://localhost:8081');
    await button('Đăng nhập quản trị (mô phỏng)').click();
    await button('Mở menu').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Thu chi', exact: true }).click();
    await page.getByRole('button', { name: /^Tháng:/ }).click();
    await page.getByRole('radio', { name: '12/2099', exact: true }).click();
    const previous = button('Trang trước');
    const next = button('Trang sau');
    await expect(previous).toBeDisabled();
    await expect(page.getByText('Trang 1 / 3', { exact: true })).toBeVisible();
    await expect(entries).toHaveCount(5);
    await next.click();
    await expect(page.getByText('Trang 2 / 3', { exact: true })).toBeVisible();
    await expect(entries).toHaveCount(5);
    await next.click();
    await expect(page.getByText('Trang 3 / 3', { exact: true })).toBeVisible();
    await expect(entries).toHaveCount(2);
    await expect(next).toBeDisabled();

    const pageSize = button('Số dòng mỗi trang: 5 dòng');
    const nextSection = page.getByText('Đã chi theo hạng mục', { exact: true });
    await pageSize.evaluate(element => element.scrollIntoView({ block: 'end' }));
    const beforeOpening = await pageSize.boundingBox();
    const sectionBefore = await nextSection.boundingBox();
    await pageSize.click();
    const options = page.getByRole('radiogroup', { name: 'Số dòng mỗi trang' });
    await expect(options).toBeVisible();
    const triggerBounds = await page.getByRole('button', { name: 'Số dòng mỗi trang: 5 dòng', exact: true, includeHidden: true }).boundingBox();
    const optionBounds = await options.getByRole('radio', { name: '5 dòng', exact: true }).boundingBox();
    const sectionAfter = await nextSection.boundingBox();
    expect(triggerBounds!.y).toBeLessThan(beforeOpening!.y);
    expect(sectionAfter!.y - triggerBounds!.y).toBeCloseTo(sectionBefore!.y - beforeOpening!.y, 0);
    expect(optionBounds!.y - (triggerBounds!.y + triggerBounds!.height)).toBeGreaterThan(0);
    expect(optionBounds!.y - (triggerBounds!.y + triggerBounds!.height)).toBeLessThan(12);
    await expect(options.getByRole('radio', { name: '100 dòng', exact: true })).toBeInViewport();
    await expect(page.getByText('5 dòng', { exact: true })).toHaveCount(2);

    await page.keyboard.press('Escape');
    await expect(options).toBeHidden();
    await pageSize.click();
    await expect(options).toBeVisible();
    await expect(options.getByRole('radio', { name: '100 dòng', exact: true })).toBeInViewport();
    const openTrigger = page.getByRole('button', { name: 'Số dòng mỗi trang: 5 dòng', exact: true, includeHidden: true });
    // Simulate a scroll update arriving after the menu has opened, as can happen on Android.
    await openTrigger.evaluate(element => {
      let scroller = element.parentElement;
      while (scroller && scroller.scrollTop < 24) scroller = scroller.parentElement;
      if (!scroller) throw new Error('Expected a scrolled list');
      scroller.scrollTop -= 24;
    });
    await expect.poll(async () => {
      const [trigger, option] = await Promise.all([
        openTrigger.boundingBox(),
        options.getByRole('radio', { name: '5 dòng', exact: true }).boundingBox(),
      ]);
      const gap = trigger && option ? option.y - (trigger.y + trigger.height) : 0;
      return gap > 0 && gap < 12;
    }).toBe(true);
    await options.getByRole('radio', { name: '10 dòng', exact: true }).click();
    await expect(page.getByText('Trang 1 / 2', { exact: true })).toBeVisible();
    await expect(entries).toHaveCount(10);

    await next.click();
    await button('Số dòng mỗi trang: 10 dòng').click();
    await page.getByRole('radio', { name: '25 dòng', exact: true }).click();
    await expect(page.getByText('Trang 1 / 1', { exact: true })).toBeVisible();
    await expect(entries).toHaveCount(12);

    await button('Số dòng mỗi trang: 25 dòng').click();
    await page.getByRole('radio', { name: '10 dòng', exact: true }).click();
    await next.click();
    await button('Loại: Thu và chi').click();
    await page.getByRole('radio', { name: 'Chỉ khoản thu', exact: true }).click();
    await expect(page.getByText('Trang 1 / 2', { exact: true })).toBeVisible();
    await expect(entries).toHaveCount(10);
    await next.click();
    await expect(entries).toHaveCount(1);
    expect((await request.delete(`${ledger}/${ids[1]}`, { headers })).ok()).toBe(true);
    await expect(page.getByText('Trang 1 / 1', { exact: true })).toBeVisible();
    await expect(entries).toHaveCount(10);
  } finally {
    await Promise.all(ids.map(id => request.delete(`${ledger}/${id}`, { headers })));
  }
});
