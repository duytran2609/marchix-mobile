import { devices, expect, test } from '@playwright/test';

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

  async function choosePdf() {
    const picker = page.waitForEvent('filechooser');
    await button('Chọn PDF').click();
    await (await picker).setFiles({ name: 'marchix.pdf', mimeType: 'application/pdf', buffer: pdf });
  }

  async function preview(name: string) {
    await button(name).click();
    const viewer = page.locator('iframe[title="marchix.pdf"]');
    await expect(viewer).toBeVisible();
    const source = await viewer.getAttribute('src');
    expect(source).toMatch(/^blob:/);
    const contents = await page.evaluate(async url => (await fetch(url!)).text(), source);
    expect(contents).toContain('(Marchix correspondence PDF) Tj');
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
  await button('Vào sổ văn bản đến').click();
  await page.getByLabel('Trích yếu', { exact: true }).fill(title + ' đến');
  await page.getByLabel('Nơi gửi', { exact: true }).fill('Marchix');
  await choosePdf();
  await preview('Xem PDF vừa chọn');
  await button('Vào sổ và cấp số đến').click();
  await expect(page.getByRole('heading', { name: title + ' đến' })).toBeVisible();
  await expect(page.getByText(/^\d{2,6}\/20\d{2}$/)).toBeVisible();
  await preview('Xem PDF đã lưu');
  await button('Về sổ văn thư').click();

  await button('Văn bản đi').click();
  await button('Lập bản nháp văn bản đi').click();
  await page.getByLabel('Trích yếu', { exact: true }).fill(title + ' đi');
  await page.getByLabel('Nơi nhận', { exact: true }).fill('Đối tác kiểm thử');
  await button('Lập bản nháp').click();
  await expect(page.getByRole('heading', { name: title + ' đi' })).toBeVisible();
  await action('Trình duyệt nội dung', 'Chờ duyệt nội dung');
  await button('Mở menu').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Phê duyệt', exact: true }).click();
  await button('Mở hồ sơ: ' + title + ' đi').click();
  await expect(page.getByRole('heading', { name: title + ' đi' })).toBeVisible();
  await action('Duyệt nội dung', 'Đã duyệt nội dung');
  await action('Chuyển chờ ký', 'Chờ ký');
  await button('Xác nhận bản đã ký và cấp số').click();
  await page.getByLabel('Họ tên người ký').fill('Người ký kiểm thử');
  await choosePdf();
  await button('Tôi đã kiểm tra chữ ký trên PDF').click();
  await button('Xác nhận').click();
  await expect(page.getByText(/^\d{2,6}\/MARCHIX-VP$/)).toBeVisible();
  await preview('Xem PDF đã lưu');
  await button('Ghi nhận phát hành').click();
  await page.getByLabel('Bằng chứng phát hành').fill('Gửi email cho đối tác lúc 09:00, tham chiếu TEST-01.');
  await button('Tôi đã kiểm tra chữ ký, số và ngày trên PDF').click();
  await button('Xác nhận').click();
  await expect(page.getByText('Đã phát hành', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/tham chiếu TEST-01/)).toBeVisible();
  await preview('Xem PDF đã lưu');
  await button('Về Phê duyệt').click();
  await expect(page.getByRole('heading', { name: 'PHÊ DUYỆT', exact: true })).toBeVisible();
  await expect(button('Mở hồ sơ: ' + title + ' đi')).toHaveCount(0);
});
