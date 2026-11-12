import { devices, expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { read, utils } from 'xlsx';
import { todayInVietnam } from '../src/features/tasks/taskDates';

const previewUrl = process.env.MARCHIX_PREVIEW_URL ?? 'http://localhost:8081';
const columns = ['Họ tên', 'Công', 'Lương theo công', 'Phụ cấp + thưởng', 'Tổng thu nhập', 'BH người LĐ',
  'Thuế TNCN', 'Tạm ứng + khấu trừ', 'Thực lĩnh', 'BH + KPCĐ công ty', 'Tổng chi phí', 'Trạng thái'];

test.use({ ...devices['iPhone 13'], defaultBrowserType: 'chromium' });

async function openPayroll(page: Page, admin: boolean) {
  await page.goto(previewUrl);
  await page.getByRole('button', { name: admin ? 'Đăng nhập quản trị (mô phỏng)' : 'Đăng nhập Google (mô phỏng)' }).click();
  await page.getByRole('button', { name: 'Mở menu' }).click();
  await page.getByRole('dialog').getByRole('button', { name: admin ? 'Nhân sự & lương' : 'Phiếu lương', exact: true }).click();
}

test('Phiếu lương mở trong app, chốt đúng quyền và tạo khoản chi một lần', async ({ page, browser, request }) => {
  test.setTimeout(90_000);
  const admin = await browser.newPage({ ...devices['iPhone 13'] });
  const host = process.env.EXPO_PUBLIC_EMULATOR_HOST || '127.0.0.1';
  const port = process.env.EXPO_PUBLIC_FIRESTORE_EMULATOR_PORT || 8080;
  const base = 'http://' + host + ':' + port + '/v1/projects/demo-marchix-mobile/databases/(default)/documents';
  const headers = { Authorization: 'Bearer owner' };
  const month = todayInVietnam().slice(0, 7);
  const label = month.slice(5) + '/' + month.slice(0, 4);
  const slip = base + '/payroll/' + month + '_nhanvien-luong-demo';
  const expense = base + '/cash/luong_' + month + '_nhanvien-luong-demo';

  try {
    await openPayroll(page, false);
    await expect(page.getByRole('heading', { name: 'Phiếu lương của bạn' })).toBeVisible();
    await expect(page.getByText('Tháng 10/2026', { exact: true })).toBeVisible();
    await expect(page.getByText('Tháng 09/2026', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Tháng 08/2026', { exact: true })).toHaveCount(0);
    const legacyDownloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Xuất phiếu lương', exact: true }).click();
    const legacyDownload = await legacyDownloadPromise;
    const legacyBook = read(await readFile((await legacyDownload.path())!), { type: 'buffer' });
    expect(utils.sheet_to_json(legacyBook.Sheets[legacyBook.SheetNames[0]], { header: 1 })).toEqual([
      columns, ['Nhân viên lương demo', '24 / 26', '', '', 10000000, 600000, 0, 300000, 9100000, '', '', 'Đã trả'],
    ]);

    await openPayroll(admin, true);
    await admin.getByRole('button', { name: 'Hồ sơ nhân sự', exact: true }).click();
    await admin.getByRole('button', { name: 'Sửa hồ sơ Nhân viên lương demo' }).click();
    await admin.getByLabel('Chức danh').fill('Kiểm thử lương');
    await admin.getByRole('button', { name: 'Lưu hồ sơ' }).click();
    await expect(admin.getByText(/Kiểm thử lương · Thử việc/)).toBeVisible();
    await admin.getByRole('button', { name: 'Bảng lương', exact: true }).click();
    await expect(admin.getByRole('table').getByRole('columnheader')).toHaveText(columns);

    await admin.getByRole('button', { name: 'Lấy ngày công từ Chấm công' }).click();
    await admin.getByRole('button', { name: 'Xác nhận', exact: true }).click();
    await expect(admin.getByText('Đã cập nhật 1 dòng.')).toBeVisible();
    await admin.getByRole('button', { name: 'Xem dòng lương Nhân viên lương demo' }).click();
    await admin.getByLabel('Ngày công thực tế').fill('13');
    await admin.getByLabel('Ngày công chuẩn').fill('26');
    await admin.getByLabel('Thưởng / khoản thêm').fill('500000');
    await admin.getByLabel('Khấu trừ khác').fill('200000');
    await admin.getByRole('button', { name: 'Lưu dòng lương' }).click();
    await expect(admin.getByText('Đã lưu dòng lương.')).toBeVisible();
    await expect(page.getByText('Tháng ' + label, { exact: true })).toHaveCount(0);
    const requestPayment = admin.getByRole('button', { name: 'Tạo đề nghị chi lương', exact: true });
    await expect(requestPayment).toBeDisabled();
    const draftDownload = admin.waitForEvent('download');
    await admin.getByRole('button', { name: 'Xuất bảng lương', exact: true }).click();
    const draftBook = read(await readFile((await (await draftDownload).path())!), { type: 'buffer' });
    expect(utils.sheet_to_json(draftBook.Sheets[draftBook.SheetNames[0]], { header: 1 })).toContainEqual([
      'Nhân viên lương demo', '13 / 26', 5000000, 500000, 5500000, 0, 0, 200000, 5300000, 0, 5500000, 'Nháp',
    ]);

    await admin.getByRole('button', { name: 'Chốt bảng lương', exact: true }).click();
    await expect(admin.getByText('Tôi xác nhận thông tin lương tháng ' + label, { exact: false })).toBeVisible();
    await expect(page.getByText('Tháng ' + label, { exact: true })).toHaveCount(0);
    await admin.getByRole('button', { name: 'Xác nhận chốt', exact: true }).click();
    await expect(page.getByText('Tháng ' + label, { exact: true })).toBeVisible();
    await expect(page.getByText(/5[.\s]300[.\s]000 đ/)).toBeVisible();
    await expect(requestPayment).toBeDisabled();
    await page.getByRole('button', { name: 'Xác nhận phiếu lương', exact: true }).click();
    await page.getByRole('button', { name: 'Xác nhận', exact: true }).click();
    await expect(requestPayment).toBeEnabled();

    await admin.getByRole('button', { name: 'Xem dòng lương Nhân viên lương demo' }).click();
    await admin.getByRole('button', { name: 'Mở lại dòng lương' }).click();
    await expect(page.getByText('Tháng ' + label, { exact: true })).toHaveCount(0);
    await admin.getByRole('button', { name: 'Chốt bảng lương', exact: true }).click();
    await admin.getByRole('button', { name: 'Xác nhận chốt', exact: true }).click();
    await expect(page.getByText('Tháng ' + label, { exact: true })).toBeVisible();
    await expect(requestPayment).toBeDisabled();
    await page.getByRole('button', { name: 'Xác nhận phiếu lương', exact: true }).click();
    await page.getByRole('button', { name: 'Xác nhận', exact: true }).click();
    await expect(requestPayment).toBeEnabled();

    const downloadPromise = admin.waitForEvent('download');
    await admin.getByRole('button', { name: 'Xuất bảng lương', exact: true }).click();
    const download = await downloadPromise;
    const book = read(await readFile((await download.path())!), { type: 'buffer' });
    const values = utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { header: 1 });
    const payrollRow = ['Nhân viên lương demo', '13 / 26', 5000000, 500000, 5500000, 0, 0, 200000, 5300000, 0, 5500000, 'Đã chốt'];
    expect(values[0]).toEqual(columns);
    expect(values).toContainEqual(payrollRow);

    await page.getByRole('button', { name: 'Chọn tháng: ' + label, exact: true }).click();
    await expect(page.getByRole('radio', { name: '09/2026', exact: true })).toHaveCount(0);
    await expect(page.getByRole('radio', { name: '08/2026', exact: true })).toHaveCount(0);
    await page.getByRole('radio', { name: '10/2026', exact: true }).click();
    await expect(page.getByText('Tháng 10/2026', { exact: true })).toBeVisible();
    await expect(page.getByText('Tháng ' + label, { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Chọn tháng: 10/2026', exact: true }).click();
    await page.getByRole('radio', { name: label, exact: true }).click();
    await expect(page.getByText('Tháng ' + label, { exact: true })).toBeVisible();

    const personalDownloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Xuất phiếu lương', exact: true }).first().click();
    const personalDownload = await personalDownloadPromise;
    expect(personalDownload.suggestedFilename()).toBe('Phieu-luong-' + month + '.xlsx');
    const personalBook = read(await readFile((await personalDownload.path())!), { type: 'buffer' });
    expect(utils.sheet_to_json(personalBook.Sheets[personalBook.SheetNames[0]], { header: 1 })).toEqual([columns, payrollRow]);

    for (const message of ['Đã tạo 1 khoản trong mục Thu chi.', 'Kỳ lương này không có khoản chi mới.']) {
      await requestPayment.click();
      await admin.getByRole('button', { name: 'Xác nhận', exact: true }).click();
      await expect(admin.getByText(message, { exact: true })).toBeVisible();
    }
    const result = await request.get(expense, { headers });
    expect(result.ok()).toBeTruthy();
    expect((await result.json()).fields).toMatchObject({ amount: { integerValue: '5300000' }, status: { stringValue: 'Chờ chi' } });
  } finally {
    await admin.close();
    await Promise.all([slip, expense].map(url => request.delete(url, { headers })));
  }
});
