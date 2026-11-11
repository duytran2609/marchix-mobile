import { devices, expect, test, type Page } from '@playwright/test';
import { todayInVietnam } from '../src/features/tasks/taskDates';

test.use({ ...devices['iPhone 13'], defaultBrowserType: 'chromium' });

test('Tổng quan khớp các trang nguồn và tự cập nhật khi lưu', async ({ page, browser, request }) => {
  test.setTimeout(120_000);
  const id = `overview-live-${Date.now()}`;
  const host = process.env.EXPO_PUBLIC_EMULATOR_HOST || '127.0.0.1';
  const port = process.env.EXPO_PUBLIC_FIRESTORE_EMULATOR_PORT || 8080;
  const base = `http://${host}:${port}/v1/projects/demo-marchix-mobile/databases/(default)/documents`;
  const headers = { Authorization: 'Bearer owner' };
  const admin = 'quantri@example.test';
  const staff = 'nhanvien@example.test';
  const day = todayInVietnam();
  const project = `Dự án ${id}`;
  const task = `Công việc ${id}`;
  const cash = `Khoản chi ${id}`;
  const amount = 170001;
  const fixtures = [
    [`projects/${id}`, { name: project, status: 'Đang chạy' }],
    [`tasks/${id}`, { title: task, projectId: id, assigneeEmail: admin, assignedBy: staff, status: 'Vướng', progress: 25 }],
    [`cash/${id}`, { note: cash, type: 'chi', method: 'Chuyển khoản', amount, date: day, dueDate: day, status: 'Chờ chi',
      createdBy: staff, approverEmail: 'nguoigiao@example.test', approvedBy: 'nguoigiao@example.test' }],
  ] as const;
  const source = await browser.newPage({ ...devices['iPhone 13'] });
  const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });
  const numberFrom = (text: string) => Number(text.replace(/\D/g, ''));
  const button = (target: Page, name: string | RegExp) => target.getByRole('button', { name, exact: typeof name === 'string' });

  async function login(target: Page) {
    await target.goto(process.env.MARCHIX_PREVIEW_URL ?? 'http://localhost:8081');
    await button(target, 'Đăng nhập quản trị (mô phỏng)').click();
    await expect(target.getByRole('heading', { name: 'Tổng quan', exact: true })).toBeVisible();
  }
  async function navigate(target: Page, name: string) {
    await button(target, 'Mở menu').click();
    await target.getByRole('dialog').getByRole('button', { name, exact: true }).click();
  }

  try {
    for (const [path, record] of fixtures) {
      const fields = Object.fromEntries(Object.entries(record).map(([key, value]) => [key,
        typeof value === 'number' ? { integerValue: String(value) } : { stringValue: value }]));
      expect((await request.patch(`${base}/${path}`, { headers, data: { fields } })).ok()).toBe(true);
    }
    await Promise.all([login(page), login(source)]);

    await navigate(source, 'Công việc');
    const open = await source.getByLabel(/^Chưa xong: \d+ công việc$/).getAttribute('aria-label');
    const pending = await source.getByLabel(/^Chờ duyệt: \d+ công việc$/).getAttribute('aria-label');
    await expect(page.getByLabel(`${numberFrom(open ?? '') + numberFrom(pending ?? '')} việc đang mở`)).toBeVisible();
    const blocked = button(page, /^Đang vướng \d+$/);
    const blockedBefore = numberFrom(await blocked.innerText());
    await blocked.click();
    await expect(button(page, new RegExp(task))).toBeVisible();
    const projectRow = button(page, new RegExp(project));
    await expect(projectRow).toContainText('25%');

    await button(source, `Mở công việc: ${task}`).click();
    await source.getByRole('radio', { name: 'Đang làm', exact: true }).click();
    await source.getByLabel('Tiến độ (%)').fill('65');
    await button(source, 'Lưu tiến độ').click();
    await expect(button(page, `Đang vướng ${blockedBefore - 1}`)).toBeVisible();
    await expect(button(page, new RegExp(task))).toHaveCount(0);
    await expect(projectRow).toContainText('65%');
    await navigate(source, 'Dự án');
    await button(source, project).click();
    await expect(source.getByText('Tiến độ việc tôi được xem', { exact: true }).locator('..')).toContainText('65%');
    const renamedProject = `Dự án đã cập nhật ${id}`;
    const projectEdit = await request.patch(`${base}/projects/${id}?updateMask.fieldPaths=name`, {
      headers, data: { fields: { name: { stringValue: renamedProject } } },
    });
    expect(projectEdit.ok()).toBe(true);
    await expect(button(page, new RegExp(renamedProject))).toContainText('65%');
    await expect(source.getByRole('heading', { name: renamedProject, exact: true })).toBeVisible();

    await navigate(source, 'Thu chi');
    const cashTotal = source.getByText('Đã chi', { exact: true }).locator('..').and(source.locator('div'));
    await expect(cashTotal).toBeVisible();
    const spentBefore = numberFrom(await cashTotal.innerText());
    const payable = page.getByText('Phải chi', { exact: true }).locator('..');
    await expect(payable).toBeVisible();
    const dueBefore = numberFrom(await payable.innerText());
    expect(dueBefore).toBeGreaterThanOrEqual(amount);
    await button(source, new RegExp(cash)).click();
    await expect(source.getByText('Chờ chi', { exact: true })).toBeVisible();
    await source.getByRole('textbox', { name: 'Mã chứng từ hoặc tham chiếu giao dịch' }).fill(id);
    await button(source, 'Xác nhận đã chi').click();
    await button(source, 'Xác nhận giao dịch đã hoàn tất').click();
    await expect(source.getByText('Đã chi', { exact: true })).toBeVisible();
    const expectedSpent = money.format(spentBefore + amount);
    await expect(page.getByText(`Đã chi ${expectedSpent}`, { exact: true })).toBeVisible();
    await expect(payable.getByText(money.format(dueBefore - amount), { exact: true })).toBeVisible();
    await button(source, 'Về sổ thu chi').click();
    await expect(cashTotal).toContainText(expectedSpent);
  } finally {
    await Promise.all([source.close(), ...fixtures.map(([path]) => request.delete(`${base}/${path}`, { headers }))]);
  }
});
