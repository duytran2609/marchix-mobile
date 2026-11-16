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
  const startupReminder = page.getByRole('dialog', { name: /cần chú ý hôm nay/ });
  await page.addLocatorHandler(startupReminder, () =>
    startupReminder.getByRole('button', { name: 'Đã xem', exact: true }).click(), { times: 1 });
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
  const advanceId = 'payroll-advance-' + Date.now();
  const advance = base + '/requests/' + advanceId;
  const advanceReason = 'Ứng lương để kiểm tra phiếu';
  const advanceLabel = 'Xem đơn tạm ứng: ' + advanceReason + ' · 750.000 đ';

  try {
    const approved = await request.patch(advance, { headers, data: { fields: {
      type: { stringValue: 'Tạm ứng lương' }, status: { stringValue: 'Đã duyệt' },
      createdBy: { stringValue: 'nhanvien@example.test' }, reason: { stringValue: advanceReason },
      amount: { integerValue: '750000' }, month: { stringValue: month }, createdAt: { stringValue: new Date().toISOString() },
    } } });
    expect(approved.ok()).toBeTruthy();
    await openPayroll(page, false);
    await expect(page.getByRole('heading', { name: 'Phiếu lương của bạn' })).toBeVisible();
    await expect(page.getByText('Tháng 10/2026', { exact: true })).toBeVisible();
    await expect(page.getByText('Phiếu này chưa lưu chi tiết đơn tạm ứng.')).toBeVisible();
    await expect(page.getByText('Tháng 09/2026', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Tháng 08/2026', { exact: true })).toHaveCount(0);
    const legacyDownloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Xuất phiếu lương', exact: true }).click();
    const legacyDownload = await legacyDownloadPromise;
    const legacyBook = read(await readFile((await legacyDownload.path())!), { type: 'buffer' });
    expect(legacyDownload.suggestedFilename()).toBe('Phieu-luong-10-2026.xlsx');
    const legacySheet = legacyBook.Sheets[legacyBook.SheetNames[0]];
    expect(legacySheet.A2.v).toBe('Tháng 10/2026');
    expect(legacySheet.D6?.v ?? '').toBe('');
    expect(legacySheet.E6?.v ?? '').toBe('');
    expect(legacySheet.J6.v).toBe(9100000);

    await openPayroll(admin, true);
    await admin.getByRole('button', { name: 'Hồ sơ nhân sự', exact: true }).click();
    await admin.getByRole('button', { name: '+ Thêm nhân sự', exact: true }).click();
    const addEmployee = admin.getByRole('dialog', { name: 'Thêm nhân sự', exact: true });
    await expect(addEmployee.getByRole('button', { name: 'Lưu hồ sơ' })).toBeVisible();
    await addEmployee.getByRole('button', { name: 'Đóng', exact: true }).click();
    await admin.getByRole('button', { name: 'Sửa hồ sơ Nhân viên lương demo' }).click();
    await admin.getByLabel('Chức danh').fill('Kiểm thử lương');
    await admin.getByRole('button', { name: 'Lưu hồ sơ' }).click();
    const employeeRow = admin.getByRole('table').getByRole('row').filter({
      has: admin.getByRole('button', { name: 'Sửa hồ sơ Nhân viên lương demo' }),
    });
    await expect(employeeRow.getByRole('cell', { name: 'Kiểm thử lương', exact: true })).toBeVisible();
    await expect(employeeRow.getByRole('cell', { name: 'Thử việc', exact: true })).toBeVisible();
    await admin.getByRole('button', { name: 'Bảng lương', exact: true }).click();
    await expect(admin.getByText(/^Tổng thu nhập:/)).toBeVisible();
    const [year, monthNumber] = month.split('-');
    const otherMonth = monthNumber === '01' ? '02' : '01';
    await admin.getByRole('button', { name: 'Chọn tháng: Tháng ' + monthNumber }).click();
    await admin.getByRole('radio', { name: 'Tháng ' + otherMonth, exact: true }).click();
    await expect(admin.getByRole('button', { name: 'Chọn tháng: Tháng ' + otherMonth })).toBeVisible();
    await admin.getByRole('button', { name: 'Chọn năm: ' + year }).click();
    const nextYear = String(Number(year) + 1);
    await admin.getByRole('radio', { name: nextYear, exact: true }).click();
    const exportExcel = admin.getByRole('button', { name: 'Xuất Excel', exact: true });
    await expect(exportExcel).toBeEnabled();
    const unsavedDownloadPromise = admin.waitForEvent('download');
    await exportExcel.click();
    const unsavedDownload = await unsavedDownloadPromise;
    expect(unsavedDownload.suggestedFilename()).toBe('Bang-luong-' + nextYear + '-' + otherMonth + '.xlsx');
    const unsavedBook = read(await readFile((await unsavedDownload.path())!), { type: 'buffer' });
    const unsavedRows = utils.sheet_to_json<(string | number)[]>(unsavedBook.Sheets[unsavedBook.SheetNames[0]], { header: 1 });
    expect(unsavedRows).toContainEqual([
      'Nhân viên lương demo', expect.any(String), expect.any(Number), expect.any(Number),
      expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number),
      expect.any(Number), expect.any(Number), expect.any(Number), 'Nháp',
    ]);
    await admin.getByRole('button', { name: 'Chọn năm: ' + nextYear }).click();
    await admin.getByRole('radio', { name: year, exact: true }).click();
    await admin.getByRole('button', { name: 'Chọn tháng: Tháng ' + otherMonth }).click();
    await admin.getByRole('radio', { name: 'Tháng ' + monthNumber, exact: true }).click();
    await expect(admin.getByRole('table').getByRole('columnheader')).toHaveText(columns);

    await expect(admin.getByRole('button', { name: 'Lấy ngày công từ Chấm công' })).toHaveCount(0);
    await admin.getByRole('button', { name: 'Xem dòng lương Nhân viên lương demo' }).click();
    await expect(admin.getByRole('dialog').getByText('Tạm ứng lương', { exact: true })).toBeVisible();
    await expect(admin.getByRole('button', { name: advanceLabel, exact: true })).toBeVisible();
    await admin.getByLabel('Ngày công thực tế').fill('13');
    await admin.getByLabel('Ngày công chuẩn').fill('26');
    await admin.getByLabel('Thưởng / khoản thêm (VNĐ)').fill('500000');
    await admin.getByLabel('Khấu trừ khác (VNĐ)').fill('200000');
    await admin.getByRole('button', { name: 'Lưu dòng lương' }).click();
    await expect(admin.getByText('Đã lưu dòng lương.')).toBeVisible();
    await expect(page.getByText('Tháng ' + label, { exact: true })).toHaveCount(0);
    const requestPayment = admin.getByRole('button', { name: 'Tạo đề nghị chi lương', exact: true });
    await expect(requestPayment).toBeDisabled();
    const draftDownload = admin.waitForEvent('download');
    await exportExcel.click();
    const draftBook = read(await readFile((await (await draftDownload).path())!), { type: 'buffer' });
    expect(utils.sheet_to_json(draftBook.Sheets[draftBook.SheetNames[0]], { header: 1 })).toContainEqual([
      'Nhân viên lương demo', '13 / 26', 5000000, 500000, 5500000, 0, 0, 950000, 4550000, 0, 5500000, 'Nháp',
    ]);

    await admin.getByRole('button', { name: 'Chốt bảng lương', exact: true }).click();
    await expect(admin.getByText('Tôi xác nhận thông tin lương tháng ' + label, { exact: false })).toBeVisible();
    await expect(page.getByText('Tháng ' + label, { exact: true })).toHaveCount(0);
    await admin.getByRole('button', { name: 'Xác nhận chốt', exact: true }).click();
    await expect(page.getByText('Tháng ' + label, { exact: true })).toBeVisible();
    await expect(page.getByText(/4[.\s]550[.\s]000 đ/)).toBeVisible();
    await expect(page.getByText('Tạm ứng lương', { exact: true })).toBeVisible();
    await expect(page.getByText('750.000 đ', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: advanceLabel, exact: true }).click();
    await expect(page.getByRole('dialog').getByText(advanceReason, { exact: true })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Đóng đơn', exact: true }).click();
    await expect(page.getByText('Tháng ' + label, { exact: true })).toBeVisible();
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
    await exportExcel.click();
    const download = await downloadPromise;
    const book = read(await readFile((await download.path())!), { type: 'buffer' });
    const values = utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { header: 1 });
    const payrollRow = ['Nhân viên lương demo', '13 / 26', 5000000, 500000, 5500000, 0, 0, 950000, 4550000, 0, 5500000, 'Đã chốt'];
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
    expect(personalDownload.suggestedFilename()).toBe('Phieu-luong-' + label.replace('/', '-') + '.xlsx');
    const personalBook = read(await readFile((await personalDownload.path())!), { type: 'buffer', cellStyles: true });
    const personalSheet = personalBook.Sheets[personalBook.SheetNames[0]];
    expect(personalSheet.A1.v).toBe('PHIẾU LƯƠNG NHÂN VIÊN');
    expect(personalSheet.A2.v).toBe('Tháng ' + label);
    expect(personalSheet['!merges']?.map(merge => utils.encode_range(merge))).toContain('G4:I4');
    expect(personalSheet.D4.s.fgColor.rgb).toBe('FFE599');
    expect(personalSheet.A7.s.fgColor.rgb).toBe('FF9900');
    expect(utils.sheet_to_json(personalSheet, { header: 1, range: 'A6:M6' })).toEqual([[1, ...payrollRow]]);

    for (const message of ['Đã tạo 1 khoản trong mục Thu chi.', 'Kỳ lương này không có khoản chi mới.']) {
      await requestPayment.click();
      await admin.getByRole('button', { name: 'Xác nhận', exact: true }).click();
      await expect(admin.getByText(message, { exact: true })).toBeVisible();
    }
    const result = await request.get(expense, { headers });
    expect(result.ok()).toBeTruthy();
    expect((await result.json()).fields).toMatchObject({ amount: { integerValue: '4550000' }, status: { stringValue: 'Chờ chi' } });
    await request.delete(advance, { headers });
    await admin.getByRole('button', { name: 'Xem dòng lương Nhân viên lương demo' }).click();
    await expect(admin.getByRole('button', { name: advanceLabel, exact: true })).toBeVisible();
  } finally {
    await admin.close();
    await Promise.all([slip, expense, advance].map(url => request.delete(url, { headers })));
  }
});
