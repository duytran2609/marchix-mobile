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
      const downloaded = page.waitForEvent('download');
      await button('Tải xuống').click();
      expect((await downloaded).suggestedFilename()).toBe('marchix.pdf');
    }
    await button('Đóng PDF').click();
  }

  async function action(label: string, state: string) {
    await button(label).click();
    await button('Xác nhận').click();
    await expect(page.getByText(state, { exact: true }).first()).toBeVisible();
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
  await seededRecord.click();
  await expect(detail.getByRole('heading', { name: 'Công văn xác nhận lịch bàn giao' })).toBeVisible();
  await expect(detail.getByText('Nhật ký xử lý')).toHaveCount(0);
  await button('Bắt đầu xử lý').click();
  await processing.getByLabel('Ghi chú xử lý').fill('Ghi chú đã hủy');
  await processing.getByRole('button', { name: 'Hủy', exact: true }).click();
  await expect(detail.getByText('Đã giao', { exact: true })).toBeVisible();
  await button('Bắt đầu xử lý').click();
  await expect(processing.getByLabel('Ghi chú xử lý')).toHaveValue('');
  await processing.getByLabel('Ghi chú xử lý').fill(note);
  await processing.getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await expect(detail.getByText('Đang xử lý', { exact: true })).toBeVisible();
  await expect(detail.getByText(note)).toHaveCount(0);
  await button('Về sổ văn thư').click();
  await button('Lịch sử').click();
  await expect(page.getByText('Ghi chú đã hủy')).toHaveCount(0);
  await page.getByText(note, { exact: true }).click();
  await expect(detail.getByRole('heading', { name: 'Công văn xác nhận lịch bàn giao' })).toBeVisible();
  await button('Về sổ văn thư').click();
  await expect(button('Lịch sử')).toHaveAttribute('aria-pressed', 'true');
  await button('Văn bản đến').click();
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
  await button('Tôi đã kiểm tra chữ ký trên PDF').click();
  await button('Xác nhận').click();
  await expect(page.getByText(/^\d{2,6}\/MARCHIX-VP$/)).toBeVisible();
  await preview('marchix.pdf');
  await button('Ghi nhận phát hành').click();
  await page.getByLabel('Bằng chứng phát hành').fill('Gửi email cho đối tác lúc 09:00, tham chiếu TEST-01.');
  await button('Tôi đã kiểm tra chữ ký, số và ngày trên PDF').click();
  await button('Xác nhận').click();
  await expect(page.getByText('Đã phát hành', { exact: true }).first()).toBeVisible();
  await expect(detail.getByText(/tham chiếu TEST-01/)).toHaveCount(0);
  await preview('marchix.pdf');
  await button('Về Phê duyệt').click();
  await expect(page.getByRole('heading', { name: 'PHÊ DUYỆT', exact: true })).toBeVisible();
  await expect(button('Mở hồ sơ: ' + title + ' đi')).toHaveCount(0);
  await button('Mở menu').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Văn thư', exact: true }).click();
  await button('Lịch sử').click();
  await expect(page.getByText(/tham chiếu TEST-01/)).toBeVisible();
});
