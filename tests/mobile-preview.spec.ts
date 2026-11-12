import { devices, expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { read, utils } from 'xlsx';
import { formatTaskDate, shiftDay, todayInVietnam } from '../src/features/tasks/taskDates';
import { mondayOf } from '../src/features/weekly-plan/weeklyPlan';

const previewUrl = process.env.MARCHIX_PREVIEW_URL ?? 'http://localhost:8081';

test.use({ ...devices['iPhone 13'], defaultBrowserType: 'chromium' });

async function openTasks(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Mở menu' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Công việc', exact: true }).click();
}

test('Văn thư nằm sau Dự án và hiển thị hồ sơ được giao hoặc theo dõi', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(previewUrl);
  await page.getByRole('button', { name: 'Đăng nhập Google (mô phỏng)' }).click();
  await page.getByRole('button', { name: 'Mở menu' }).click();
  const drawer = page.getByRole('dialog');
  const labels = await drawer.getByRole('button').allTextContents();
  const projectIndex = labels.findIndex(label => label.includes('Dự án'));
  expect(projectIndex).toBeGreaterThanOrEqual(0);
  expect(labels[projectIndex + 1]).toContain('Văn thư');
  await drawer.getByRole('button', { name: 'Văn thư', exact: true }).click();
  const incoming = page.getByRole('button', { name: /Công văn xác nhận lịch bàn giao/ });
  await expect(incoming).toBeVisible();
  await expect(page.getByText('Công văn dành riêng cho bộ phận vận hành')).toHaveCount(0);
  await page.getByLabel('Tìm văn bản', { exact: true }).fill('không có hồ sơ này');
  await expect(incoming).toHaveCount(0);
  await page.getByLabel('Tìm văn bản', { exact: true }).fill('ban giao');
  await incoming.click();
  await expect(page.getByRole('heading', { name: 'Công văn xác nhận lịch bàn giao' })).toBeVisible();
  await expect(page.getByText('01/2025', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Về sổ văn thư' }).click();
  await page.getByLabel('Tìm văn bản', { exact: true }).clear();
  await page.getByRole('button', { name: 'Văn bản đi', exact: true }).click();
  await page.getByRole('button', { name: 'Đang theo dõi (1)', exact: true }).click();
  await expect(page.getByRole('button', { name: /Quyết định phân công phụ trách dự án/ })).toBeVisible();
});

test('Đơn từ trong app chuyển tạm ứng đã duyệt sang Thu chi', async ({ page, browser, request }) => {
  test.setTimeout(120_000);
  const admin = await browser.newPage({ ...devices['iPhone 13'] });
  const reviewer = await browser.newPage({ ...devices['iPhone 13'] });
  const reason = 'Tạm ứng kiểm thử ' + Date.now();
  const host = process.env.EXPO_PUBLIC_EMULATOR_HOST || '127.0.0.1';
  const port = process.env.EXPO_PUBLIC_FIRESTORE_EMULATOR_PORT || 8080;
  const documents = `http://${host}:${port}/v1/projects/demo-marchix-mobile/databases/(default)/documents`;
  const headers = { Authorization: 'Bearer owner' };
  let id = '';
  let overtimeId = '';
  const requestCard = (target: typeof page) => target.getByTestId(`request-${id}`);

  async function findRequest(reason: string) {
    const records = await request.post(documents + ':runQuery', { headers, data: { structuredQuery: {
      from: [{ collectionId: 'requests' }], where: { fieldFilter: {
        field: { fieldPath: 'reason' }, op: 'EQUAL', value: { stringValue: reason },
      } },
    } } });
    expect(records.ok()).toBeTruthy();
    return (await records.json())[0].document;
  }

  async function openRequests(target: typeof page, login: string) {
    await target.goto(previewUrl);
    await target.getByRole('button', { name: login }).click();
    await target.getByRole('button', { name: 'Mở menu' }).click();
    await target.getByRole('dialog').getByRole('button', { name: 'Đơn từ', exact: true }).click();
    await expect(target.getByRole('heading', { name: 'Đơn từ', exact: true })).toBeVisible();
  }

  try {
    await openRequests(page, 'Đăng nhập Google (mô phỏng)');
    await page.getByRole('button', { name: '+ Tạo đơn' }).click();
    const popup = page.getByRole('dialog', { name: 'Tạo đơn' });
    await expect(popup).toBeVisible();
    const popupWidth = (await popup.boundingBox())!.width;
    const typeButton = popup.getByRole('button', { name: /^Loại đơn:/ });
    const neutralBackground = await typeButton.evaluate(node => getComputedStyle(node).backgroundColor);
    async function selectType(name: string) {
      await typeButton.click();
      await page.getByRole('radiogroup', { name: 'Loại đơn' }).getByRole('radio', { name, exact: true }).click();
      expect((await popup.boundingBox())!.width).toBeCloseTo(popupWidth);
      await expect(typeButton).toHaveCSS('background-color', neutralBackground);
    }
    const today = todayInVietnam();
    await popup.getByLabel('Số ngày').fill('2,5');
    await expect(popup.getByRole('button', { name: 'Đến ngày, ' + formatTaskDate(shiftDay(today, 2)) })).toBeVisible();
    const dateButton = popup.getByRole('button', { name: /^Đến ngày,/ });
    await dateButton.scrollIntoViewIfNeeded();
    const daysY = (await popup.getByLabel('Số ngày').boundingBox())!.y;
    await dateButton.click();
    const dateCalendar = page.getByRole('dialog', { name: 'Đến ngày', exact: true });
    await expect(dateCalendar.getByRole('button', { name: 'Tháng sau', exact: true })).toBeVisible();
    expect((await popup.getByLabel('Số ngày').boundingBox())!.y).toBeCloseTo(daysY);
    if (today.slice(0, 7) !== shiftDay(today, 2).slice(0, 7)) {
      await dateCalendar.getByRole('button', { name: 'Tháng trước', exact: true }).click();
    }
    await dateCalendar.getByRole('button', { name: 'Ngày ' + formatTaskDate(today), exact: true }).click();
    await expect(popup.getByLabel('Số ngày')).toHaveValue('1');
    await selectType('Công tác');
    await expect(popup.getByLabel('Địa điểm công tác')).toBeVisible();
    await selectType('Làm thêm giờ');
    await expect(popup.getByRole('button', { name: /^Ngày,/ })).toBeVisible();
    await expect(popup.getByRole('button', { name: /^Đến ngày,/ })).toHaveCount(0);
    const hours = popup.getByLabel('Số giờ làm thêm');
    await hours.pressSequentially('2,5');
    await expect(hours).toHaveValue('2,5');
    await hours.fill('1.25');
    await expect(hours).toHaveValue('1.25');
    const taskTitle = 'Kiểm tra giao diện trên điện thoại';
    const taskChoice = popup.getByRole('checkbox', { name: taskTitle });
    await expect(taskChoice).toHaveText(taskTitle);
    await taskChoice.click();
    await popup.getByLabel('Tìm công việc phụ trách').fill('cap nhat');
    await popup.getByRole('checkbox', { name: 'Cập nhật hướng dẫn bàn giao' }).click();
    await expect(popup.getByText('Công việc phụ trách · Đã chọn 2')).toBeVisible();
    await expect(popup.getByRole('button', { name: 'Bỏ chọn ' + taskTitle })).toBeVisible();
    const overtimeReason = 'Làm thêm kiểm thử ' + Date.now();
    await popup.getByLabel('Lý do làm thêm giờ').fill(overtimeReason);
    await popup.getByRole('button', { name: 'Gửi đơn' }).click();
    await expect(popup).toHaveCount(0);
    const savedOvertime = await findRequest(overtimeReason);
    overtimeId = savedOvertime.name.split('/').at(-1);
    expect(savedOvertime.fields.overtime.mapValue.fields.tasks.arrayValue.values
      .map((item: { mapValue: { fields: { id: { stringValue: string } } } }) => item.mapValue.fields.id.stringValue))
      .toEqual(['kiem-tra-giao-dien', 'cap-nhat-huong-dan']);
    await page.getByTestId(`request-${overtimeId}`).click();
    await expect(page.getByText('Công việc phụ trách · Đã chọn 2')).toBeVisible();
    await expect(page.getByText(/^Người tạo ·/)).toHaveCount(0);
    await page.getByRole('button', { name: 'Xóa đơn', exact: true }).click();
    const deletePopup = page.getByRole('alertdialog', { name: 'Xác nhận xóa đơn' });
    await expect(deletePopup.getByRole('button', { name: 'Hủy' })).toBeFocused();
    await deletePopup.getByRole('button', { name: 'Hủy' }).click();
    await expect(deletePopup).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Chi tiết đơn' })).toBeVisible();
    await page.getByRole('button', { name: 'Đóng đơn' }).click();
    await page.getByRole('button', { name: '+ Tạo đơn' }).click();
    await selectType('Đề xuất khác');
    await selectType('Tạm ứng lương');
    await page.getByLabel('Lý do / nội dung').fill(reason);
    await page.getByRole('button', { name: 'Gửi đơn' }).click();
    await expect(page.getByRole('alert')).toContainText('Nhập số tiền tạm ứng');
    await page.getByLabel('Số tiền tạm ứng (VND)').fill('750000');
    await expect(page.getByLabel('Số tiền tạm ứng (VND)')).toHaveValue('750.000');
    const month = today.slice(5, 7);
    const year = today.slice(0, 4);
    await popup.getByRole('button', { name: `Đổi tháng năm, ${month}/${year}` }).click();
    const monthCalendar = page.getByRole('dialog', { name: 'Trừ vào lương tháng' });
    await monthCalendar.getByRole('button', { name: 'Năm sau' }).click();
    await monthCalendar.getByRole('button', { name: 'Tháng 01' }).click();
    await expect(popup.getByRole('button', { name: `Đổi tháng năm, 01/${Number(year) + 1}` })).toBeVisible();
    await page.getByRole('button', { name: 'Gửi đơn' }).click();
    await expect(page.getByRole('heading', { name: 'Tạo đơn', exact: true })).toHaveCount(0);
    id = (await findRequest(reason)).name.split('/').at(-1);
    await expect(requestCard(page)).toContainText('Ngày tạo:');
    await expect(requestCard(page)).not.toContainText(reason);
    await requestCard(page).click();
    await expect(page.getByRole('heading', { name: 'Chi tiết đơn' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Duyệt', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Đóng đơn' }).click();

    await openRequests(admin, 'Đăng nhập quản trị (mô phỏng)');
    await requestCard(admin).click();
    await admin.getByRole('checkbox', { name: 'Người giao việc demo', exact: true }).click();
    await admin.getByRole('button', { name: 'Lưu người duyệt' }).click();
    await expect(admin.getByRole('heading', { name: 'Chi tiết đơn' })).toHaveCount(0);

    await openRequests(reviewer, 'Đăng nhập người giao việc (mô phỏng)');
    await reviewer.getByRole('button', { name: 'Mở menu' }).click();
    await reviewer.getByRole('dialog').getByRole('button', { name: 'Phê duyệt', exact: true }).click();
    const queuedRequest = reviewer.getByRole('button', { name: 'Mở hồ sơ: Tạm ứng lương: ' + reason, exact: true });
    await queuedRequest.click();
    await reviewer.getByRole('button', { name: 'Từ chối', exact: true }).click();
    await expect(reviewer.getByRole('alert')).toContainText('Nhập lý do từ chối');
    await reviewer.getByLabel('Ý kiến xử lý').fill('Đã kiểm tra');
    await reviewer.getByRole('button', { name: 'Duyệt', exact: true }).click();
    await expect(reviewer.getByRole('heading', { name: 'PHÊ DUYỆT', exact: true })).toBeVisible();
    await expect(queuedRequest).toHaveCount(0);
    await reviewer.getByRole('button', { name: 'Mở menu' }).click();
    await reviewer.getByRole('dialog').getByRole('button', { name: 'Đơn từ', exact: true }).click();
    await expect(requestCard(page)).toContainText('Đã duyệt');
    const expense = await request.get(documents + '/cash/tu_' + id, { headers });
    expect(expense.ok()).toBeTruthy();
    expect((await expense.json()).fields).toMatchObject({
      amount: { integerValue: '750000' }, status: { stringValue: 'Chờ duyệt' }, requestId: { stringValue: id },
    });

    const adminOvertime = admin.getByTestId(`request-${overtimeId}`);
    await adminOvertime.click();
    await admin.getByRole('checkbox', { name: 'Người giao việc demo', exact: true }).click();
    await admin.getByRole('button', { name: 'Lưu người duyệt' }).click();
    await page.getByRole('button', { name: 'Mở menu' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Chấm công', exact: true }).click();
    const attendanceRow = page.getByRole('table').getByRole('row')
      .filter({ hasText: ' · ' + today.slice(8) + '/' + today.slice(5, 7) });
    const workedCell = attendanceRow.getByRole('cell').nth(2);
    await expect(workedCell).toBeVisible();
    const before = (await workedCell.innerText()).trim();
    const [hour, minute] = before === '–' ? [0, 0] : before.split(':').map(Number);
    const total = hour * 60 + minute + 75;
    const approvedTotal = [Math.floor(total / 60), total % 60].map(part => String(part).padStart(2, '0')).join(':');
    await reviewer.getByTestId(`request-${overtimeId}`).click();
    await reviewer.getByRole('button', { name: 'Duyệt', exact: true }).click();
    await expect(workedCell).toHaveText(approvedTotal);
    await expect(adminOvertime).toContainText('Đã duyệt');
    const rowDelete = adminOvertime.locator('..').getByRole('button', { name: /^Xóa đơn Làm thêm giờ ngày / });
    await rowDelete.click();
    const rowConfirmation = admin.getByRole('alertdialog', { name: 'Xác nhận xóa đơn' });
    await expect(rowConfirmation).toContainText('Làm thêm giờ');
    await rowConfirmation.getByRole('button', { name: 'Hủy' }).click();
    await expect(adminOvertime).toBeVisible();
    await rowDelete.click();
    await rowConfirmation.getByRole('button', { name: 'Xác nhận xóa', exact: true }).click();
    await expect(adminOvertime).toHaveCount(0);
    await expect(workedCell).toHaveText(before);
  } finally {
    await admin.close();
    await reviewer.close();
    if (id) {
      await request.delete(documents + '/cash/tu_' + id, { headers });
      await request.delete(documents + '/requests/' + id, { headers });
    }
    if (overtimeId) await request.delete(documents + '/requests/' + overtimeId, { headers });
  }
});

test('Chấm công trong app, kiểm tra bán kính và điều chỉnh công từ tài khoản quản trị', async ({ page, browser, request }) => {
  test.setTimeout(90_000);
  const employee = 'nhanvien@example.test';
  const host = process.env.EXPO_PUBLIC_EMULATOR_HOST || '127.0.0.1';
  const emulator = `http://${host}:${process.env.EXPO_PUBLIC_FIRESTORE_EMULATOR_PORT || 8080}/v1/projects/demo-marchix-mobile/databases/(default)/documents`;
  const headers = { Authorization: 'Bearer owner' };
  const today = new Date();
  const local = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const record = emulator + '/attendance/' + employee + '_' + local;
  const dailyNote = emulator + '/members/' + employee + '/attendanceNotes/' + local;
  const settings = emulator + '/settings/work';
  const adjustmentReason = 'Xác nhận giờ làm từ bản thử ' + Date.now();
  const firstNote = 'Đi gặp khách hàng sau ca ' + Date.now();
  const noteText = firstNote + ' (đã cập nhật)';
  const previousNote = await request.get(dailyNote, { headers });
  const savedNote = previousNote.ok() ? (await previousNote.json()).fields : null;
  const previousRecord = await request.get(record, { headers });
  const savedRecord = previousRecord.ok() ? (await previousRecord.json()).fields : null;
  const previousSettings = await request.get(settings, { headers });
  const savedSettings = previousSettings.ok() ? (await previousSettings.json()).fields : null;
  await request.delete(record, { headers });
  const configured = await request.patch(settings, { headers, data: { fields: {
    ...savedSettings, gpsOn: { booleanValue: true }, gpsLat: { doubleValue: 10.77 },
    gpsLng: { doubleValue: 106.69 }, gpsRadius: { integerValue: '200' },
    days: { mapValue: { fields: { [today.getDay()]: { integerValue: '1' } } } },
  } } });
  expect(configured.ok()).toBe(true);

  async function openAttendance(target: typeof page, account: string) {
    await target.goto(previewUrl);
    await target.getByRole('button', { name: account }).click();
    await target.getByRole('button', { name: 'Mở menu' }).click();
    await target.getByRole('dialog').getByRole('button', { name: 'Chấm công', exact: true }).click();
    await expect(target.getByRole('heading', { name: 'Chấm công', exact: true })).toBeVisible();
  }

  const admin = await browser.newPage({ ...devices['iPhone 13'] });
  try {
    await page.setViewportSize({ width: 678, height: 794 });
    await page.context().grantPermissions(['geolocation']);
    await page.context().setGeolocation({ latitude: 10.7719, longitude: 106.69 });
    await openAttendance(page, 'Đăng nhập Google (mô phỏng)');
    const personalHeading = page.getByRole('heading', { name: 'Bảng công của bạn' });
    await expect(personalHeading).toBeVisible();
    await expect(page.getByText(/^Ngày:.*\d{2}\/\d{2}\/\d{4}$/)).toBeVisible();
    await expect(page.getByText(/^Ca làm việc:.*\d{2}:\d{2}–\d{2}:\d{2}$/)).toBeVisible();
    const liveClock = page.getByText(/^\d{2}:\d{2}:\d{2}$/).first();
    const initialTime = await liveClock.textContent();
    await expect.poll(() => liveClock.textContent()).not.toBe(initialTime);
    const checkIn = page.getByRole('button', { name: 'Chấm công vào', exact: true });
    const punchPanel = await checkIn.locator('..').boundingBox();
    const personalPanel = await personalHeading.locator('../..').boundingBox();
    expect(punchPanel?.width).toBeCloseTo(personalPanel!.width);
    const deniedPage = await browser.newPage();
    try {
      const cdp = await deniedPage.context().newCDPSession(deniedPage);
      const { targetInfo } = await cdp.send('Target.getTargetInfo');
      await cdp.send('Browser.setPermission', {
        permission: { name: 'geolocation' },
        setting: 'denied',
        browserContextId: targetInfo.browserContextId,
      });
      await openAttendance(deniedPage, 'Đăng nhập Google (mô phỏng)');
      expect(await deniedPage.evaluate(async () =>
        (await navigator.permissions.query({ name: 'geolocation' })).state)).toBe('denied');
      await deniedPage.getByRole('button', { name: 'Chấm công vào', exact: true }).click();
      await expect(deniedPage.getByRole('alert')).toHaveText(
        'Cần cấp quyền truy cập vị trí để chấm công. Hãy cấp quyền vị trí rồi thử lại.');
      expect((await request.get(record, { headers })).status()).toBe(404);
    } finally {
      await deniedPage.close();
    }

    await checkIn.click();
    await expect(page.getByRole('alert')).toContainText('Bạn cách văn phòng 211 m. Bán kính cho phép là 200 m.');
    expect((await request.get(record, { headers })).status()).toBe(404);
    const noteInput = page.getByLabel('Ghi chú hôm nay');
    const saveNote = page.getByRole('button', { name: 'Lưu ghi chú' });
    await noteInput.fill(firstNote);
    await saveNote.click();
    await expect(page.getByRole('table').getByText(firstNote, { exact: true })).toBeVisible();
    await expect(saveNote).toBeDisabled();
    await expect(noteInput).toHaveValue(firstNote);
    await noteInput.fill(noteText);
    await saveNote.click();
    await expect(page.getByRole('table').getByText(noteText, { exact: true })).toBeVisible();
    await expect(saveNote).toBeDisabled();
    await expect(noteInput).toHaveValue(noteText);
    expect((await request.get(record, { headers })).status()).toBe(404);

    await page.context().setGeolocation({ latitude: 10.7717, longitude: 106.69 });
    await checkIn.click();
    const completedNotice = page.getByText('Đã chấm công cho ngày hôm nay.', { exact: true });
    await expect(page.getByRole('button', { name: 'Chấm công ra', exact: true })).toBeVisible();
    await expect(completedNotice).toHaveCount(0);
    const checkOut = page.getByRole('button', { name: 'Chấm công ra', exact: true });
    const beforeCheckOut = await request.get(record, { headers });
    expect(beforeCheckOut.ok()).toBe(true);
    const { fields: checkInFields } = await beforeCheckOut.json();
    expect(checkInFields.inTs?.timestampValue).toBeTruthy();
    expect(checkInFields.outTs?.timestampValue).toBeUndefined();

    await page.context().setGeolocation({ latitude: 10.7719, longitude: 106.69 });
    await checkOut.click();
    await expect(page.getByRole('alert')).toContainText('Bạn cách văn phòng 211 m. Bán kính cho phép là 200 m.');
    await expect(checkOut).toBeEnabled();
    await expect(completedNotice).toHaveCount(0);
    const blockedCheckOut = await request.get(record, { headers });
    expect(blockedCheckOut.ok()).toBe(true);
    expect((await blockedCheckOut.json()).fields).toEqual(checkInFields);

    await page.context().setGeolocation(null);
    expect(await page.evaluate(async () => (await navigator.permissions.query({ name: 'geolocation' })).state)).toBe('granted');
    await checkOut.click();
    await expect(page.getByRole('alert')).toHaveText('Không lấy được vị trí. Hãy bật GPS rồi thử lại.');
    await expect(checkOut).toBeEnabled();
    await expect(completedNotice).toHaveCount(0);
    const unavailableCheckOut = await request.get(record, { headers });
    expect(unavailableCheckOut.ok()).toBe(true);
    expect((await unavailableCheckOut.json()).fields).toEqual(checkInFields);

    await page.context().setGeolocation({ latitude: 10.7717, longitude: 106.69 });
    await checkOut.click();
    await expect(completedNotice).toBeVisible();
    await expect(page.getByRole('button', { name: /^Chấm công (vào|ra)/ })).toHaveCount(0);
    await expect(page.getByText('Cần xác minh giờ vào/ra', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Chọn tháng', { exact: true })).toHaveCount(0);
    const monthButton = await page.getByRole('button', { name: /^Chọn tháng:/ }).boundingBox();
    const exportButton = await page.getByRole('button', { name: 'Xuất Excel' }).boundingBox();
    expect(monthButton?.y).toBeCloseTo(exportButton!.y);
    const dayHeaders = page.getByRole('table').getByRole('rowheader');
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    await expect(dayHeaders).toHaveCount(lastDay);
    await expect(dayHeaders.first()).toContainText('01/' + local.slice(5, 7));
    await expect(dayHeaders.last()).toContainText(lastDay + '/' + local.slice(5, 7));
    await expect.poll(async () => {
      const response = await request.get(record, { headers });
      const { fields } = await response.json();
      return [fields?.inDist?.integerValue, fields?.outDist?.integerValue];
    }).toEqual(['189', '189']);

    await openAttendance(admin, 'Đăng nhập quản trị (mô phỏng)');
    await expect(admin.getByRole('heading', { name: 'Bảng chấm công toàn công ty' })).toBeVisible();
    const day = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][today.getDay()];
    const dateLabel = day + ' · ' + local.slice(8) + '/' + local.slice(5, 7);
    const companyTable = admin.getByRole('table');
    await expect(companyTable.getByRole('columnheader', { name: 'HỌ TÊN' })).toBeVisible();
    const monthPicker = admin.getByRole('button', { name: /^Chọn tháng:/ });
    const monthOptions = admin.getByRole('radiogroup', { name: 'Chọn tháng' }).getByRole('radio');
    const currentMonth = 'Tháng ' + local.slice(5, 7) + '/' + local.slice(0, 4);
    await expect(monthPicker).toHaveAccessibleName('Chọn tháng: ' + currentMonth);
    await monthPicker.click();
    await monthOptions.nth(1).click();
    await expect(monthPicker).not.toHaveAccessibleName('Chọn tháng: ' + currentMonth);
    await monthPicker.click();
    await monthOptions.first().click();
    await expect(monthPicker).toHaveAccessibleName('Chọn tháng: ' + currentMonth);
    const tableScroller = admin.getByLabel('Bảng công theo nhân viên và ngày');
    const nameHeader = companyTable.getByRole('columnheader', { name: 'HỌ TÊN' });
    const employeeName = companyTable.getByRole('rowheader', { name: 'Nhân viên demo' });
    const x = (element: Element) => element.getBoundingClientRect().x;
    const headerLeft = await nameHeader.evaluate(x);
    const nameLeft = await employeeName.evaluate(x);
    expect(await tableScroller.evaluate(element => {
      element.scrollLeft = element.scrollWidth;
      return element.scrollLeft;
    })).toBeGreaterThan(0);
    expect(await nameHeader.evaluate(x)).toBeCloseTo(headerLeft);
    expect(await employeeName.evaluate(x)).toBeCloseTo(nameLeft);
    await tableScroller.evaluate(element => { element.scrollLeft = 0; });
    await companyTable.getByRole('button', { name: 'Sửa công Nhân viên demo, ' + dateLabel }).click();
    await admin.getByLabel('Giờ vào điều chỉnh').fill('08:30');
    await admin.getByLabel('Giờ ra điều chỉnh').fill('17:00');
    await admin.getByRole('radio', { name: '1', exact: true }).click();
    await admin.getByLabel('Lý do điều chỉnh').fill(adjustmentReason);
    await admin.getByRole('button', { name: 'Lưu điều chỉnh' }).click();
    await expect(page.getByText(new RegExp(adjustmentReason)).first()).toBeVisible();
    const personalRow = page.getByRole('table').getByRole('row').filter({ hasText: adjustmentReason });
    await expect(personalRow.getByText('07:30', { exact: true })).toBeVisible();
    await expect(personalRow).toContainText(noteText);
    await expect(personalRow).not.toContainText(/Chấm công (vào|ra)/i);
    const workCell = personalRow.getByRole('cell').filter({ hasText: /^x$/ });
    await expect(workCell).toHaveCSS('background-color', 'rgb(255, 240, 213)');
    for (const text of ['Muộn 30 phút', 'Sớm 30 phút']) {
      await expect(page.getByText(text, { exact: true }).first()).toHaveCSS('color', 'rgb(158, 52, 43)');
    }

    for (const [target, filename, header] of [[admin, 'cong-ty', 'HỌ TÊN'], [page, 'ca-nhan', 'NGÀY']] as const) {
      const downloadPromise = target.waitForEvent('download');
      await target.getByRole('button', { name: 'Xuất Excel' }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe('Bang-cong-' + filename + '-' + local.slice(0, 7) + '.xlsx');
      const filePath = await download.path();
      const workbook = read(await readFile(filePath!));
      const rows = utils.sheet_to_json<(string | number)[]>(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
      expect(rows[0][0]).toBe(header);
      if (target === admin) {
        const employeeRow = rows.find(row => row[0] === 'Nhân viên demo');
        expect(employeeRow?.[Number(local.slice(8))]).toBe('x');
        expect(employeeRow?.at(-2)).toBe('1 (30′)');
      } else {
        expect(rows.find(row => row[0] === dateLabel)).toEqual([
          dateLabel, '08:30', '17:00', '07:30', 'x',
          [adjustmentReason, noteText].join('\n'),
        ]);
      }
    }
    const { fields } = await (await request.get(record, { headers })).json();
    expect(fields.inTs.timestampValue).toBeTruthy();
    expect(fields.outTs.timestampValue).toBeTruthy();
    await companyTable.getByRole('button', { name: 'Sửa công Nhân viên demo, ' + dateLabel }).click();
    const deleteAttendance = admin.getByRole('button', { name: 'Xóa bản ghi chấm công', exact: true });
    await deleteAttendance.click();
    const attendanceConfirmation = admin.getByRole('alertdialog', { name: 'Xác nhận xóa bản ghi chấm công' });
    await expect(attendanceConfirmation).toContainText('Nhân viên demo');
    await attendanceConfirmation.getByRole('button', { name: 'Hủy' }).click();
    await expect(admin.getByLabel('Giờ vào điều chỉnh')).toHaveValue('08:30');
    await deleteAttendance.click();
    await attendanceConfirmation.getByRole('button', { name: 'Xác nhận xóa', exact: true }).click();
    await expect(attendanceConfirmation).toBeHidden();
    expect((await request.get(record, { headers })).status()).toBe(404);

  } finally {
    await admin.close();
    if (savedNote) await request.patch(dailyNote, { headers, data: { fields: savedNote } });
    else await request.delete(dailyNote, { headers });
    if (savedRecord) await request.patch(record, { headers, data: { fields: savedRecord } });
    else await request.delete(record, { headers });
    if (savedSettings) await request.patch(settings, { headers, data: { fields: savedSettings } });
    else await request.delete(settings, { headers });
    const notifications = await request.post(emulator + ':runQuery', { headers, data: { structuredQuery: {
      from: [{ collectionId: 'notifications' }],
      where: { fieldFilter: { field: { fieldPath: 'body' }, op: 'EQUAL', value: { stringValue: adjustmentReason } } },
    } } });
    if (notifications.ok()) {
      for (const row of await notifications.json()) {
        if (row.document) await request.delete(emulator + '/notifications/' + row.document.name.split('/').pop(), { headers });
      }
    }
  }
});

test('Dự án lọc công việc theo dự án và mở popup trên trang Công việc', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(previewUrl);
  await page.getByRole('button', { name: 'Đăng nhập Google (mô phỏng)' }).click();
  async function openProject() {
    await page.getByRole('button', { name: 'Mở menu' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Dự án', exact: true }).click();
    await page.getByRole('region', { name: 'Danh sách dự án' })
      .getByRole('button', { name: /^Chọn dự án:/ }).click();
    await page.getByRole('radiogroup', { name: 'Chọn dự án' })
      .getByRole('radio', { name: 'Marchix Mobile · Demo', exact: true }).click();
  }
  await openProject();
  const list = page.getByRole('region', { name: 'Danh sách dự án' });
  const profile = page.getByRole('region', { name: 'Thông tin dự án' });
  await expect(page.getByRole('heading', { name: 'DỰ ÁN', exact: true })).toBeVisible();
  await expect(list.getByRole('heading', { name: 'DỰ ÁN', exact: true })).toHaveCount(0);
  await expect(profile.getByRole('heading', { name: 'Marchix Mobile · Demo' })).toBeVisible();
  await expect(profile).toContainText('Mã dự án: DA-marchix-mobile-demo');
  await expect(profile).toContainText('Thời gian: 10/11/2026 → 30/11/2026');
  await expect(profile).toContainText('Người phụ trách: Người giao việc demo');
  const overview = page.getByRole('region', { name: 'Tổng quan', exact: true });
  await expect(overview).toContainText('Mục tiêu / kết quả bàn giao: Bàn giao bản thử trên điện thoại.');
  await expect(overview).toContainText('Giai đoạn hiện tại: Kiểm thử nội bộ');
  await expect(overview).toContainText('Rủi ro / cần quyết định: Xác nhận luồng đăng nhập trên thiết bị thật.');
  await expect(overview).toContainText('Mô tả ngắn: Dữ liệu thử nghiệm.');
  const tabs = profile.getByRole('tablist').getByRole('tab');
  await expect(tabs).toHaveCount(3);
  const positions = await tabs.evaluateAll(items => items.map(item => item.getBoundingClientRect().top));
  expect(new Set(positions).size).toBe(1);
  await expect(page.getByRole('button', { name: '+ Thêm dự án' })).toHaveCount(0);

  await profile.getByRole('tab', { name: 'Tài chính', exact: true }).click();
  const finance = page.getByRole('region', { name: 'Tài chính', exact: true });
  await expect(finance.getByRole('heading', { name: 'Tài chính dự án' })).toBeVisible();
  await expect(finance.getByText(/Trần vốn dự án/)).toBeVisible();
  const work = page.getByRole('region', { name: 'Công việc đính kèm', exact: true });
  await profile.getByRole('tab', { name: 'Công việc đính kèm' }).click();
  await expect(work.getByRole('heading', { name: 'Việc trong dự án' })).toBeVisible();
  await expect(work.getByRole('heading', { name: 'Mốc bàn giao' })).toHaveCount(0);
  await expect(work.getByRole('button', { name: 'Mở công việc: Xác nhận phạm vi bản thử' })).toBeVisible();
  await expect(work.getByRole('button', { name: 'Mở công việc: Cập nhật hướng dẫn bàn giao' })).toHaveCount(0);
  await expect(work.getByRole('button', { name: 'Mở Kanban dự án' })).toHaveCount(0);
  await expect(work.getByRole('button', { name: /^Kiểm tra giao diện trên điện thoại/ })).toHaveCount(0);
  await work.getByRole('button', { name: 'Bảng Kanban' }).click();
  await work.getByRole('button', { name: 'Mở công việc: Kiểm tra giao diện trên điện thoại' }).click();
  const popup = page.getByRole('dialog', { name: 'Chi tiết công việc' });
  await expect(popup.getByRole('heading', { name: 'Kiểm tra giao diện trên điện thoại' })).toBeVisible();
  await popup.getByRole('button', { name: 'Đóng chi tiết công việc' }).click();
  await expect(popup).toBeHidden();
  await expect(page.getByRole('heading', { name: 'CÔNG VIỆC', exact: true })).toBeVisible();

  await openProject();
  await profile.getByRole('tab', { name: 'Công việc đính kèm' }).click();
  await work.getByRole('button', { name: 'Mở công việc: Kiểm tra giao diện trên điện thoại' }).click();
  await expect(popup.getByRole('heading', { name: 'Kiểm tra giao diện trên điện thoại' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(popup).toBeHidden();
});

test('Tổng quan mở mặc định sau đăng nhập và dùng dữ liệu theo vai trò', async ({ page, browser }) => {
  test.setTimeout(60_000);
  const admin = await browser.newPage({ ...devices['iPhone 13'] });
  async function openOverview(target: typeof page, login: string) {
    await target.goto(previewUrl);
    await target.getByRole('button', { name: login }).click();
    await expect(target.getByRole('heading', { name: 'Tổng quan', exact: true })).toBeVisible();
  }

  try {
    await openOverview(page, 'Đăng nhập Google (mô phỏng)');
    const taskRing = page.getByLabel(/\d+ việc đang mở/);
    await expect(taskRing).toBeVisible();
    const legendRow = page.getByRole('button', { name: /Đang mở khác/ });
    const ringBox = (await taskRing.boundingBox())!;
    const legendBox = (await legendRow.boundingBox())!;
    expect(ringBox.y + ringBox.height).toBeLessThan(legendBox.y);
    expect(Math.abs(ringBox.x + ringBox.width / 2 - legendBox.x - legendBox.width / 2)).toBeLessThan(2);
    await expect(page.getByRole('heading', { name: 'Dòng tiền thực tế' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Thu chi đến hạn' })).toHaveCount(0);
    await legendRow.click();
    await page.getByRole('button', { name: /Đối chiếu checklist phát hành/ }).click();
    await expect(page.getByRole('heading', { name: 'Đối chiếu checklist phát hành' })).toBeVisible();
    await page.getByRole('button', { name: '‹ Tổng quan', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Tổng quan', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /^(Cảnh báo|Phê duyệt)/ })).toHaveCount(0);

    await openOverview(admin, 'Đăng nhập quản trị (mô phỏng)');
    await expect(admin.getByText('6 tháng gần nhất', { exact: true })).toBeVisible();
    const months = admin.getByRole('button', { name: /^Tháng \d+\/\d{4}$/ });
    await expect(months).toHaveCount(6);
    await expect(months.last()).toHaveAttribute('aria-pressed', 'true');
    await months.first().click();
    await expect(months.first()).toHaveAttribute('aria-pressed', 'true');
    await admin.getByRole('button', { name: 'Chi tiết công nợ' }).click();
    await expect(admin.getByText(/Chênh lệch/)).toBeVisible();
    await admin.getByRole('button', { name: /Cần quyết định \(\d+\)/ }).click();
    await expect(admin.getByRole('heading', { name: 'Việc cần quyết định' })).toBeVisible();
    await admin.getByRole('button', { name: /Marchix Mobile · Demo.*(mốc|việc)/ }).click();
    await expect(admin.getByRole('heading', { name: 'Marchix Mobile · Demo' })).toBeVisible();
  } finally {
    await admin.close();
  }
});

test('menu bên trái mở đúng mục và giữ điều hướng theo vai trò nhân viên', async ({ page }) => {
  await page.goto(previewUrl);
  await page.getByRole('button', { name: 'Đăng nhập Google (mô phỏng)' }).click();

  const openMenu = page.getByRole('button', { name: 'Mở menu' });
  const drawer = page.getByRole('dialog');
  await expect(page.getByRole('button', { name: 'Đăng xuất', exact: true })).toHaveCount(0);
  await openMenu.click();
  const items = drawer.getByRole('button');
  const labels = [
    'Đóng menu', 'Tổng quan', 'Công việc', 'Kế hoạch tuần', 'Phê duyệt', 'KPI',
    'Chấm công', 'Thu chi', 'Đơn từ', 'Phiếu lương', 'Dự án', 'Văn thư', 'Cài đặt', 'Đăng xuất',
  ];
  await expect(items).toHaveCount(labels.length);
  for (const [index, label] of labels.entries()) await expect(items.nth(index)).toHaveAccessibleName(label);

  await drawer.getByRole('button', { name: 'Cài đặt' }).click();
  await expect(drawer).toBeHidden();
  await expect(page.getByRole('tablist', { name: 'Nhóm cài đặt' }).getByRole('tab')).toHaveCount(1);
  await expect(page.getByRole('tab', { name: 'Chung' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Cài đặt' })).toBeVisible();
  const appearance = page.getByRole('radiogroup', { name: 'Chế độ hiển thị' });
  const heading = page.getByRole('heading', { name: 'Cài đặt' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(heading).toHaveCSS('color', 'rgb(245, 240, 252)');
  await appearance.getByRole('radio', { name: 'Sáng' }).click();
  await expect(heading).toHaveCSS('color', 'rgb(33, 25, 53)');
  await appearance.getByRole('radio', { name: 'Tối' }).click();
  await expect(heading).toHaveCSS('color', 'rgb(245, 240, 252)');
  await page.getByRole('radio', { name: 'Trước 1 ngày' }).click();
  await expect.poll(() => page.evaluate(() => [
    localStorage.getItem('marchix:theme'),
    localStorage.getItem('marchix:due-reminders:nhanvien@example.test'),
  ])).toEqual(['dark', '1']);
  await page.reload();
  await openMenu.click();
  await drawer.getByRole('button', { name: 'Cài đặt' }).click();
  await expect(appearance.getByRole('radio', { name: 'Tối' })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Trước 1 ngày' })).toBeChecked();

  await openMenu.click();
  await drawer.getByRole('button', { name: 'Phê duyệt' }).click();
  await expect(drawer).toBeHidden();
  await expect(page.getByRole('heading', { name: 'PHÊ DUYỆT', exact: true })).toBeVisible();

  await openMenu.click();
  await drawer.getByRole('button', { name: 'Công việc' }).click();
  await expect(page.getByRole('heading', { name: 'CÔNG VIỆC', exact: true })).toBeVisible();

  await openMenu.click();
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();

  await openMenu.click();
  await drawer.getByRole('button', { name: 'Kế hoạch tuần' }).click();
  await expect(drawer).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Kế hoạch tuần' })).toBeVisible();

  await openMenu.click();
  const logout = drawer.getByRole('button', { name: 'Đăng xuất', exact: true });
  const confirmation = drawer.getByRole('alertdialog', { name: 'Xác nhận đăng xuất' });
  await logout.click();
  await expect(confirmation.getByRole('button', { name: 'Hủy' })).toBeFocused();
  await confirmation.getByRole('button', { name: 'Hủy' }).click();
  await expect(confirmation).toBeHidden();
  await expect(logout).toBeFocused();
  await logout.click();
  await page.keyboard.press('Escape');
  await expect(confirmation).toBeHidden();
  await expect(drawer).toBeVisible();
  await logout.click();
  await confirmation.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await expect(drawer).toBeHidden();
  await expect(page.getByRole('button', { name: 'Đăng nhập Google (mô phỏng)' })).toBeVisible();
});

test('KPI đọc điểm đã chốt, tính điểm theo dự án và giới hạn theo vai trò', async ({ page, browser, request }) => {
  test.setTimeout(60_000);
  const host = process.env.EXPO_PUBLIC_EMULATOR_HOST || '127.0.0.1';
  const emulator = `http://${host}:8080/v1/projects/demo-marchix-mobile/databases/(default)/documents`;
  const headers = { Authorization: 'Bearer owner' };
  const employee = 'nhanvien@example.test';
  const colleague = 'dongnghiep@example.test';
  const month = '2025-03';
  const task = { assigneeEmail: employee, title: 'KPI thử nghiệm', priority: 'Cao',
    due: month + '-10', status: 'Chờ duyệt', rating: 'Khá', projectId: 'marchix-mobile-demo' };
  const paths = [
    ['tasks/kpi-test-late', { ...task, doneAt: month + '-10T17:00:00.000Z' }],
    ['tasks/kpi-test-missing-date', { ...task, priority: 'Thấp' }],
    ['kpi/kpi-test-staff', { email: employee, month, total: 2, onTime: 2, late: 0, missed: 0, pending: 0,
      pct: '92', grade: 'A', lockedAt: '2025-04-01T00:00:00.000Z' }],
    ['kpi/kpi-test-colleague', { email: colleague, month, total: 1, onTime: 1, late: 0, missed: 0, pending: 0, pct: 100 }],
  ] as const;
  async function openKpi(target: typeof page, login: string) {
    await target.goto(previewUrl);
    await target.getByRole('button', { name: login }).click();
    await target.getByRole('button', { name: 'Mở menu' }).click();
    await target.getByRole('dialog').getByRole('button', { name: 'KPI', exact: true }).click();
    await target.getByRole('button', { name: /^Tháng:/ }).click();
    await target.getByRole('radio', { name: 'Tháng 03/2025', exact: true }).click();
  }

  const admin = await browser.newPage({ ...devices['iPhone 13'] });
  try {
    const seeded = await Promise.all(paths.map(([path, values]) => request.patch(`${emulator}/${path}`, {
      headers, data: { fields: Object.fromEntries(Object.entries(values).map(([key, value]) =>
        [key, typeof value === 'number' ? { integerValue: String(value) } : { stringValue: value }])) },
    })));
    for (const response of seeded) expect(response.ok()).toBe(true);
    await openKpi(page, 'Đăng nhập Google (mô phỏng)');
    await expect(page.getByText('Điểm đã chốt tự động ngày 01/04/2025.')).toBeVisible();
    await expect(page.getByText('92%', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Đồng nghiệp demo' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Dự án: Toàn công ty' }).click();
    await page.getByRole('radio', { name: 'Marchix Mobile · Demo' }).click();
    await expect(page.getByText('45%', { exact: true })).toBeVisible();
    await expect(page.getByText('Xếp loại D')).toBeVisible();
    await openKpi(admin, 'Đăng nhập quản trị (mô phỏng)');
    await expect(admin.getByRole('heading', { name: 'Đồng nghiệp demo' })).toBeVisible();
    await expect(admin.getByText('100%', { exact: true })).toBeVisible();
  } finally {
    await admin.close();
    await Promise.all(paths.map(([path]) => request.delete(`${emulator}/${path}`, { headers })));
  }
});

test('Kế hoạch tuần lọc việc theo hạn, chọn tuần trên lịch và cho phép sửa nội dung đã lưu', async ({ page, browser, request }) => {
  test.setTimeout(120_000);
  const week = mondayOf(todayInVietnam());
  const previousWeek = shiftDay(week, -7);
  const nextWeek = shiftDay(week, 7);
  const farWeek = shiftDay(week, 21);
  const calendarDay = shiftDay(nextWeek, 2);
  const employee = 'nhanvien@example.test';
  const host = process.env.EXPO_PUBLIC_EMULATOR_HOST || '127.0.0.1';
  const documents = `http://${host}:8080/v1/projects/demo-marchix-mobile/databases/(default)/documents`;
  const headers = { Authorization: 'Bearer owner' };
  const plan = `${documents}/weekPlans/${employee}_${week}`;
  const farPlan = `${documents}/weekPlans/${employee}_${farWeek}`;
  const prior = await request.get(plan, { headers });
  const priorFields = prior.ok() ? (await prior.json()).fields : null;
  const priorFar = await request.get(farPlan, { headers });
  const priorFarFields = priorFar.ok() ? (await priorFar.json()).fields : null;
  const taskId = `test-week-plan-${Date.now()}`;
  const taskPath = `${documents}/tasks/${taskId}`;
  const doneTaskPath = taskPath + '-done';
  const farTaskPath = taskPath + '-far';
  const farTaskTitle = 'Công việc gợi ý trong tuần xa';
  const title = 'Kiểm tra công việc đến hạn trong tuần';
  const fields = (values: Record<string, string>) =>
    Object.fromEntries(Object.entries(values).map(([key, stringValue]) => [key, { stringValue }]));

  async function openFromMenu(target: typeof page) {
    await target.getByRole('button', { name: 'Mở menu' }).click();
    await target.getByRole('button', { name: 'Kế hoạch tuần', exact: true }).click();
  }
  async function openPlanning(target: typeof page, login: string) {
    await target.goto(previewUrl);
    await target.getByRole('button', { name: login }).click();
    await openFromMenu(target);
  }

  async function selectWeekOnCalendar(target: typeof page, from: string, day: string) {
    await target.getByRole('button', { name: 'Chọn tuần trên lịch' }).click();
    const calendar = target.getByRole('dialog', { name: 'Chọn tuần' });
    if (day.slice(0, 7) !== from.slice(0, 7)) await calendar.getByRole('button', { name: 'Tháng sau' }).click();
    await calendar.getByRole('button', { name: 'Ngày ' + formatTaskDate(day) }).click();
  }

  function weekRange(monday: string) {
    return formatTaskDate(monday) + ' – ' + formatTaskDate(shiftDay(monday, 6));
  }

  const admin = await browser.newPage(devices['iPhone 13']);
  try {
    expect((await request.patch(taskPath, { headers, data: { fields: fields({
      title, assigneeEmail: employee, status: 'Đang làm', due: shiftDay(week, 6),
    }) } })).ok()).toBeTruthy();
    expect((await request.patch(doneTaskPath, { headers, data: { fields: fields({
      title: 'Công việc được duyệt xong', assigneeEmail: employee, status: 'Xong',
      doneAt: shiftDay(week, -2) + 'T08:00:00Z', reviewedAt: shiftDay(week, -1) + 'T18:00:00Z',
    }) } })).ok()).toBeTruthy();
    expect((await request.patch(farTaskPath, { headers, data: { fields: fields({
      title: farTaskTitle, assigneeEmail: employee, status: 'Đang làm', due: farWeek,
    }) } })).ok()).toBeTruthy();
    expect((await request.patch(plan, { headers, data: { fields: fields({
      email: employee, week, priorities: 'Nội dung cũ', blockers: 'Hỗ trợ từ kế hoạch trên web', updatedAt: new Date().toISOString(),
    }) } })).ok()).toBeTruthy();

    await openPlanning(page, 'Đăng nhập Google (mô phỏng)');
    const suggestion = page.getByRole('button', { name: new RegExp(title) });
    await expect(suggestion).toBeVisible();
    await expect(page.getByRole('button', { name: /Đối chiếu checklist phát hành/ })).toHaveCount(0);
    await selectWeekOnCalendar(page, week, calendarDay);
    await expect(page.getByText(weekRange(nextWeek))).toBeVisible();
    await expect(suggestion).toHaveCount(0);
    const completed = week === '2026-11-09' ? 2 : 1;
    await expect(page.getByText(`Việc hoàn thành tuần trước: ${completed}`, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Tuần này' }).click();
    await suggestion.click();
    const task = page.getByRole('dialog', { name: 'Chi tiết công việc' });
    await expect(task).toBeVisible();
    await expect(task.getByText(title, { exact: true })).toBeVisible();
    await task.getByRole('button', { name: 'Đóng chi tiết công việc' }).click();
    await expect(page.getByRole('heading', { name: /^công việc$/i })).toBeVisible();
    await openFromMenu(page);
    await expect(page.getByRole('heading', { name: 'Kế hoạch đội nhóm' })).toHaveCount(0);

    const content = page.getByRole('textbox', { name: 'Nội dung kế hoạch' });
    await expect(content).toHaveValue('Nội dung cũ\n\nCần hỗ trợ · Hỗ trợ từ kế hoạch trên web');
    const updated = 'Hoàn tất kiểm thử và nghiệm thu trên Android';
    const save = page.getByRole('button', { name: 'Lưu kế hoạch', exact: true });
    await content.fill('Hoàn tất kiểm thử bản thử');
    await save.click();
    await expect(page.getByText('Đã lưu kế hoạch.', { exact: true })).toBeVisible();
    await content.fill(updated);
    await save.click();
    await expect(page.getByText('Đã lưu kế hoạch.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Tuần sau' }).click();
    await expect(content).not.toHaveValue(updated);
    await page.getByRole('button', { name: 'Tuần này' }).click();
    await expect(content).toHaveValue(updated);

    const farContent = 'Kế hoạch riêng cho tuần đã chọn';
    await selectWeekOnCalendar(page, week, farWeek);
    await expect(page.getByText(weekRange(farWeek))).toBeVisible();
    await content.fill(farContent);
    await save.click();
    await expect(page.getByText('Đã lưu kế hoạch.', { exact: true })).toBeVisible();
    const savedFar = await request.get(farPlan, { headers });
    expect(savedFar.ok()).toBeTruthy();
    const savedFields = (await savedFar.json()).fields;
    expect(savedFields.week.stringValue).toBe(farWeek);
    expect(savedFields.priorities.stringValue).toBe(farContent);

    await page.getByRole('button', { name: 'Tuần trước' }).click();
    await expect(page.getByText(weekRange(previousWeek))).toBeVisible();
    await page.getByRole('button', { name: 'Tuần này' }).click();
    await expect(content).toHaveValue(updated);
    await selectWeekOnCalendar(page, week, farWeek);
    await expect(content).toHaveValue(farContent);
    const unfinished = 'Nội dung đang nhập dở cho tuần xa';
    await content.fill(unfinished);
    const farSuggestion = page.getByRole('button', { name: new RegExp(farTaskTitle) });
    await farSuggestion.click();
    await expect(task.getByText(farTaskTitle, { exact: true })).toBeVisible();
    await task.getByRole('button', { name: 'Quay lại Kế hoạch tuần', exact: true }).click();
    await expect(task).toBeHidden();
    await expect(page.getByText(weekRange(farWeek))).toBeVisible();
    await expect(content).toHaveValue(unfinished);
    await expect(page.getByText('Có thay đổi chưa lưu', { exact: true })).toBeVisible();
    expect((await (await request.get(farPlan, { headers })).json()).fields.priorities.stringValue).toBe(farContent);
    await expect(farSuggestion).toBeVisible();
    await page.getByRole('button', { name: 'Tuần sau' }).click();
    await expect(page.getByText(weekRange(nextWeek))).toBeVisible();
    await expect(content).not.toHaveValue(farContent);
    await expect(content).not.toHaveValue(unfinished);
    const nextDraft = 'Bản nháp riêng cho tuần sau';
    await content.fill(nextDraft);

    await page.reload();
    await openFromMenu(page);
    await expect(content).toHaveValue(updated);
    await page.getByRole('button', { name: 'Tuần sau' }).click();
    await expect(content).toHaveValue(nextDraft);
    await page.getByRole('button', { name: 'Tuần này' }).click();
    await selectWeekOnCalendar(page, week, farWeek);
    await expect(content).toHaveValue(unfinished);
    await expect(page.getByText('Có thay đổi chưa lưu', { exact: true })).toBeVisible();
    await save.click();
    await expect(page.getByText('Đã lưu kế hoạch.', { exact: true })).toBeVisible();
    const draftKey = (monday: string) => `marchix:weekly-plan-drafts:${encodeURIComponent(employee)}:${monday}`;
    await expect.poll(() => page.evaluate(key => localStorage.getItem(key), draftKey(farWeek))).toBeNull();
    expect(await page.evaluate(key => localStorage.getItem(key), draftKey(nextWeek))).toBe(nextDraft);

    await openPlanning(admin, 'Đăng nhập quản trị (mô phỏng)');
    await expect(admin.getByRole('heading', { name: 'Kế hoạch đội nhóm' })).toBeVisible();
    await expect(admin.getByText(updated, { exact: true })).toBeVisible();
  } finally {
    await admin.close();
    await request.delete(taskPath, { headers });
    await request.delete(doneTaskPath, { headers });
    await request.delete(farTaskPath, { headers });
    if (priorFields) await request.patch(plan, { headers, data: { fields: priorFields } });
    else await request.delete(plan, { headers });
    if (priorFarFields) await request.patch(farPlan, { headers, data: { fields: priorFarFields } });
    else await request.delete(farPlan, { headers });
  }
});

test('Quản trị lưu các nhóm cài đặt trực tiếp trong ứng dụng', async ({ page }) => {
  const host = process.env.EXPO_PUBLIC_EMULATOR_HOST || '127.0.0.1';
  const port = process.env.EXPO_PUBLIC_FIRESTORE_EMULATOR_PORT || 8080;
  const base = `http://${host}:${port}/v1/projects/demo-marchix-mobile/databases/(default)/documents`;
  const headers = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
  const documents = ['settings/work', 'settings/budget', 'settings/payroll'];
  const originals = await Promise.all(documents.map(async path => {
    const response = await fetch(`${base}/${path}`, { headers });
    return response.ok ? (await response.json()).fields : undefined;
  }));
  const unique = Date.now();
  const memberEmail = `settings-${unique}@example.test`;
  const expenseName = `Chi phí kiểm thử ${unique}`;
  let recurringId: string | undefined;
  const openTab = async (name: string) => {
    const tab = page.getByRole('tab', { name, exact: true });
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
  };
  const read = async (path: string) => (await (await fetch(`${base}/${path}`, { headers })).json()).fields;

  try {
    await page.goto(previewUrl);
    await page.getByRole('button', { name: 'Đăng nhập quản trị (mô phỏng)' }).click();
    await page.getByRole('button', { name: 'Mở menu' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cài đặt' }).click();
    const labels = ['Chung', 'Tài khoản', 'Chi cố định', 'Công & việc', 'Ngân sách', 'Lương & BH'];
    await expect(page.getByRole('tab')).toHaveText(labels);

    await openTab(labels[1]);
    await page.getByRole('button', { name: '+ Thêm tài khoản' }).click();
    const accountPopup = page.getByRole('dialog', { name: 'Thêm tài khoản', exact: true });
    await accountPopup.getByRole('textbox', { name: 'Tên hiển thị' }).fill('Nhân viên kiểm thử');
    await accountPopup.getByRole('textbox', { name: 'Email Google' }).fill(memberEmail);
    await accountPopup.getByRole('button', { name: 'Lưu cài đặt' }).click();
    await expect(accountPopup).toBeHidden();
    await expect.poll(async () => (await read(`members/${memberEmail}`))?.role?.stringValue).toBe('staff');

    await openTab(labels[2]);
    await page.getByRole('button', { name: '+ Thêm khoản chi' }).click();
    const expensePopup = page.getByRole('dialog', { name: 'Thêm khoản chi', exact: true });
    await expensePopup.getByRole('textbox', { name: 'Tên khoản chi' }).fill(expenseName);
    await expensePopup.getByRole('textbox', { name: 'Số tiền / tháng' }).fill('85000');
    await expensePopup.getByRole('button', { name: 'Lưu cài đặt' }).click();
    await expect(expensePopup).toBeHidden();
    const deleteExpense = page.getByRole('button', { name: `Xóa khoản chi ${expenseName}`, exact: true });
    await expect(deleteExpense).toBeVisible();
    const { documents: recurring } = await (await fetch(`${base}/recurring`, { headers })).json();
    recurringId = recurring.find((item: { fields: { name: { stringValue: string } } }) =>
      item.fields.name.stringValue === expenseName).name.split('/').at(-1);
    const total = page.getByText(/^Tổng chi phí cố định tháng:/);
    const totalBeforeDelete = await total.textContent();
    await deleteExpense.click();
    const confirm = page.getByRole('alertdialog', { name: 'Xác nhận xóa khoản chi cố định' });
    await confirm.getByRole('button', { name: 'Hủy' }).click();
    await expect(deleteExpense).toBeVisible();
    await deleteExpense.click();
    await confirm.getByRole('button', { name: 'Xóa khoản chi' }).click();
    await expect(deleteExpense).toBeHidden();
    await expect(total).not.toHaveText(totalBeforeDelete ?? '');
    expect((await fetch(`${base}/recurring/${recurringId}`, { headers })).status).toBe(404);

    await openTab(labels[3]);
    await page.getByRole('button', { name: /^Giờ vào ca – Giờ:/ }).click();
    await page.getByRole('radio', { name: '08', exact: true }).click();
    await page.getByRole('button', { name: /^Giờ vào ca – Phút:/ }).click();
    await page.getByRole('radio', { name: '15', exact: true }).click();
    const monday = page.getByRole('button', { name: /^Thứ 2:/ });
    await monday.click();
    await page.getByRole('radiogroup', { name: 'Thứ 2' }).getByRole('radio', { name: 'Nửa ngày' }).click();
    await expect(monday).toHaveAccessibleName('Thứ 2: Nửa ngày');
    const latitude = page.getByRole('textbox', { name: 'Vĩ độ văn phòng', exact: true });
    const longitude = page.getByRole('textbox', { name: 'Kinh độ văn phòng', exact: true });
    const radius = page.getByRole('textbox', { name: 'Bán kính cho phép (m)', exact: true });
    await latitude.fill('-12x,345abc');
    await longitude.fill('-98y.765abc');
    await radius.fill('2a5b0m');
    await expect(latitude).toHaveValue('-12,345');
    await expect(longitude).toHaveValue('-98.765');
    await expect(radius).toHaveValue('250');
    await page.getByRole('button', { name: 'Lưu cài đặt' }).click();
    await expect.poll(async () => (await read('settings/work'))?.shiftIn?.stringValue).toBe('08:15');
    expect((await read('settings/work'))?.days?.mapValue?.fields?.['1']?.doubleValue).toBe(0.5);
    await expect.poll(() => read('settings/work')).toMatchObject({
      gpsLat: { doubleValue: -12.345 },
      gpsLng: { doubleValue: -98.765 },
      gpsRadius: { integerValue: '250' },
    });
    await openTab(labels[0]);
    await expect(latitude).toHaveCount(0);
    await openTab(labels[3]);
    await expect(latitude).toHaveValue('-12.345');
    await expect(longitude).toHaveValue('-98.765');
    await expect(radius).toHaveValue('250');

    await openTab(labels[4]);
    await page.getByRole('textbox', { name: 'Chi phí cố định (VNĐ)', exact: true }).fill('125000');
    await page.getByRole('button', { name: 'Lưu ngân sách' }).click();
    await expect.poll(async () => (await read('settings/budget'))?.['Chi phí cố định']?.integerValue).toBe('125000');

    await openTab(labels[5]);
    await expect(page.getByRole('heading', { name: 'Lương & bảo hiểm', exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'Ngày công chuẩn' }).fill('25');
    await page.getByRole('button', { name: 'Lưu cài đặt' }).click();
    await expect.poll(async () => (await read('settings/payroll'))?.ngayCongChuan?.integerValue).toBe('25');
    await openTab(labels[0]);
    await expect(page.getByRole('heading', { name: 'Nhắc hạn công việc' })).toBeVisible();
  } finally {
    await Promise.all(documents.map((path, index) => fetch(`${base}/${path}`, originals[index]
      ? { method: 'PATCH', headers, body: JSON.stringify({ fields: originals[index] }) }
      : { method: 'DELETE', headers })));
    await fetch(`${base}/members/${memberEmail}`, { method: 'DELETE', headers });
    if (recurringId) await fetch(`${base}/recurring/${recurringId}`, { method: 'DELETE', headers });
  }
});

test('Nhắc hạn chỉ hiện việc được giao trong khoảng đã chọn và mở được chi tiết', async ({ page }) => {
  const collection = 'http://127.0.0.1:8080/v1/projects/demo-marchix-mobile/databases/(default)/documents/tasks';
  const headers = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
  const today = todayInVietnam();
  const cases = [
    { title: 'Kiểm thử nhắc hạn ngày mai', due: shiftDay(today, 1), status: 'Đang làm' },
    { title: 'Kiểm thử nhắc hạn ngoài khoảng', due: shiftDay(today, 3), status: 'Đang làm' },
    { title: 'Kiểm thử nhắc hạn đã xong', due: today, status: 'Xong' },
  ];
  const documents = cases.map((_, index) => `${collection}/due-reminder-test-${Date.now()}-${index}`);
  try {
    for (const [index, task] of cases.entries()) {
      const fields = Object.fromEntries(Object.entries({ ...task, assigneeEmail: 'nhanvien@example.test' })
        .map(([key, value]) => [key, { stringValue: value }]));
      const result = await fetch(documents[index], { method: 'PATCH', headers, body: JSON.stringify({ fields }) });
      expect(result.ok).toBeTruthy();
    }
    await page.goto(previewUrl);
    await page.getByRole('button', { name: 'Đăng nhập Google (mô phỏng)' }).click();
    const openMenu = page.getByRole('button', { name: 'Mở menu' });
    const drawer = page.getByRole('dialog');
    await openMenu.click();
    await drawer.getByRole('button', { name: 'Cài đặt' }).click();
    await page.getByRole('radio', { name: 'Trước 1 ngày' }).click();
    await openMenu.click();
    await drawer.getByRole('button', { name: 'Công việc' }).click();
    await page.getByRole('button', { name: /công việc đến hạn.*Xem/i }).click();
    for (const task of cases.slice(1)) {
      await expect(page.getByRole('button', { name: new RegExp(`^${task.title}`) })).toHaveCount(0);
    }
    await page.getByRole('button', { name: new RegExp(`^${cases[0].title}`) }).click();
    await expect(page.getByRole('heading', { name: cases[0].title })).toBeVisible();
    await openMenu.click();
    await drawer.getByRole('button', { name: 'Cài đặt' }).click();
    await page.getByRole('radio', { name: 'Tắt' }).click();
    await openMenu.click();
    await drawer.getByRole('button', { name: 'Công việc' }).click();
    await expect(page.getByRole('button', { name: /công việc đến hạn.*Xem/i })).toHaveCount(0);
  } finally {
    await Promise.all(documents.map(doc => fetch(doc, { method: 'DELETE', headers })));
  }
});

test('Công việc giữ bộ lọc và chế độ Kanban khi mở chi tiết', async ({ page }) => {
  await page.goto(previewUrl);
  await page.getByRole('button', { name: 'Đăng nhập Google (mô phỏng)' }).click();
  await openTasks(page);
  const search = page.getByRole('textbox', { name: 'Tìm tên công việc' });
  const status = page.getByRole('button', { name: /^Trạng thái:/ });
  const assignee = page.getByRole('button', { name: /^Người thực hiện:/ });
  const kanban = page.getByRole('button', { name: 'Bảng Kanban' });
  const task = 'Cập nhật hướng dẫn bàn giao';
  const card = page.getByRole('button', { name: `Mở công việc: ${task}` });

  await search.fill('cap nhat huong dan');
  await expect(page.getByRole('heading', { name: '1 công việc' })).toBeVisible();
  await expect(card).toBeVisible();

  await status.scrollIntoViewIfNeeded();
  const results = page.getByRole('heading', { name: '1 công việc', exact: true });
  const resultsTop = (await results.boundingBox())!.y;
  const statusBox = (await status.boundingBox())!;
  const assigneeBox = (await assignee.boundingBox())!;
  expect(assigneeBox.y).toBeCloseTo(statusBox.y);
  expect(assigneeBox.x).toBeGreaterThan(statusBox.x);
  expect((await kanban.boundingBox())!.y).toBeGreaterThan(assigneeBox.y + assigneeBox.height);

  await assignee.click();
  await expect(page.getByRole('radiogroup', { name: 'Lọc theo người thực hiện' })).toBeVisible();
  expect((await results.boundingBox())!.y).toBeCloseTo(resultsTop);
  await page.getByRole('radio', { name: 'Nhân viên demo', exact: true }).click();
  await expect(assignee).toHaveAccessibleName('Người thực hiện: Nhân viên demo');

  await status.click();
  await expect(page.getByRole('radiogroup', { name: 'Lọc theo trạng thái' })).toBeVisible();
  expect((await results.boundingBox())!.y).toBeCloseTo(resultsTop);
  await page.getByRole('radio', { name: 'Xong', exact: true }).click();
  await expect(page.getByText('Không có việc phù hợp')).toBeVisible();
  await expect(status).toHaveAccessibleName('Trạng thái: Xong');
  await expect(status).toHaveAttribute('aria-expanded', 'false');
  await status.click();
  await page.getByRole('radio', { name: 'Chưa làm', exact: true }).click();
  await kanban.click();
  await card.click();
  await expect(page.getByRole('heading', { name: task })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Tiến độ công việc' })).toBeVisible();
  await page.getByRole('button', { name: 'Danh sách công việc' }).click();
  await expect(search).toHaveValue('cap nhat huong dan');
  await expect(status).toHaveAccessibleName('Trạng thái: Chưa làm');
  await expect(assignee).toHaveAccessibleName('Người thực hiện: Nhân viên demo');
  await expect(page.getByRole('heading', { name: 'Chưa làm' })).toBeVisible();
  await expect(card).toBeVisible();

  await page.getByRole('button', { name: 'Xóa bộ lọc' }).click();
  await expect(search).toHaveValue('');
  await expect(status).toHaveAccessibleName('Trạng thái: Tất cả');
  await expect(assignee).toHaveAccessibleName('Người thực hiện: Tất cả');
});

test('Kanban rút gọn thẻ và giữ để kéo qua các cột bằng cảm ứng', async ({ context, page }) => {
  const title = 'Kiểm tra giao diện Kanban với một tên công việc rất dài để xác nhận nội dung dừng ở đúng hai dòng trên điện thoại';
  const doc = `http://127.0.0.1:8080/v1/projects/demo-marchix-mobile/databases/(default)/documents/tasks/kanban-test-${Date.now()}`;
  const headers = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
  const fixture = await fetch(doc, { method: 'PATCH', headers, body: JSON.stringify({ fields: {
    title: { stringValue: title }, assigneeEmail: { stringValue: 'nhanvien@example.test' },
    status: { stringValue: 'Chưa làm' }, progress: { integerValue: '25' },
    due: { stringValue: '2026-12-15' }, priority: { stringValue: 'Cao' },
  } }) });
  expect(fixture.ok).toBeTruthy();
  try {
    await page.goto(previewUrl);
    await page.getByRole('button', { name: 'Đăng nhập Google (mô phỏng)' }).click();
    await openTasks(page);
    await page.getByRole('textbox', { name: 'Tìm tên công việc' }).fill('Kiểm tra giao diện Kanban');
    const card = page.getByRole('button', { name: `Mở công việc: ${title}` });
    await expect(card.getByText(title, { exact: true })).toHaveCSS('-webkit-line-clamp', '2');
    await page.getByRole('button', { name: 'Bảng Kanban' }).click();
    await expect(card.getByText(title, { exact: true })).toHaveCSS('-webkit-line-clamp', '2');
    const due = card.getByText('Hạn chót: 15/12/2026', { exact: true });
    const priority = card.getByText('Mức độ ưu tiên: Cao', { exact: true });
    await expect(due).toBeVisible();
    await expect(priority).toBeVisible();
    expect((await priority.boundingBox())!.y).toBeGreaterThan((await due.boundingBox())!.y);

    await card.scrollIntoViewIfNeeded();
    const client = await context.newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) =>
      client.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    const cardBox = (await card.boundingBox())!;
    const x = cardBox.x + cardBox.width / 2;
    const y = cardBox.y + cardBox.height / 2;
    const destination = page.getByRole('heading', { name: 'Vướng', exact: true });
    const edge = page.viewportSize()!.width - 26;

    await touch('touchStart', x, y);
    await expect(page.getByText(title, { exact: true })).toHaveCount(2);
    await touch('touchMove', edge, y);
    await expect.poll(async () => (await destination.boundingBox())!.x, { intervals: [30] }).toBeLessThan(130);
    const destBox = (await destination.boundingBox())!;
    await touch('touchMove', destBox.x + 84, y);
    await touch('touchEnd', 0, 0);
    await expect(page.getByText('Đã chuyển công việc sang Vướng.')).toBeVisible();
    const moved = destination.locator('../..').getByRole('button', { name: `Mở công việc: ${title}` });
    await expect(moved).toBeVisible();
    const stored = await fetch(doc, { headers });
    const { fields } = await stored.json();
    expect(fields.status.stringValue).toBe('Vướng');
    expect(fields.progress.integerValue).toBe('25');
    await moved.click();
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
  } finally {
    await fetch(doc, { method: 'DELETE', headers });
  }
});

test('chọn nhiều người, đặt lịch và giao tệp riêng cho từng công việc', async ({ browser, page }) => {
  test.setTimeout(90_000);
  const receiver = await browser.newContext({ ...devices['iPhone 13'] });
  const title = `Kiểm thử giao việc ${Date.now()}`;
  const attachment = { name: 'Tài liệu bàn giao.bin', mimeType: 'application/octet-stream', buffer: Buffer.alloc(950 * 1024, 0xab) };
  const host = process.env.EXPO_PUBLIC_EMULATOR_HOST || '127.0.0.1';
  const port = process.env.EXPO_PUBLIC_FIRESTORE_EMULATOR_PORT || 8080;
  const documents = `http://${host}:${port}/v1/projects/demo-marchix-mobile/databases/(default)/documents`;
  const ownerHeaders = { Authorization: 'Bearer owner' };
  let taskIds: string[] = [];
  const fileIds: string[] = [];
  let requestId: string | undefined;
  let assignmentTime = '';
  try {
    const receiverPage = await receiver.newPage();
    await Promise.all([page.goto(previewUrl), receiverPage.goto(previewUrl)]);
    await Promise.all([
      page.getByRole('button', { name: 'Đăng nhập người giao việc (mô phỏng)' }).click(),
      receiverPage.getByRole('button', { name: 'Đăng nhập Google (mô phỏng)' }).click(),
    ]);
    await Promise.all([openTasks(page), openTasks(receiverPage)]);
    const received = receiverPage.getByRole('button', { name: `Mở công việc: ${title}` });
    await expect(receiverPage.getByRole('heading', { name: 'CÔNG VIỆC', exact: true })).toBeVisible();
    await expect(received).toHaveCount(0);

    await page.getByRole('button', { name: '+ Giao việc', exact: true }).click();
    const form = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Giao việc mới', exact: true }) });
    const close = form.getByRole('button', { name: 'Đóng giao việc' });
    await expect(close).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    const titleColor = await form.getByRole('heading', { name: 'Giao việc mới', exact: true })
      .evaluate(element => getComputedStyle(element).color);
    await expect(close.getByText('×', { exact: true })).toHaveCSS('color', titleColor);
    await form.getByRole('textbox', { name: 'Tên công việc' }).fill(title);
    const search = form.getByRole('textbox', { name: 'Tìm thành viên' });
    await search.fill('nhan vien demo');
    const staff = form.getByRole('checkbox', { name: 'Nhân viên demo', exact: true });
    await staff.click();
    await expect(staff.getByText('ND', { exact: true })).toBeVisible();
    await expect(staff).not.toContainText('nhanvien@example.test');
    await expect(staff).toBeChecked();
    await staff.click();
    await expect(staff).not.toBeChecked();
    await staff.click();
    await search.clear();
    const own = form.getByRole('checkbox', { name: 'Người giao việc demo', exact: true });
    await own.click();
    await expect(own).toBeChecked();
    await expect(staff).toBeChecked();
    await expect(form.getByText('Người thực hiện · Đã chọn 2')).toBeVisible();
    await form.getByRole('radio', { name: 'Cao', exact: true }).click();
    const create = form.getByRole('button', { name: 'Tạo công việc', exact: true });
    await create.click();
    await expect(form.getByRole('alert')).toContainText('Chọn hạn chót trên lịch');
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
    const nextMonth = new Date(today.slice(0, 7) + '-01T00:00:00Z');
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    const suffix = nextMonth.toISOString().slice(0, 7).split('-').reverse().join('/');
    const deadline = `18/${suffix}`;
    const startDate = form.getByRole('button', { name: /^Ngày bắt đầu,/ });
    const dueDate = page.getByRole('button', { name: /^Hạn chót,/ });
    await startDate.scrollIntoViewIfNeeded();
    const dueBefore = await dueDate.boundingBox();
    await startDate.click();
    const startCalendar = page.getByRole('dialog', { name: 'Ngày bắt đầu', exact: true });
    await expect(startCalendar.getByRole('button', { name: 'Tháng sau' })).toBeVisible();
    expect((await dueDate.boundingBox())?.y).toBeCloseTo(dueBefore!.y, 0);
    await page.keyboard.press('Escape');
    await expect(startCalendar).toHaveCount(0);
    await expect(form).toBeVisible();
    await startDate.click();
    await startCalendar.getByRole('button', { name: 'Tháng sau' }).click();
    await startCalendar.getByRole('button', { name: `Ngày 15/${suffix}` }).click();
    await expect(form.getByRole('button', { name: `Ngày bắt đầu, 15/${suffix}` })).toBeVisible();
    await form.getByRole('button', { name: /^Hạn chót,/ }).click();
    const dueCalendar = page.getByRole('dialog', { name: 'Hạn chót', exact: true });
    await expect(dueCalendar.getByRole('button', { name: `Ngày 14/${suffix}` })).toBeDisabled();
    await dueCalendar.getByRole('button', { name: `Ngày ${deadline}` }).click();
    await expect(form.getByRole('button', { name: `Hạn chót, ${deadline}` })).toBeVisible();
    await expect(form.getByRole('textbox', { name: /Ngày bắt đầu|Hạn chót/ })).toHaveCount(0);

    const choosing = page.waitForEvent('filechooser');
    await form.getByRole('button', { name: '+ Chọn tệp', exact: true }).click();
    await (await choosing).setFiles([attachment, { name: 'Bỏ.txt', mimeType: 'text/plain', buffer: Buffer.from('bỏ') }]);
    await expect(form.getByText(attachment.name, { exact: true })).toBeVisible();
    await form.getByRole('button', { name: 'Bỏ tệp Bỏ.txt' }).click();
    await expect(form.getByText('Bỏ.txt', { exact: true })).toHaveCount(0);

    await form.getByRole('button', { name: 'Tùy chọn thêm' }).click();
    const initialProgress = form.getByRole('textbox', { name: 'Tiến độ ban đầu (%)' });
    await initialProgress.fill('101');
    await expect(initialProgress).toHaveValue('0');
    await initialProgress.fill('2a%');
    await expect(initialProgress).toHaveValue('0');
    await initialProgress.fill('100');
    await expect(initialProgress).toHaveValue('100');
    await form.getByRole('radio', { name: 'Hằng tuần', exact: true }).click();
    await form.getByRole('checkbox', { name: 'Mốc bàn giao dự án' }).click();
    await form.getByRole('textbox', { name: 'Tìm người theo dõi' }).fill('nhan vien');
    const watcher = form.getByRole('checkbox', { name: 'Nhân viên demo', exact: true }).last();
    await watcher.click();
    await expect(watcher).toBeChecked();
    await expect(watcher.getByText('ND', { exact: true })).toBeVisible();
    await form.getByRole('textbox', { name: 'Tên việc con' }).fill('Kiểm tra trước khi bàn giao');
    await form.getByRole('button', { name: '+ Thêm việc con' }).click();
    await form.getByRole('textbox', { name: 'Mô tả / chỗ vướng' }).fill('Mô tả cho cả hai người thực hiện.');
    await form.getByRole('textbox', { name: 'Lời nhắn khi giao việc' }).fill('Nhắn khi có vướng mắc.');
    const result = page.waitForResponse(response => response.url().endsWith('/createMobileTask') &&
      response.request().method() === 'POST');
    await create.click();
    const response = await result;
    expect(response.ok(), await response.text()).toBeTruthy();
    const body = (await response.json()).result;
    requestId = body.id;
    taskIds = body.assignments.map((item: { id: string }) => item.id);
    expect(new Set(taskIds).size).toBe(2);
    for (const id of taskIds) {
      const saved = await fetch(`${documents}/tasks/${id}`, { headers: ownerHeaders });
      expect(saved.ok).toBeTruthy();
      const { fields } = await saved.json();
      if (fields.assigneeEmail.stringValue === 'nhanvien@example.test') {
        const local = new Date(Date.parse(fields.createdAt.stringValue) + 7 * 60 * 60 * 1000).toISOString();
        assignmentTime = `${local.slice(0, 10).split('-').reverse().join('/')} ${local.slice(11, 16)}`;
      }
      const [comment] = fields.comments.arrayValue.values;
      const files = comment.mapValue.fields.files.arrayValue.values;
      const file = files[0].mapValue.fields;
      fileIds.push(file.id.stringValue);
      expect(files).toHaveLength(1);
      expect(file.name.stringValue).toBe(attachment.name);
      expect(file.size.integerValue).toBe(String(attachment.buffer.length));
      expect(fields.watchers.arrayValue.values).toEqual([{ stringValue: 'nhanvien@example.test' }]);
      const metadata = await fetch(`${documents}/files/${file.id.stringValue}`, { headers: ownerHeaders });
      const stored = (await metadata.json()).fields;
      expect(stored.parent.stringValue).toBe(`tasks/${id}`);
      expect(stored.chunks.integerValue).toBe('2');
    }
    expect(new Set(fileIds).size).toBe(2);
    await expect(form).toBeHidden();
    await expect(page.getByText('Đã giao việc cho 2 người.')).toBeVisible();
    const sent = page.getByRole('button', { name: `Mở công việc: ${title}`, exact: true });
    await expect(sent).toHaveCount(2);
    const assignee = page.getByRole('button', { name: /^Người thực hiện:/ });
    await assignee.click();
    await page.getByRole('radio', { name: 'Nhân viên demo', exact: true }).click();
    await expect(assignee).toHaveAccessibleName('Người thực hiện: Nhân viên demo');
    await expect(sent).toHaveCount(1);
    const assigneeRow = sent.getByText('Người thực hiện:', { exact: true }).locator('..');
    await expect(assigneeRow.getByText('Nhân viên demo', { exact: true })).toBeVisible();
    await sent.click();
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Lưu tiến độ' })).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Nội dung trao đổi' })).toHaveCount(0);
    await expect(page.getByRole('checkbox', { name: 'Kiểm tra trước khi bàn giao' })).toBeDisabled();
    const senderDownloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: `Tải tệp ${attachment.name}` }).click();
    const senderDownload = await senderDownloadEvent;
    expect(senderDownload.suggestedFilename()).toBe(attachment.name);
    expect((await readFile((await senderDownload.path())!)).equals(attachment.buffer)).toBeTruthy();
    await page.getByRole('button', { name: 'Danh sách công việc' }).click();
    await expect(assignee).toHaveAccessibleName('Người thực hiện: Nhân viên demo');
    await expect(received.getByText(`Hạn chót: ${deadline}`, { exact: true })).toBeVisible();
    await expect(received.getByText('Mức độ ưu tiên: Cao', { exact: true })).toBeVisible();
    await expect(received).toContainText('Chưa làm');
    await expect(received).toContainText('0%');
    await received.click();
    await expect(receiverPage.getByRole('button', { name: 'Chỉnh sửa', exact: true })).toHaveCount(0);
    const metadataValue = (label: string, value: string) => receiverPage.getByText(`${label}:`, { exact: true })
      .locator('..').getByText(value, { exact: true });
    const detailDue = metadataValue('Hạn chót', deadline);
    const detailMilestone = metadataValue('Mốc bàn giao dự án', 'Có');
    await expect(detailDue).toBeVisible();
    await expect(metadataValue('Mức độ ưu tiên', 'Cao')).toBeVisible();
    await expect(metadataValue('Ngày bắt đầu', `15/${suffix}`)).toBeVisible();
    await expect(metadataValue('Người thực hiện', 'Nhân viên demo')).toBeVisible();
    await expect(metadataValue('Dự án', 'Chung toàn công ty')).toBeVisible();
    await expect(metadataValue('Lặp lại', 'Hằng tuần')).toBeVisible();
    await expect(metadataValue('Người theo dõi', 'Nhân viên demo')).toBeVisible();
    await expect(detailMilestone).toBeVisible();
    expect((await detailDue.boundingBox())?.x).toBeCloseTo((await detailMilestone.boundingBox())!.x, 0);

    const progressBlock = receiverPage.getByRole('progressbar', { name: 'Tiến độ công việc' }).locator('..');
    for (const status of ['Đang làm', 'Vướng']) {
      await receiverPage.getByRole('radio', { name: status, exact: true }).click();
      await expect(progressBlock.getByText(status, { exact: true })).toBeVisible();
    }
    await expect(sent).toContainText('Chưa làm');
    await receiverPage.getByRole('radio', { name: 'Chưa làm', exact: true }).click();
    await expect(progressBlock.getByText('Chưa làm', { exact: true })).toBeVisible();
    await expect(receiverPage.getByRole('checkbox', { name: 'Kiểm tra trước khi bàn giao' })).not.toBeChecked();
    await expect(receiverPage.getByText('Mô tả cho cả hai người thực hiện.')).toBeVisible();
    await expect(receiverPage.getByText('Nhắn khi có vướng mắc.')).toBeVisible();
    await expect(receiverPage.getByText('Lời nhắn khi giao việc', { exact: true })).toBeVisible();
    const discussion = receiverPage.getByRole('heading', { name: 'Trao đổi', exact: true }).locator('..');
    await expect(discussion.getByText('Người giao việc demo', { exact: true })).toBeVisible();
    await expect(discussion.getByText('ND', { exact: true })).toBeVisible();
    await expect(discussion.getByText(assignmentTime, { exact: true })).toBeVisible();
    await discussion.getByRole('textbox', { name: 'Nội dung trao đổi' }).fill('Đã nhận công việc.');
    await discussion.getByRole('button', { name: 'Gửi trao đổi' }).click();
    await expect(discussion.getByText('Đã nhận công việc.', { exact: true })).toBeVisible();
    await expect(discussion.getByText('Nhân viên demo', { exact: true })).toBeVisible();
    const downloading = receiverPage.waitForEvent('download');
    const downloadResponse = receiverPage.waitForResponse(response => response.url().endsWith('/downloadMobileTaskAttachment') &&
      response.request().method() === 'POST');
    await receiverPage.getByRole('button', { name: `Tải tệp ${attachment.name}` }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe(attachment.name);
    expect((await readFile((await download.path())!)).equals(attachment.buffer)).toBeTruthy();
    const downloadRequest = (await downloadResponse).request();
    const { data } = downloadRequest.postDataJSON();
    const otherId = taskIds.find(id => id !== data.taskId);
    const unauthorized = await receiverPage.request.post(downloadRequest.url(), {
      headers: { Authorization: (await downloadRequest.headerValue('authorization'))! },
      data: { data: { taskId: otherId, fileId: fileIds[taskIds.indexOf(otherId!)] } },
    });
    expect(unauthorized.status()).toBe(403);

    const checked = receiverPage.getByRole('checkbox', { name: 'Kiểm tra trước khi bàn giao' });
    const checkRequest = receiverPage.waitForResponse(response => response.url().endsWith('/setTaskChecklistItem') &&
      response.request().method() === 'POST');
    await checked.click();
    const checkResponse = await checkRequest;
    expect(checkResponse.ok(), await checkResponse.text()).toBeTruthy();
    await expect(checked).toBeChecked({ timeout: 15000 });
    await sent.click();
    await expect(page.getByRole('checkbox', { name: 'Kiểm tra trước khi bàn giao' })).toBeChecked();
    await page.getByRole('button', { name: 'Chỉnh sửa', exact: true }).click();
    const editForm = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Chỉnh sửa công việc', exact: true }) });
    await expect(editForm).toBeVisible();
    const editTitle = editForm.getByRole('textbox', { name: 'Tên công việc' });
    await expect(editTitle).toHaveValue(title);
    await expect(editForm.getByRole('radio', { name: 'Cao', exact: true })).toBeChecked();
    await expect(editForm.getByText(attachment.name, { exact: true })).toBeVisible();
    await expect(editForm.getByRole('checkbox', { name: 'Nhân viên demo', exact: true })).toBeChecked({ timeout: 15000 });
    await editForm.getByRole('button', { name: `Hạn chót, ${deadline}` }).click();
    const newDeadline = `22/${suffix}`;
    await dueCalendar.getByRole('button', { name: `Ngày ${newDeadline}` }).click();
    const updatedTitle = `${title} đã sửa`;
    await editTitle.fill(updatedTitle);
    await editForm.getByRole('radio', { name: 'Thấp', exact: true }).click();
    await editForm.getByRole('button', { name: 'Tùy chọn thêm' }).click();
    await expect(editForm.getByRole('textbox', { name: 'Mô tả / chỗ vướng' })).toHaveValue('Mô tả cho cả hai người thực hiện.');
    await editForm.getByRole('textbox', { name: 'Lời nhắn khi giao việc' }).fill('Lời nhắn đã chỉnh sửa.');
    await editForm.getByRole('textbox', { name: 'Tên việc con' }).fill('Mục mới sau khi sửa');
    const editing = page.waitForResponse(response => response.url().endsWith('/updateMobileTask') &&
      response.request().method() === 'POST');
    await editForm.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
    const edited = await editing;
    expect(edited.ok(), await edited.text()).toBeTruthy();
    await expect(editForm).toBeHidden();
    await expect(page.getByRole('heading', { name: updatedTitle, exact: true })).toBeVisible();
    await expect(receiverPage.getByRole('heading', { name: updatedTitle, exact: true })).toBeVisible();
    await expect(metadataValue('Hạn chót', newDeadline)).toBeVisible();
    await expect(metadataValue('Mức độ ưu tiên', 'Thấp')).toBeVisible();
    await expect(receiverPage.getByText('Lời nhắn đã chỉnh sửa.')).toBeVisible();
    await expect(discussion.getByText('Đã nhận công việc.', { exact: true })).toBeVisible();
    await expect(receiverPage.getByRole('button', { name: `Tải tệp ${attachment.name}` })).toBeVisible();
    await expect(checked).toBeChecked();
    await expect(receiverPage.getByRole('checkbox', { name: 'Mục mới sau khi sửa' })).not.toBeChecked();

    const editRequest = edited.request();
    const editBody = editRequest.postDataJSON();
    expect(editBody.data.taskId).toBe(data.taskId);
    const [deniedEdit, staleEdit, untouched] = await Promise.all([
      receiverPage.request.post(editRequest.url(), {
        headers: { Authorization: (await downloadRequest.headerValue('authorization'))! }, data: editBody,
      }),
      page.request.post(editRequest.url(), {
        headers: { Authorization: (await editRequest.headerValue('authorization'))! }, data: editBody,
      }),
      fetch(`${documents}/tasks/${otherId}`, { headers: ownerHeaders }),
    ]);
    expect(deniedEdit.status()).toBe(403);
    expect(staleEdit.status()).toBe(400);
    expect((await staleEdit.json()).error.status).toBe('FAILED_PRECONDITION');
    expect((await untouched.json()).fields.title.stringValue).toBe(title);
  } finally {
    await receiver.close();
    if (requestId && /^[a-zA-Z0-9]{20}$/.test(requestId)) {
      const paths = [`mobileTaskAssignments/${requestId}`, ...taskIds
        .filter(id => /^[a-zA-Z0-9]{20}(?:_\d+)?$/.test(id)).map(id => `tasks/${id}`),
      ...fileIds.filter(id => /^mobile_[a-f0-9]{64}$/.test(id))
        .flatMap(id => [`files/${id}/chunks/0`, `files/${id}/chunks/1`, `files/${id}`])];
      for (const path of paths) {
        const cleanup = await fetch(`${documents}/${path}`, { method: 'DELETE', headers: ownerHeaders });
        expect(cleanup.ok).toBeTruthy();
      }
    }
  }
});

test('Google mô phỏng, cập nhật tiến độ và đồng bộ giữa hai phiên', async ({ browser, page }) => {
  const suffix = Date.now();
  const task = `Kiểm thử lưu tiến độ ${suffix}`;
  const documentUrl = `http://127.0.0.1:8080/v1/projects/demo-marchix-mobile/databases/(default)/documents/tasks/progress-test-${suffix}`;
  const headers = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
  const fixture = await fetch(documentUrl, { method: 'PATCH', headers, body: JSON.stringify({ fields: {
    title: { stringValue: task },
    assigneeEmail: { stringValue: 'nhanvien@example.test' },
    status: { stringValue: 'Chưa làm' },
    progress: { integerValue: '0' },
  } }) });
  expect(fixture.ok).toBeTruthy();
  const openTask = (target: typeof page) => target.getByRole('button', { name: `Mở công việc: ${task}` });
  const login = (target: typeof page) => target.getByRole('button', { name: 'Đăng nhập Google (mô phỏng)' }).click();

  const other = await browser.newContext({ ...devices['iPhone 13'] });
  try {
    const otherPage = await other.newPage();
    await Promise.all([page.goto(previewUrl), otherPage.goto(previewUrl)]);
    await Promise.all([login(page), login(otherPage)]);
    await Promise.all([openTasks(page), openTasks(otherPage)]);
    await expect(page.getByRole('heading', { name: 'CÔNG VIỆC', exact: true })).toBeVisible();
    await expect(page.getByText('Việc riêng của đồng nghiệp')).toHaveCount(0);
    await Promise.all([openTask(page).click(), openTask(otherPage).click()]);
    const progress = page.getByLabel('Tiến độ (%)');
    const previous = await progress.inputValue();
    await progress.fill('101');
    await expect(progress).toHaveValue(previous);
    await progress.fill('9.5');
    await expect(progress).toHaveValue(previous);
    await progress.fill('a%');
    await expect(progress).toHaveValue(previous);
    await progress.clear();
    await page.getByRole('button', { name: 'Lưu tiến độ' }).click();
    const errorToast = page.getByRole('alert').filter({ hasText: 'Nhập số nguyên từ 0 đến 100.' });
    await expect(errorToast).toBeVisible();
    await expect(errorToast.locator('..').getByText('\u26A0\uFE0E')).toHaveCSS('color', 'rgb(158, 52, 43)');
    await progress.fill('75');
    await page.getByRole('radio', { name: 'Vướng' }).click();
    await page.getByRole('button', { name: 'Lưu tiến độ' }).click();
    const toast = page.getByText('Đã lưu tiến độ.', { exact: true });
    await expect(toast).toBeVisible();
    const toastContainer = toast.locator('..');
    await expect(toastContainer.getByText('✓')).toHaveCSS('color', 'rgb(11, 97, 85)');
    await expect(page.getByRole('heading', { name: task, exact: true })).toBeVisible();
    await expect(progress).toHaveValue('75');
    const bounds = (await toastContainer.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(bounds.x + bounds.width / 2).toBeCloseTo(viewport.width / 2, 0);
    expect(viewport.height - (bounds.y + bounds.height)).toBeLessThan(48);
    await expect(toast).toBeHidden({ timeout: 4000 });
    await expect(page.getByRole('heading', { name: task, exact: true })).toBeVisible();
    await progress.fill('80');
    await page.getByRole('button', { name: 'Lưu tiến độ' }).click();
    await expect(toast).toBeVisible();
    await expect(page.getByRole('heading', { name: task, exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Danh sách công việc' }).click();
    await expect(openTask(page)).toContainText('80%');
    await expect(openTask(page)).toContainText('Vướng');
    await otherPage.getByLabel('Tiến độ (%)').fill('90');
    await otherPage.getByRole('button', { name: 'Lưu tiến độ' }).click();
    await expect(otherPage.getByRole('alert')).toContainText('Công việc vừa thay đổi');
    await otherPage.getByRole('button', { name: 'Danh sách công việc' }).click();
    await expect(openTask(otherPage)).toContainText('80%');
    await page.getByRole('button', { name: 'Mở menu' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Đăng xuất', exact: true }).click();
    await page.getByRole('alertdialog', { name: 'Xác nhận đăng xuất' })
      .getByRole('button', { name: 'Đăng xuất', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toBeVisible();
  } finally {
    await other.close();
    const cleanup = await fetch(documentUrl, { method: 'DELETE', headers });
    expect(cleanup.ok).toBeTruthy();
  }
});
