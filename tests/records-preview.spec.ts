import { readFile } from 'node:fs/promises';
import { test } from './helpers/startupReminder';
import { devices, expect } from '@playwright/test';

const previewUrl = process.env.MARCHIX_PREVIEW_URL ?? 'http://localhost:8081';
test.use({ ...devices['iPhone 13'], defaultBrowserType: 'chromium' });

function pdfWithText() {
  const content = 'BT /F1 18 Tf 30 100 Td (Marchix correspondence PDF) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 360 180] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((body, index) => {
    const offset = pdf.length;
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });
  const xref = pdf.length;
  pdf += 'xref\n0 6\n0000000000 65535 f \n' + offsets.map(offset =>
    `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  return Buffer.from(pdf + `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
}

test('Văn thư xử lý văn bản đến, ký cấp số, phát hành và xem nội dung PDF trong app', async ({ page }) => {
  test.setTimeout(120_000);
  const button = (name: string) => page.getByRole('button', { name, exact: true });
  const title = `Văn bản kiểm thử ${Date.now()}`;
  const pdf = pdfWithText();

  async function choosePdf(label = 'Chọn PDF') {
    const picker = page.waitForEvent('filechooser');
    await button(label).click();
    await (await picker).setFiles({ name: 'marchix.pdf', mimeType: 'application/pdf', buffer: pdf });
  }

  async function chooseDate(label: string) {
    await button(`${label}, Chọn ngày`).click();
    const day = page.getByRole('button', { name: /^Ngày \d{2}\/\d{2}\/\d{4}$/ }).first();
    const value = (await day.getAttribute('aria-label'))!.replace('Ngày ', '');
    await day.click();
    await expect(button(`${label}, ${value}`)).toHaveAttribute('aria-expanded', 'false');
    return value;
  }

  async function preview(name: string, download = false) {
    await button(name).click();
    const viewer = page.locator('iframe[title="marchix.pdf"]');
    await expect(viewer).toBeVisible();
    const source = await viewer.getAttribute('src');
    expect(source).toMatch(/^blob:/);
    const contents = await page.evaluate(async url => (await fetch(url!)).text(), source);
    expect(contents).toContain('(Marchix correspondence PDF) Tj');
    if (download) {
      const downloadEvent = page.waitForEvent('download');
      await button('Tải xuống').click();
      const downloaded = await downloadEvent;
      expect(downloaded.suggestedFilename()).toBe('marchix.pdf');
      expect(await readFile(await downloaded.path())).toEqual(pdf);
    }
    await button('Đóng PDF').click();
  }

  async function action(label: string, state: string) {
    await button(label).click();
    await button('Xác nhận').click();
    await expect(page.getByText(state, { exact: true }).first()).toBeVisible();
  }

  async function checkPdfForm(label: string) {
    const dialog = page.getByRole('dialog', { name: label, exact: true });
    const body = dialog.getByRole('heading', { name: label, exact: true }).locator('..');
    await expect(body).toHaveCSS('border-top-width', '0px');
    await expect(body).toHaveCSS('padding-left', '0px');
    const confirm = dialog.getByRole('button', { name: 'Xác nhận', exact: true });
    await expect(confirm.locator('..')).toHaveCSS('justify-content', /^(flex|flow)-end$/);
    await expect(confirm.locator('..').getByRole('button', { name: 'Hủy', exact: true })).toBeVisible();
    const file = dialog.getByRole('button', { name: 'marchix.pdf', exact: true });
    const remove = file.locator('..').getByRole('button', { name: 'Bỏ tệp marchix.pdf', exact: true });
    await expect(file.locator('..')).toHaveCSS('border-top-width', '1px');
    await expect(remove).toBeVisible();
    await expect(dialog.getByRole('button', { name: /Xem PDF vừa chọn|Bỏ tệp vừa chọn/ })).toHaveCount(0);
    await preview('marchix.pdf');
    await remove.click();
    await expect(dialog.getByRole('button', { name: 'Bỏ tệp marchix.pdf', exact: true })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Chọn PDF', exact: true })).toBeVisible();
  }

  await page.goto(previewUrl);
  await button('Đăng nhập quản trị (mô phỏng)').click();
  await button('Mở menu').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Văn thư', exact: true }).click();
  await expect(button('Văn bản đến')).toHaveAttribute('aria-pressed', 'true');
  const detail = page.getByRole('dialog', { name: 'Chi tiết công văn' });
  const seededRecord = page.getByRole('button', { name: /Công văn xác nhận lịch bàn giao/ });
  const processing = page.getByRole('dialog', { name: 'Bắt đầu xử lý' });
  const note = `Đã liên hệ đối tác ${Date.now()}`;
  const recordSearch = page.getByRole('textbox', { name: 'Tìm văn bản' });
  await recordSearch.fill('Công văn xác nhận lịch bàn giao');
  await seededRecord.click();
  const subject = detail.getByRole('heading', { name: 'Công văn xác nhận lịch bàn giao' });
  const status = subject.locator('..').getByText('Đã giao', { exact: true });
  await expect(subject).toBeVisible();
  await expect(subject).toHaveCSS('font-size', '26px');
  await expect(subject).toHaveCSS('font-weight', '800');
  await expect(status).toBeVisible();
  const [subjectBox, statusBox] = await Promise.all([subject.boundingBox(), status.boundingBox()]);
  expect(subjectBox!.y).toBeGreaterThanOrEqual(statusBox!.y + statusBox!.height);
  await expect(detail.getByText('Nhật ký xử lý')).toHaveCount(0);
  await button('Bắt đầu xử lý').click();
  const processingBody = processing.getByRole('heading', { name: 'Bắt đầu xử lý' }).locator('..');
  await expect(processingBody).toHaveCSS('border-top-width', '0px');
  await expect(processingBody).toHaveCSS('padding-left', '0px');
  await processing.getByLabel('Ghi chú xử lý').fill('Ghi chú đã hủy');
  await processing.getByRole('button', { name: 'Hủy', exact: true }).click();
  await expect(detail.getByText('Đã giao', { exact: true })).toBeVisible();
  await button('Bắt đầu xử lý').click();
  await expect(processing.getByLabel('Ghi chú xử lý')).toHaveValue('');
  await processing.getByLabel('Ghi chú xử lý').fill(note);
  await processing.getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await expect(detail.getByText('Đang xử lý', { exact: true })).toBeVisible();
  await expect(detail.getByText(note)).toHaveCount(0);
  await button('Hoàn tất xử lý').click();
  const completion = page.getByRole('dialog', { name: 'Hoàn tất xử lý', exact: true });
  const completionBody = completion.getByRole('heading', { name: 'Hoàn tất xử lý', exact: true }).locator('..');
  await expect(completionBody).toHaveCSS('border-top-width', '0px');
  await expect(completionBody).toHaveCSS('padding-left', '0px');
  const completionActions = completion.getByRole('button', { name: 'Xác nhận', exact: true }).locator('..');
  await expect(completionActions).toHaveCSS('justify-content', /^(flex|flow)-end$/);
  await completionActions.getByRole('button', { name: 'Hủy', exact: true }).click();
  await expect(detail.getByText('Đang xử lý', { exact: true })).toBeVisible();
  await button('Về sổ văn thư').click();
  await button('Lịch sử').click();
  await expect(page.getByText('Ghi chú đã hủy')).toHaveCount(0);
  const historyEntry = page.getByRole('button').filter({ has: page.getByText('Công văn xác nhận lịch bàn giao', { exact: true }) });
  await expect(historyEntry).toHaveCount(1);
  await expect(historyEntry.getByText('Đang xử lý', { exact: true })).toHaveCSS('border-radius', '8px');
  for (const label of ['Sổ văn thư:', 'Số văn bản:']) {
    await expect(historyEntry.getByText(label, { exact: true })).toHaveCSS('font-weight', '700');
  }
  const historyNote = historyEntry.getByText(note, { exact: true });
  await expect(historyNote.locator('..').getByText('Ghi chú:', { exact: true })).toHaveCSS('font-weight', '700');
  await expect(historyNote).toHaveCSS('font-weight', '500');
  await historyEntry.click();
  await expect(detail.getByRole('heading', { name: 'Công văn xác nhận lịch bàn giao' })).toBeVisible();
  await button('Về sổ văn thư').click();
  await expect(button('Lịch sử')).toHaveAttribute('aria-pressed', 'true');
  await button('Văn bản đến').click();
  await recordSearch.clear();
  await button('+ Vào sổ').click();
  await expect(page.getByRole('dialog', { name: 'Vào sổ · Văn bản đến' })).toBeVisible();
  await expect(page.getByText('Ngày vào sổ', { exact: true })).toBeVisible();
  const documentDate = await chooseDate('Ngày văn bản');
  const due = button('Hạn xử lý, Chọn ngày');
  const dueCalendar = page.getByRole('dialog', { name: 'Hạn xử lý', exact: true });
  const priority = page.getByRole('button', { name: /^Mức độ:/ });
  await due.scrollIntoViewIfNeeded();
  const priorityBefore = (await priority.boundingBox())!.y;
  await due.click();
  await expect(dueCalendar).toBeVisible();
  expect((await priority.boundingBox())!.y).toBeCloseTo(priorityBefore, 0);
  await dueCalendar.getByRole('button', { name: 'Đóng lịch' }).click();
  await expect(due).toBeVisible();
  await due.click();
  await dueCalendar.getByRole('button', { name: /^Ngày \d{2}\/\d{2}\/\d{4}$/ }).last().click();
  await page.getByRole('button', { name: /^Hạn xử lý, \d{2}\// }).click();
  await button('Bỏ ngày').click();
  await expect(button('Hạn xử lý, Chọn ngày')).toBeVisible();
  await page.getByLabel('Trích yếu', { exact: true }).fill(title + ' đến');
  await page.getByLabel('Nơi gửi', { exact: true }).fill('Marchix');
  await page.getByRole('button', { name: /^Người theo dõi:/ }).click();
  const watcherPicker = page.getByRole('dialog', { name: 'Người theo dõi', exact: true });
  await watcherPicker.getByRole('textbox', { name: 'Tìm người theo dõi' }).fill('dong nghiep');
  await watcherPicker.getByRole('checkbox', { name: 'Đồng nghiệp demo', exact: true }).click();
  await watcherPicker.getByRole('button', { name: 'Xong', exact: true }).click();
  await choosePdf('Chọn tệp');
  await preview('Xem trước');
  await button('Vào sổ và cấp số đến').click();
  await expect(page.getByRole('heading', { name: title + ' đến' })).toBeVisible();
  await expect(detail.getByText(documentDate, { exact: true }).first()).toBeVisible();
  await expect(detail.getByText(/^\d{2,6}\/20\d{2}$/)).toBeVisible();
  await expect(page.getByText('Đồng nghiệp demo', { exact: true }).first()).toBeVisible();
  await preview('marchix.pdf', true);
  await button('Giao xử lý').click();
  const assignment = page.getByRole('dialog', { name: 'Giao xử lý', exact: true });
  const assignmentBody = assignment.getByRole('heading', { name: 'Giao xử lý', exact: true }).locator('..');
  await expect(assignmentBody).toHaveCSS('border-top-width', '0px');
  await expect(assignmentBody).toHaveCSS('padding-left', '0px');
  const assignmentActions = assignment.getByRole('button', { name: 'Xác nhận', exact: true }).locator('..');
  await expect(assignmentActions).toHaveCSS('justify-content', /^(flex|flow)-end$/);
  await assignmentActions.getByRole('button', { name: 'Hủy', exact: true }).click();
  await expect(detail.getByText('Đã vào sổ', { exact: true })).toBeVisible();
  await button('Về sổ văn thư').click();

  await button('Văn bản đi').click();
  await expect(button('Văn bản đi')).toHaveAttribute('aria-pressed', 'true');
  await button('+ Lập bản nháp').click();
  await page.getByLabel('Trích yếu', { exact: true }).fill(title + ' đi');
  await page.getByLabel('Nơi nhận', { exact: true }).fill('Đối tác kiểm thử');
  const textPicker = page.waitForEvent('filechooser');
  await button('Chọn tệp').click();
  await (await textPicker).setFiles({
    name: 'ghi-chu.txt', mimeType: 'text/plain', buffer: Buffer.from('Noi dung tep dinh kem'),
  });
  await button('Xem trước').click();
  await expect(page.getByText('Noi dung tep dinh kem', { exact: true })).toBeVisible();
  await button('Đóng xem trước').click();
  const outgoingDueDate = await chooseDate('Hạn xử lý');
  await button('Lập bản nháp').click();
  await expect(page.getByRole('heading', { name: title + ' đi' })).toBeVisible();
  await button('ghi-chu.txt').click();
  await expect(page.getByText('Noi dung tep dinh kem', { exact: true })).toBeVisible();
  await button('Đóng xem trước').click();
  await expect(detail.getByText(outgoingDueDate, { exact: true })).toBeVisible();
  await action('Trình duyệt nội dung', 'Chờ duyệt nội dung');
  await button('Về sổ văn thư').click();
  await button('Mở menu').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Phê duyệt', exact: true }).click();
  await button('Mở hồ sơ: ' + title + ' đi').click();
  await expect(detail).toBeVisible();
  await expect(page.getByText('PHÊ DUYỆT', { exact: true })).toBeAttached();
  await expect(page.getByRole('heading', { name: title + ' đi' })).toBeVisible();
  await action('Duyệt nội dung', 'Đã duyệt nội dung');
  await action('Chuyển chờ ký', 'Chờ ký');
  await button('Xác nhận bản đã ký và cấp số').click();
  await page.getByLabel('Họ tên người ký').fill('Người ký kiểm thử');
  await choosePdf();
  await checkPdfForm('Xác nhận bản đã ký và cấp số');
  await expect(button('ghi-chu.txt')).toBeVisible();
  await choosePdf();
  await button('Tôi đã kiểm tra chữ ký trên PDF').click();
  await button('Xác nhận').click();
  await expect(page.getByText(/^\d{2,6}\/MARCHIX-VP$/)).toBeVisible();
  await preview('marchix.pdf');
  await button('Ghi nhận phát hành').click();
  await page.getByLabel('Bằng chứng phát hành').fill('Gửi email cho đối tác lúc 09:00, tham chiếu TEST-01.');
  await choosePdf();
  await checkPdfForm('Ghi nhận phát hành');
  await expect(button('marchix.pdf')).toBeVisible();
  await button('Tôi đã kiểm tra chữ ký, số và ngày trên PDF').click();
  await button('Xác nhận').click();
  await expect(page.getByText('Đã phát hành', { exact: true }).first()).toBeVisible();
  await expect(detail.getByText(/tham chiếu TEST-01/)).toHaveCount(0);
  await preview('marchix.pdf');
  await button('Lưu hồ sơ').click();
  const archive = page.getByRole('dialog', { name: 'Lưu hồ sơ', exact: true });
  const archiveBody = archive.getByRole('heading', { name: 'Lưu hồ sơ', exact: true }).locator('..');
  await expect(archiveBody).toHaveCSS('border-top-width', '0px');
  await expect(archiveBody).toHaveCSS('padding-left', '0px');
  const archiveActions = archive.getByRole('button', { name: 'Xác nhận', exact: true }).locator('..');
  await expect(archiveActions).toHaveCSS('justify-content', /^(flex|flow)-end$/);
  await archiveActions.getByRole('button', { name: 'Hủy', exact: true }).click();
  await expect(detail.getByText('Đã phát hành', { exact: true })).toBeVisible();
  await button('Về Phê duyệt').click();
  await expect(page.getByRole('heading', { name: 'PHÊ DUYỆT', exact: true })).toBeVisible();
  await expect(button('Mở hồ sơ: ' + title + ' đi')).toHaveCount(0);
  await button('Mở menu').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Văn thư', exact: true }).click();
  await button('Lịch sử').click();
  await expect(page.getByText(/tham chiếu TEST-01/)).toBeVisible();
});

test('Trình duyệt nội dung xem và bỏ PDF ngay trên hàng tệp đính kèm', async ({ page }) => {
  const button = (name: string) => page.getByRole('button', { name, exact: true });
  const filename = 'ban-trinh-duyet.pdf';
  await page.goto(previewUrl);
  await button('Đăng nhập quản trị (mô phỏng)').click();
  await button('Mở menu').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Văn thư', exact: true }).click();
  await button('Văn bản đi').click();
  await page.getByRole('textbox', { name: 'Tìm văn bản' }).fill('Quyết định phân công phụ trách dự án');
  await page.getByRole('button', { name: /Quyết định phân công phụ trách dự án/ }).click();
  await button('Trình duyệt nội dung').click();

  const review = page.getByRole('dialog', { name: 'Trình duyệt nội dung' });
  const body = review.getByRole('heading', { name: 'Trình duyệt nội dung' }).locator('..');
  await expect(body).toHaveCSS('border-top-width', '0px');
  await expect(body).toHaveCSS('padding-left', '0px');
  await expect(review.getByRole('button', { name: 'Xác nhận' }).locator('..')).toHaveCSS('justify-content', /^(flex|flow)-end$/);
  const note = 'Ghi chú bản trình duyệt';
  await review.getByRole('textbox', { name: 'Ghi chú nhật ký' }).fill(note);

  async function choosePdf() {
    const picker = page.waitForEvent('filechooser');
    await review.getByRole('button', { name: 'Chọn PDF', exact: true }).click();
    await (await picker).setFiles({ name: filename, mimeType: 'application/pdf', buffer: pdfWithText() });
  }

  await choosePdf();
  const file = review.getByRole('button', { name: filename, exact: true });
  const remove = review.getByRole('button', { name: `Bỏ tệp ${filename}`, exact: true });
  const fileCard = file.locator('..');
  await expect(fileCard).toHaveCSS('border-top-width', '1px');
  await expect(fileCard.getByRole('button', { name: `Bỏ tệp ${filename}`, exact: true })).toBeVisible();
  await expect(review.getByRole('button', { name: /Xem PDF vừa chọn|Bỏ tệp vừa chọn/ })).toHaveCount(0);
  const [fileBox, removeBox] = await Promise.all([file.boundingBox(), remove.boundingBox()]);
  expect(removeBox!.x).toBeGreaterThanOrEqual(fileBox!.x + fileBox!.width);

  await file.click();
  const preview = page.getByRole('dialog', { name: 'Xem trước tệp' });
  await expect(preview.locator(`iframe[title="${filename}"]`)).toBeVisible();
  await preview.getByRole('button', { name: 'Đóng PDF' }).click();
  await expect(review.getByRole('textbox', { name: 'Ghi chú nhật ký' })).toHaveValue(note);

  await remove.click();
  await expect(file).toHaveCount(0);
  await expect(remove).toHaveCount(0);
  await choosePdf();
  await review.getByRole('button', { name: 'Xác nhận', exact: true }).click();
  const detail = page.getByRole('dialog', { name: 'Chi tiết công văn' });
  await expect(detail.getByText('Chờ duyệt nội dung', { exact: true })).toBeVisible();
  await expect(detail.getByRole('button', { name: filename, exact: true })).toBeVisible();
});

test('Popup Bổ sung bản đã ký và Hủy số dùng bố cục gọn với nút căn phải', async ({ page, request }) => {
  const host = process.env.EXPO_PUBLIC_EMULATOR_HOST || '127.0.0.1';
  const port = process.env.EXPO_PUBLIC_FIRESTORE_EMULATOR_PORT || 8080;
  const records = `http://${host}:${port}/v1/projects/demo-marchix-mobile/databases/(default)/documents/correspondence`;
  const headers = { Authorization: 'Bearer owner' };
  const id = `bo-sung-ban-ky-${Date.now()}`;
  const subject = `Hồ sơ bổ sung bản ký ${id}`;
  const seed = await request.get(`${records}/recordDemoDecision01`, { headers });
  expect(seed.ok()).toBeTruthy();
  const { fields } = await seed.json();
  const fixture = await request.patch(`${records}/${id}`, { headers, data: { fields: {
    ...fields, status: { stringValue: 'numbered' }, subject: { stringValue: subject },
    externalNumber: { stringValue: '19/QĐ-MARCHIX' }, fileId: { stringValue: '' }, fileName: { stringValue: '' },
  } } });
  expect(fixture.ok()).toBeTruthy();

  try {
    await page.goto(previewUrl);
    await page.getByRole('button', { name: 'Đăng nhập quản trị (mô phỏng)' }).click();
    await page.getByRole('button', { name: 'Mở menu', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Văn thư', exact: true }).click();
    await page.getByRole('button', { name: 'Văn bản đi', exact: true }).click();
    await page.getByRole('textbox', { name: 'Tìm văn bản' }).fill(subject);
    await page.getByRole('button', { name: new RegExp(subject) }).click();
    await page.getByRole('button', { name: 'Bổ sung bản đã ký', exact: true }).click();

    const form = page.getByRole('dialog', { name: 'Bổ sung bản đã ký', exact: true });
    const body = form.getByRole('heading', { name: 'Bổ sung bản đã ký', exact: true }).locator('..');
    await expect(body).toHaveCSS('border-top-width', '0px');
    await expect(body).toHaveCSS('padding-left', '0px');
    const actions = form.getByRole('button', { name: 'Xác nhận', exact: true }).locator('..');
    await expect(actions).toHaveCSS('justify-content', /^(flex|flow)-end$/);
    await expect(actions.getByRole('button', { name: 'Hủy', exact: true })).toBeVisible();

    const picker = page.waitForEvent('filechooser');
    await form.getByRole('button', { name: 'Chọn PDF', exact: true }).click();
    await (await picker).setFiles({ name: 'ban-da-ky.pdf', mimeType: 'application/pdf', buffer: pdfWithText() });
    const file = form.getByRole('button', { name: 'ban-da-ky.pdf', exact: true });
    const remove = file.locator('..').getByRole('button', { name: 'Bỏ tệp ban-da-ky.pdf', exact: true });
    await expect(remove).toBeVisible();
    await file.click();
    const preview = page.getByRole('dialog', { name: 'Xem trước tệp', exact: true });
    await expect(preview.locator('iframe[title="ban-da-ky.pdf"]')).toBeVisible();
    await preview.getByRole('button', { name: 'Đóng PDF', exact: true }).click();
    await remove.click();
    await expect(file).toHaveCount(0);
    await expect(form.getByRole('button', { name: 'Chọn PDF', exact: true })).toBeVisible();
    await actions.getByRole('button', { name: 'Hủy', exact: true }).click();

    await page.getByRole('button', { name: 'Hủy số', exact: true }).click();
    const voidForm = page.getByRole('dialog', { name: 'Hủy số', exact: true });
    const voidBody = voidForm.getByRole('heading', { name: 'Hủy số', exact: true }).locator('..');
    await expect(voidBody).toHaveCSS('border-top-width', '0px');
    await expect(voidBody).toHaveCSS('padding-left', '0px');
    const voidActions = voidForm.getByRole('button', { name: 'Xác nhận', exact: true }).locator('..');
    await expect(voidActions).toHaveCSS('justify-content', /^(flex|flow)-end$/);
    await voidActions.getByRole('button', { name: 'Hủy', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Chi tiết công văn' }).getByText('Đã cấp số', { exact: true })).toBeVisible();
  } finally {
    await request.delete(`${records}/${id}`, { headers });
  }
});
