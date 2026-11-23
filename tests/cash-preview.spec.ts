import { readFile } from 'node:fs/promises';
import { test, acknowledgeStartupReminder } from './helpers/startupReminder';
import { devices, expect, type Locator, type Page } from '@playwright/test';

test.use({ ...devices['iPhone 13'], defaultBrowserType: 'chromium' });

test('Thu chi: nhân viên lập khoản chi, người được giao duyệt, quản trị xác nhận', async ({ page, browser, request }) => {
  test.setTimeout(90_000);
  const url = process.env.MARCHIX_PREVIEW_URL ?? 'http://localhost:8081';
  const host = process.env.EXPO_PUBLIC_EMULATOR_HOST || '127.0.0.1';
  const port = process.env.EXPO_PUBLIC_FIRESTORE_EMULATOR_PORT || 8080;
  const firestore = `http://${host}:${port}/v1/projects/demo-marchix-mobile/databases/(default)/documents`;
  const headers = { Authorization: 'Bearer owner' };
  const note = 'Chi phí kiểm tra thu chi ' + Date.now();
  const admin = await browser.newPage({ ...devices['iPhone 13'] });
  await acknowledgeStartupReminder(admin);
  const reviewer = await browser.newPage({ ...devices['iPhone 13'] });
  await acknowledgeStartupReminder(reviewer);
  const button = (target: Page, name: string) => target.getByRole('button', { name, exact: true });
  const status = (target: Page | Locator, value: string) => target.getByText(value, { exact: true });
  async function expectValueStyle(value: Locator) {
    await expect(value).toHaveCSS('color', 'rgb(100, 90, 116)');
    await expect(value).toHaveCSS('font-weight', '500');
  }
  const pendingTotal = (target: Page) => status(target, 'Chi chờ duyệt').locator('..').getByText(/\d.*₫/);
  const entry = (target: Page) => target.getByRole('button', { name: new RegExp(note) });
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==', 'base64');
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj\n' +
    '2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj\n' +
    '3 0 obj <</Type /Page /Parent 2 0 R /MediaBox [0 0 100 100]>> endobj\ntrailer <</Root 1 0 R /Size 4>>\n%%EOF');
  async function attach(target: Page, ...names: string[]) {
    const chooser = target.waitForEvent('filechooser');
    await button(target, 'Đính kèm chứng từ').click();
    await (await chooser).setFiles(names.map(name => name.endsWith('.pdf')
      ? { name, mimeType: 'application/pdf', buffer: pdf } : { name, mimeType: 'image/png', buffer: image }));
    for (const name of names) await expect(button(target, 'Bỏ ' + name)).toBeVisible();
  }
  async function openCash(target: Page, account: string) {
    await target.goto(url);
    await button(target, account).click();
    await button(target, 'Mở menu').click();
    await target.getByRole('dialog').getByRole('button', { name: 'Thu chi', exact: true }).click();
    await expect(target.getByRole('heading', { name: 'Thu chi', exact: true })).toBeVisible();
    await expect(target.getByRole('heading', { name: /Sổ thu chi/ })).toBeVisible();
  }
  try {
    await openCash(page, 'Đăng nhập Google (mô phỏng)');
    async function expectSameRow(left: RegExp, right: RegExp, scope: Page | Locator = page) {
      const first = await scope.getByRole('button', { name: left }).boundingBox();
      const second = await scope.getByRole('button', { name: right }).boundingBox();
      expect(first && second && Math.abs(first.y - second.y) < 2 && first.x + first.width <= second.x).toBe(true);
    }
    await expectSameRow(/^Tháng:/, /^Dự án:/);
    await expectSameRow(/^Loại:/, /^Trạng thái:/);
    await expect(page.getByRole('heading', { name: 'Tổng quan' })).toBeVisible();
    for (const [label, background, color] of [
      ['Đã thu', 'rgb(221, 243, 237)', 'rgb(11, 97, 85)'],
      ['Đã chi', 'rgb(251, 232, 229)', 'rgb(158, 52, 43)'],
      ['Chi chờ duyệt', 'rgb(255, 240, 213)', 'rgb(135, 80, 9)'],
    ]) {
      const tile = status(page, label).locator('..');
      await expect(tile).toHaveCSS('background-color', background);
      await expect(tile.getByText(/\d.*₫/)).toHaveCSS('color', color);
    }
    await button(page, '+ Tạo đề nghị thu').click();
    const proposal = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Tạo đề nghị thu' }) });
    await expect(proposal).toBeVisible();
    await expect(proposal.getByText('Quản trị viên sẽ gán người duyệt.')).toBeVisible();
    await expect(proposal.getByRole('textbox', { name: 'Tìm người duyệt', exact: true })).toHaveCount(0);
    const amountField = page.getByRole('textbox', { name: 'Số tiền (VNĐ)' });
    await amountField.fill('12a3456');
    await expect(amountField).toHaveValue('123.456');
    const invoice = proposal.getByRole('textbox', { name: 'Số hóa đơn / báo giá', exact: true });
    await invoice.click();
    const keyboardTop = 300;
    await page.evaluate(height => {
      const viewport = window.visualViewport!;
      Object.defineProperty(viewport, 'height', { configurable: true, value: height });
      viewport.dispatchEvent(new Event('resize'));
    }, keyboardTop);
    await expect.poll(async () => {
      const bounds = await invoice.boundingBox();
      return bounds ? bounds.y + bounds.height : Infinity;
    }).toBeLessThanOrEqual(keyboardTop);
    await expect(invoice).toBeFocused();
    await invoice.pressSequentially('HD-123');
    await expect(invoice).toHaveValue('HD-123');
    await page.evaluate(() => {
      const viewport = window.visualViewport!;
      Reflect.deleteProperty(viewport, 'height');
      viewport.dispatchEvent(new Event('resize'));
    });
    await amountField.scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: /^Nhóm hạng mục:/ })).toHaveCount(0);
    await expectSameRow(/^Hạng mục:/, /^Dự án:/, proposal);
    const normalBackground = await button(page, 'Hạng mục: Chọn hạng mục').evaluate(element => getComputedStyle(element).backgroundColor);
    await button(page, 'Hạng mục: Chọn hạng mục').click();
    await page.getByRole('radio', { name: 'Thu khác', exact: true }).click();
    await expect(button(page, 'Hạng mục: Thu khác')).toBeVisible();
    await expect(button(page, 'Hạng mục: Thu khác')).toHaveCSS('background-color', normalBackground);
    await expectSameRow(/^Hình thức:/, /^Loại đối tượng:/);
    const transaction = page.getByRole('button', { name: /^Ngày giao dịch,/ });
    const currentDate = (await transaction.getAttribute('aria-label'))?.split(', ')[1] ?? '';
    expect(currentDate).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    const transactionDate = '01' + currentDate.slice(2);
    const paymentDate = '02' + currentDate.slice(2);
    await transaction.click();
    await button(page, 'Ngày ' + transactionDate).click();
    await expect(transaction).toHaveAccessibleName('Ngày giao dịch, ' + transactionDate);
    const payment = page.getByRole('button', { name: /^Hạn thanh toán,/ });
    await payment.click();
    await button(page, 'Ngày ' + paymentDate).click();
    await expect(payment).toHaveAccessibleName('Hạn thanh toán, ' + paymentDate);
    await payment.click();
    await button(page, 'Bỏ ngày').click();
    await expect(payment).toHaveAccessibleName('Hạn thanh toán, Chọn ngày');
    await button(page, 'Hủy').click();
    await expect(proposal).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Tổng quan' })).toBeVisible();
    await button(page, '+ Tạo đề nghị chi').click();
    const expense = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Tạo đề nghị chi' }) });
    await expect(expense).toBeVisible();
    await expect(amountField).toHaveValue('');
    const noteField = expense.getByRole('textbox', { name: 'Nội dung', exact: true });
    await noteField.fill(note);
    await expectValueStyle(noteField);
    await page.getByRole('textbox', { name: 'Số tiền (VNĐ)' }).fill('2500000');
    await expect(expense.getByText(/cần duyệt bằng văn bản trước khi chi/)).toBeVisible();
    await page.getByRole('button', { name: /^Nhóm hạng mục:/ }).click();
    await page.getByRole('radio', { name: 'Tài chính & khác', exact: true }).click();
    await page.getByRole('button', { name: /^Hạng mục:/ }).click();
    await page.getByRole('radio', { name: 'Chi khác', exact: true }).click();
    await expectValueStyle(status(expense.getByRole('button', { name: 'Hạng mục: Chi khác', exact: true }), 'Chi khác'));
    await attach(page, 'hoa-don.png', 'hoa-don.pdf');
    await button(page, 'Gửi khoản chi').click();
    await expect(page.getByRole('heading', { name: note })).toBeVisible();
    await expect(status(page.getByRole('dialog'), 'Chờ duyệt')).toBeVisible();
    await expect(button(page, 'Duyệt')).toHaveCount(0);
    await button(page, 'Xem hoa-don.png').click();
    await expect(page.getByRole('img', { name: 'hoa-don.png' })).toBeVisible();
    await button(page, 'Đóng xem trước').click();
    await button(page, 'Xem hoa-don.pdf').click();
    await expect(page.getByTitle('hoa-don.pdf')).toHaveAttribute('src', /^blob:/);
    const pdfDownload = page.waitForEvent('download');
    await button(page, 'Tải xuống').click();
    const downloadedPdf = await pdfDownload;
    expect(downloadedPdf.suggestedFilename()).toBe('hoa-don.pdf');
    expect(await readFile((await downloadedPdf.path())!)).toEqual(pdf);
    await button(page, 'Đóng PDF').click();
    await button(page, 'Sửa khoản này').click();
    await attach(page, 'bien-nhan.png');
    await button(page, 'Lưu thay đổi').click();
    await expect(button(page, 'Xem bien-nhan.png')).toBeVisible();
    await expect(button(page, 'Xem hoa-don.png')).toBeVisible();

    await openCash(admin, 'Đăng nhập quản trị (mô phỏng)');
    for (const kind of ['thu', 'chi']) {
      await button(admin, '+ Tạo đề nghị ' + kind).click();
      const dialog = admin.getByRole('dialog').filter({ has: admin.getByRole('heading', { name: 'Tạo đề nghị ' + kind }) });
      await dialog.getByRole('button', { name: /^Người duyệt:/ }).click();
      const picker = admin.getByRole('dialog', { name: 'Người duyệt', exact: true });
      const search = picker.getByRole('textbox', { name: 'Tìm người duyệt', exact: true });
      const approver = picker.getByRole('checkbox', { name: 'Người giao việc demo' });
      await expect(approver).toBeVisible();
      await expect(dialog.getByText('Chỉ định sau')).toHaveCount(0);
      await search.fill('khong co ten nay');
      const emptyApprovers = picker.getByText('Không có người duyệt phù hợp.');
      await expect(emptyApprovers).toBeVisible();
      await expect(emptyApprovers.locator('..').locator('img')).toHaveAttribute('src', /people\.png/);
      await search.fill('nguoi giao viec');
      await approver.click();
      const selectedApprover = dialog.getByRole('button', { name: 'Người duyệt: Người giao việc demo', exact: true });
      await expectValueStyle(status(selectedApprover, 'Người giao việc demo'));
      await selectedApprover.click();
      await expect(approver).toBeChecked();
      await approver.click();
      await expect(dialog.getByRole('button', { name: 'Người duyệt: Chưa chọn', exact: true })).toBeVisible();
      await dialog.getByRole('button', { name: 'Đóng đề nghị' }).click();
    }
    await expect(entry(admin)).toContainText('Hạng mục: Chi khác');
    const pendingBeforeApproval = Number((await pendingTotal(admin).innerText()).replace(/\D/g, ''));
    await entry(admin).click();
    await expect(admin.getByRole('dialog').getByRole('heading', { name: note })).toBeVisible();
    await expect(button(admin, 'Lưu người duyệt')).toBeDisabled();
    await admin.getByRole('button', { name: /^Người duyệt:/ }).click();
    await admin.getByRole('textbox', { name: 'Tìm người duyệt', exact: true }).fill('nguoi giao viec');
    await admin.getByRole('checkbox', { name: 'Người giao việc demo', exact: true }).click();
    await button(admin, 'Lưu người duyệt').click();
    await expect(admin.getByText('nguoigiao@example.test', { exact: true })).toBeVisible();
    await expect(page.getByText('nguoigiao@example.test', { exact: true })).toBeVisible();
    await expect(button(page, 'Lưu người duyệt')).toHaveCount(0);

    await openCash(reviewer, 'Đăng nhập người giao việc (mô phỏng)');
    await button(reviewer, 'Mở menu').click();
    await reviewer.getByRole('dialog').getByRole('button', { name: 'Phê duyệt', exact: true }).click();
    await entry(reviewer).click();
    await expect(reviewer.getByRole('dialog', { name: 'Chi tiết khoản thu chi' })).toBeVisible();
    await expect(reviewer.getByText('PHÊ DUYỆT', { exact: true })).toBeAttached();
    await expect(button(reviewer, 'Sửa khoản này')).toHaveCount(0);
    await button(reviewer, 'Xem bien-nhan.png').click();
    await expect(reviewer.getByRole('img', { name: 'bien-nhan.png' })).toBeVisible();
    await button(reviewer, 'Đóng xem trước').click();
    await button(reviewer, 'Duyệt').click();
    await expect(status(reviewer, 'Chờ chi')).toBeVisible();
    await expect(button(reviewer, 'Xác nhận đã chi')).toHaveCount(0);
    await button(reviewer, 'Về Phê duyệt').click();
    await expect(reviewer.getByText('Không có hồ sơ.', { exact: true }).first()).toBeVisible();
    await expect(entry(reviewer)).toHaveCount(0);
    await expect(status(admin.getByRole('dialog'), 'Chờ chi')).toBeVisible();
    await button(admin, 'Đóng chi tiết khoản thu chi').click();
    const expectedPending = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
      .format(pendingBeforeApproval - 2_500_000);
    await expect(pendingTotal(admin)).toHaveText(expectedPending);
    await entry(admin).click();
    await admin.getByRole('textbox', { name: 'Mã chứng từ hoặc tham chiếu giao dịch' }).fill('BANK-CASH-TEST');
    await button(admin, 'Xác nhận đã chi').click();
    await button(admin, 'Xác nhận giao dịch đã hoàn tất').click();
    await expect(status(page.getByRole('dialog'), 'Đã chi')).toBeVisible();
    await expect(button(page, 'Sửa khoản này')).toHaveCount(0);
    await expect(button(page, 'Xem hoa-don.png')).toBeVisible();
    await expect(admin.getByText('BANK-CASH-TEST', { exact: true })).toBeVisible();

    await button(admin, 'Đóng chi tiết khoản thu chi').click();
    await admin.getByRole('button', { name: /^Trạng thái:/ }).click();
    await admin.getByRole('radio', { name: 'Chờ duyệt', exact: true }).click();
    await expect(entry(admin)).toHaveCount(0);
    const download = admin.waitForEvent('download');
    await button(admin, 'Xuất CSV theo tháng và dự án').click();
    expect((await download).suggestedFilename()).toMatch(/^so-thu-chi-\d{4}-\d{2}\.csv$/);
  } finally {
    await Promise.all([admin.close(), reviewer.close()]);
    const found = await request.post(firestore + ':runQuery', { headers, data: { structuredQuery: {
      from: [{ collectionId: 'cash' }], where: { fieldFilter: { field: { fieldPath: 'note' },
        op: 'EQUAL', value: { stringValue: note } } },
    } } });
    if (found.ok()) {
      for (const result of await found.json()) {
        if (!result.document) continue;
        for (const file of result.document.fields.files?.arrayValue?.values ?? []) {
          const id = file.mapValue.fields.id.stringValue;
          await request.delete(`${firestore}/files/${id}/chunks/0`, { headers });
          await request.delete(`${firestore}/files/${id}`, { headers });
        }
        await request.delete(`http://${host}:${port}/v1/${result.document.name}`, { headers });
      }
    }
  }
});
