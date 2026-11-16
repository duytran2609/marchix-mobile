import { test as base, expect, type Page } from '@playwright/test';

// A real sign-in may show the asynchronous reminder after the workspace renders.
// A locator handler acknowledges it through the UI before the next action instead
// of racing isVisible(), forcing clicks through the modal, or disabling the app.
export async function acknowledgeStartupReminder(page: Page) {
  const reminder = page.getByRole('dialog', { name: /cần chú ý hôm nay/ });
  await page.addLocatorHandler(reminder, async () => {
    await reminder.getByRole('button', { name: 'Đã xem', exact: true }).click();
    await expect(reminder).toBeHidden();
  });
}

export const test = base.extend({
  page: async ({ page }, use) => {
    await acknowledgeStartupReminder(page);
    await use(page);
  },
});
