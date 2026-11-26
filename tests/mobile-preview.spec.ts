import { test, acknowledgeStartupReminder } from './helpers/startupReminder';
import { devices, expect, type Response } from '@playwright/test';
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

// Personal attendance defaults to five days per page. These workflows assert
// changes to today's row, so select the whole month through the real UI first.
async function showFullPersonalAttendanceMonth(page: import('@playwright/test').Page, date: string) {
  const dayHeaders = page.getByRole('table').getByRole('rowheader');
  await expect(dayHeaders).toHaveCount(5);
  await expect(dayHeaders.first()).toContainText('01/' + date.slice(5, 7));
  await page.getByRole('button', { name: 'Trang sau', exact: true }).click();
  await expect(dayHeaders.first()).toContainText('06/' + date.slice(5, 7));
  await page.getByRole('button', { name: 'Số dòng mỗi trang: 5 dòng', exact: true }).click();
  await page.getByRole('radiogroup', { name: 'Số dòng mỗi trang', exact: true })
    .getByRole('radio', { name: '50 dòng', exact: true }).click();
  const [year, month] = date.split('-').map(Number);
  await expect(dayHeaders).toHaveCount(new Date(year, month, 0).getDate());
  await expect(dayHeaders.first()).toContainText('01/' + date.slice(5, 7));
}

test('Popup chi tiết nới theo nội dung rồi cuộn trong giới hạn tab Chung', async ({ page, request }) => {
  const host = process.env.EXPO_PUBLIC_EMULATOR_HOST || '127.0.0.1';
  const port = process.env.EXPO_PUBLIC_FIRESTORE_EMULATOR_PORT || 8080;
  const id = `task-popup-height-${Date.now()}`;
  const url = `http://${host}:${port}/v1/projects/demo-marchix-mobile/databases/(default)/documents/tasks/${id}`;
  const headers = { Authorization: 'Bearer owner' };
  const title = `Kiểm thử chiều cao ${id}`;
  const email = 'quantri@example.test';
  const note = (size: number) => Array.from({ length: size }, (_, i) => `Mô tả công việc dòng ${i + 1}`).join('\n');
  async function update(size: number, status = 'Xong') {
    const comments = Array.from({ length: size }, (_, i) => ({ mapValue: { fields: {
      by: { stringValue: email }, at: { stringValue: new Date(Date.UTC(2025, 0, 1, 0, i)).toISOString() },
      text: { stringValue: `Nội dung trao đổi ${i + 1}` },
    } } }));
    expect((await request.patch(url, { headers, data: { fields: {
      title: { stringValue: title }, assignedBy: { stringValue: email }, assigneeEmail: { stringValue: email },
      status: { stringValue: status }, progress: { integerValue: '100' }, note: { stringValue: note(size) },
      comments: { arrayValue: { values: comments } },
    } } })).ok()).toBe(true);
  }
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: 'light' });
    await update(1);
    await page.goto(previewUrl);
    await page.getByRole('button', { name: 'Đăng nhập quản trị (mô phỏng)', exact: true }).click();
    await openTasks(page);
    await page.getByRole('textbox', { name: 'Tìm tên công việc' }).fill(title);
    const card = page.getByRole('button', { name: `Mở công việc: ${title}`, exact: true });
    await expect(card.getByText('Hạn chót: Chưa thiết lập', { exact: true })).toBeVisible();
    await expect(card.getByText('Mức độ ưu tiên: Chưa thiết lập', { exact: true })).toBeVisible();
    const unsetValues = card.getByText('Chưa thiết lập', { exact: true });
    await expect(unsetValues).toHaveCount(2);
    for (const value of await unsetValues.all()) await expect(value).toHaveCSS('color', 'rgb(118, 118, 118)');
    await page.getByRole('button', { name: 'Mức độ ưu tiên: Tất cả', exact: true }).click();
    await page.getByRole('radio', { name: 'Chưa thiết lập', exact: true }).click();
    await page.getByRole('button', { name: 'Biểu đồ Gantt', exact: true }).click();
    await expect(card.getByText('Chưa thiết lập', { exact: true })).toHaveCSS('color', 'rgb(118, 118, 118)');
    await page.getByRole('button', { name: 'Danh sách', exact: true }).click();
    await card.click();
    const dialog = page.getByRole('dialog', { name: 'Chi tiết công việc', exact: true });
    const header = dialog.getByRole('heading', { name: 'Chi tiết công việc', exact: true }).locator('..');
    await expect(header).toHaveCSS('border-bottom-width', '0px');
    await expect(header.getByRole('button', { name: 'Đóng chi tiết công việc' })).toHaveText('×');
    const content = dialog.getByTestId('task-detail-scroll');
    const tab = (name: string) => dialog.getByRole('button', { name, exact: true });
    const height = () => dialog.evaluate(element => element.getBoundingClientRect().height);
    for (const field of ['Hạng mục', 'Người duyệt', 'Người theo dõi', 'Dự án', 'Ngày bắt đầu', 'Hạn chót',
      'Mức độ ưu tiên', 'Chế độ hoàn thành', 'Lặp lại', 'Mốc bàn giao dự án']) {
      const label = dialog.getByText(field, { exact: true });
      await expect(label).toHaveCSS('font-weight', '700');
      const value = label.locator('..').getByText('Chưa thiết lập', { exact: true });
      await expect(value).toHaveCSS('font-weight', '400');
      await expect(value).toHaveCSS('color', 'rgb(118, 118, 118)');
    }
    const generalHeight = await height();
    const shortHeights = new Map<string, number>();
    for (const name of ['Mô tả', 'Trao đổi & tài liệu']) {
      await tab(name).click();
      await expect.poll(height).toBeLessThan(generalHeight);
      shortHeights.set(name, await height());
      expect(await content.evaluate(element => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1);
    }

    await update(36);
    for (const name of ['Mô tả', 'Trao đổi & tài liệu']) {
      await tab(name).click();
      await expect.poll(height).toBeCloseTo(generalHeight, 0);
      expect(await height()).toBeGreaterThan(shortHeights.get(name)!);
      await expect.poll(() => content.evaluate(element => element.scrollHeight - element.clientHeight)).toBeGreaterThan(40);
      const tabY = (await tab(name).boundingBox())!.y;
      await content.evaluate(element => { element.scrollTop = element.scrollHeight; });
      await expect.poll(() => content.evaluate(element => element.scrollTop)).toBeGreaterThan(40);
      expect((await tab(name).boundingBox())!.y).toBeCloseTo(tabY);
    }

    await update(36, 'Đang làm');
    const edit = tab('Chỉnh sửa');
    await tab('Chung').click();
    const saveProgress = content.getByRole('button', { name: 'Lưu tiến độ', exact: true });
    await saveProgress.scrollIntoViewIfNeeded();
    await expect(saveProgress).toBeInViewport();
    const followsProgressInput = await saveProgress.evaluate(button => {
      const field = button.previousElementSibling;
      return !!field?.querySelector('input[aria-label="Tiến độ (%)"]') &&
        button.getBoundingClientRect().top >= field.getBoundingClientRect().bottom;
    });
    expect(followsProgressInput).toBe(true);
    await expect(edit).toBeInViewport();
    expect((await edit.boundingBox())!.y).toBeGreaterThan((await tab('Báo hoàn thành').boundingBox())!.y);
    await tab('Mô tả').click();
    await expect(edit).toBeInViewport();
    await expect(tab('Báo hoàn thành')).toHaveCount(0);
    await tab('Trao đổi & tài liệu').click();
    const send = tab('Gửi trao đổi');
    await expect(send).toBeInViewport();
    await expect(edit).toBeInViewport();
    const sendBox = (await send.boundingBox())!;
    expect((await edit.boundingBox())!.y).toBeGreaterThanOrEqual(sendBox.y + sendBox.height);
  } finally {
    await request.delete(url, { headers });
  }
});

test('Tệp ở lại trong bản nháp đến khi gửi trao đổi công việc', async ({ page, request }) => {
  test.setTimeout(60_000);
  const host = process.env.EXPO_PUBLIC_EMULATOR_HOST || '127.0.0.1';
  const port = process.env.EXPO_PUBLIC_FIRESTORE_EMULATOR_PORT || 8080;
  const documents = `http://${host}:${port}/v1/projects/demo-marchix-mobile/databases/(default)/documents`;
  const id = `task-discussion-draft-${Date.now()}`;
  const url = `${documents}/tasks/${id}`;
  const headers = { Authorization: 'Bearer owner' };
  const file = (name: string) => ({ name, mimeType: 'text/plain', buffer: Buffer.from('Dữ liệu tệp') });
  const mixed = file('Tài liệu kèm nội dung.txt');
  const removed = file('Tài liệu bỏ khỏi bản nháp.txt');
  const only = file('Tài liệu gửi riêng.txt');
  const comments = async () => {
    const response = await request.get(url, { headers });
    expect(response.ok()).toBe(true);
    return ((await response.json()).fields?.comments?.arrayValue?.values ?? []);
  };

  try {
    expect((await request.patch(url, { headers, data: { fields: {
      title: { stringValue: id }, assigneeEmail: { stringValue: 'quantri@example.test' },
      status: { stringValue: 'Đang làm' }, progress: { integerValue: '25' },
    } } })).ok()).toBe(true);
    await page.goto(previewUrl);
    await page.getByRole('button', { name: 'Đăng nhập quản trị (mô phỏng)', exact: true }).click();
    await openTasks(page);
    await page.getByRole('textbox', { name: 'Tìm tên công việc' }).fill(id);
    await page.getByRole('button', { name: `Mở công việc: ${id}`, exact: true }).click();
    const detail = page.getByRole('dialog', { name: 'Chi tiết công việc', exact: true });
    await detail.getByRole('button', { name: 'Trao đổi & tài liệu', exact: true }).click();
    const history = detail.getByTestId('task-detail-scroll');
    const input = detail.getByRole('textbox', { name: 'Nội dung trao đổi' });
    const send = detail.getByRole('button', { name: 'Gửi trao đổi', exact: true });
    const pick = async (...files: ReturnType<typeof file>[]) => {
      const choosing = page.waitForEvent('filechooser');
      await detail.getByRole('button', { name: 'Đính kèm tệp' }).click();
      await (await choosing).setFiles(files);
    };
    const remove = (name: string) => detail.getByRole('button', { name: `Bỏ tệp ${name}`, exact: true });
    await expect(send).toBeDisabled();
    await pick(mixed, removed);
    await expect(remove(mixed.name)).toBeVisible();
    await remove(removed.name).click();
    await expect(history.getByText(mixed.name, { exact: true })).toHaveCount(0);
    expect(await comments()).toHaveLength(0);
    await expect(send).toBeEnabled();
    const message = 'Mình gửi tài liệu để đối chiếu.';
    await input.fill(message);
    await send.click();
    await expect(page.getByText('Đã gửi trao đổi kèm tệp.', { exact: true })).toBeVisible({ timeout: 20_000 });
    const postedText = history.getByText(message, { exact: true });
    const postedFile = postedText.locator('..').getByRole('button', { name: `Xem tệp ${mixed.name}` });
    await expect(postedFile).toBeVisible({ timeout: 20_000 });
    expect((await postedFile.boundingBox())!.y).toBeGreaterThan((await postedText.boundingBox())!.y);
    await expect(input).toHaveValue('');
    await expect(remove(mixed.name)).toHaveCount(0);

    await pick(only);
    await expect(remove(only.name)).toBeVisible();
    expect(await comments()).toHaveLength(1);
    await send.click();
    await expect(history.getByRole('button', { name: `Xem tệp ${only.name}` })).toBeVisible({ timeout: 20_000 });
    await expect(send).toBeDisabled();
    expect((await comments()).map((row: { mapValue: { fields: { text: { stringValue: string } } } }) =>
      row.mapValue.fields.text.stringValue)).toEqual([message, '']);
  } finally {
    const saved = await request.get(url, { headers });
    if (saved.ok()) {
      for (const row of (await saved.json()).fields?.comments?.arrayValue?.values ?? []) {
        for (const entry of row.mapValue.fields.files.arrayValue.values ?? []) {
          const fileId = entry.mapValue.fields.id.stringValue;
          await request.delete(`${documents}/files/${fileId}/chunks/0`, { headers });
          await request.delete(`${documents}/files/${fileId}`, { headers });
        }
      }
      await request.delete(url, { headers });
    }
  }
});

test('Phê duyệt hiển thị thông tin công việc còn trống bằng chữ mờ', async ({ page, request }) => {
  const host = process.env.EXPO_PUBLIC_EMULATOR_HOST || '127.0.0.1';
  const port = process.env.EXPO_PUBLIC_FIRESTORE_EMULATOR_PORT || 8080;
  const id = `review-unset-${Date.now()}`;
  const url = `http://${host}:${port}/v1/projects/demo-marchix-mobile/databases/(default)/documents/tasks/${id}`;
  const headers = { Authorization: 'Bearer owner' };
  const title = `Công việc thiếu thông tin ${id}`;
  try {
    expect((await request.patch(url, { headers, data: { fields: {
      title: { stringValue: title }, status: { stringValue: 'Chờ duyệt' },
      approverEmail: { stringValue: 'quantri@example.test' },
    } } })).ok()).toBe(true);
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(previewUrl);
    await page.getByRole('button', { name: 'Đăng nhập quản trị (mô phỏng)', exact: true }).click();
    await page.getByRole('button', { name: 'Mở menu' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Phê duyệt', exact: true }).click();

    const card = page.getByRole('button', { name: `Xem công việc: ${title}`, exact: true })
      .or(page.getByRole('button', { name: `Duyệt công việc: ${title}`, exact: true }));
    async function expectUnsetFields(container: typeof card, labels: string[]) {
      for (const label of labels) {
        const field = container.getByText(`${label}: Chưa thiết lập`, { exact: true });
        await expect(field.getByText('Chưa thiết lập', { exact: true })).toHaveCSS('color', 'rgb(118, 118, 118)');
      }
    }
    await expectUnsetFields(card, ['Người giao việc', 'Người thực hiện', 'Hạn chót', 'Mức độ ưu tiên']);
    await card.click();
    const detail = page.getByRole('dialog', { name: 'Chi tiết phê duyệt công việc' });
    await expectUnsetFields(detail, ['Người thực hiện', 'Hạn chót', 'Gửi duyệt lúc']);
    await expect(detail.getByText('Kết quả nhân viên gửi', { exact: true }).locator('..')
      .getByText('Chưa thiết lập', { exact: true })).toBeVisible();
  } finally {
    await request.delete(url, { headers });
  }
});

test('Người giao trả lời ngay dưới trao đổi gốc', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const sender = await browser.newPage({ ...devices['iPhone 13'] });
  await acknowledgeStartupReminder(sender);
  const task = 'Cập nhật hướng dẫn bàn giao';
  const originalStart = `Mình đã cập nhật hướng dẫn (${Date.now()}).`;
  const original = `${originalStart} Các bước kiểm tra đã được bổ sung vào tài liệu bàn giao. Nhờ bạn xem lại phần ghi chú và xác nhận các thông tin còn thiếu trước khi gửi cho cả nhóm.`;
  const unrelated = `Mình đã kiểm tra lịch bàn giao (${Date.now()}).`;
  const reply = 'Bạn bổ sung ảnh minh họa nhé.';
  const attachment = { name: 'Ghi chú phản hồi.txt', mimeType: 'text/plain', buffer: Buffer.from('Bổ sung ảnh minh họa') };
  const discarded = { ...attachment, name: 'Tệp phản hồi bỏ đi.txt' };
  try {
    await Promise.all([page.emulateMedia({ colorScheme: 'light' }), sender.emulateMedia({ colorScheme: 'light' })]);
    await Promise.all([page.goto(previewUrl), sender.goto(previewUrl)]);
    await page.getByRole('button', { name: 'Đăng nhập bằng Google' }).click();
    await sender.getByRole('button', { name: 'Đăng nhập người giao việc (mô phỏng)' }).click();
    for (const view of [page, sender]) {
      await openTasks(view);
      await view.getByRole('button', { name: `Mở công việc: ${task}` }).click();
      const detail = view.getByRole('dialog', { name: 'Chi tiết công việc', exact: true });
      await detail.getByRole('button', { name: 'Mô tả', exact: true }).click();
      await expect(detail.getByRole('heading', { name: 'Mô tả / Yêu cầu bàn giao' })).toBeVisible();
      await expect(detail.getByRole('progressbar', { name: 'Tiến độ công việc' })).toBeHidden();
      await detail.getByRole('button', { name: 'Trao đổi & tài liệu', exact: true }).click();
    }
    const compose = page.getByRole('textbox', { name: 'Nội dung trao đổi' });
    const send = page.getByRole('button', { name: 'Gửi trao đổi' });
    const history = page.getByTestId('task-detail-scroll');
    await expect(history.getByRole('textbox', { name: 'Nội dung trao đổi' })).toHaveCount(0);
    await expect(history.getByRole('button', { name: 'Gửi trao đổi' })).toHaveCount(0);
    const historyBox = (await history.boundingBox())!;
    expect((await compose.boundingBox())!.y).toBeGreaterThanOrEqual(historyBox.y + historyBox.height);
    await compose.fill(original);
    await send.click();
    await expect(compose).toHaveValue('');
    await compose.fill(unrelated);
    await send.click();
    await expect(history.getByText(unrelated, { exact: true })).toBeVisible();
    const originalText = sender.getByText(original, { exact: true });
    const senderHistory = sender.getByTestId('task-detail-scroll');
    const search = senderHistory.getByRole('textbox', { name: 'Tìm trong trao đổi', exact: true });
    await expect(search).toBeVisible();
    const heading = senderHistory.getByRole('heading', { name: 'Trao đổi', exact: true });
    const titleBounds = (await heading.boundingBox())!;
    expect((await search.boundingBox())!.y).toBeGreaterThanOrEqual(titleBounds.y + titleBounds.height);
    await search.fill('không có nội dung này');
    await expect(senderHistory.getByText('Không tìm thấy trao đổi phù hợp.')).toBeVisible();
    await expect(originalText).toHaveCount(0);
    await search.fill(originalStart.toLocaleUpperCase('vi'));
    const respond = originalText.locator('..')
      .getByRole('button', { name: 'Trả lời trao đổi của Nhân viên demo' });
    await expect(respond).toBeVisible();
    const bodyBox = (await originalText.boundingBox())!;
    const replyBox = (await respond.getByText('Trả lời', { exact: true }).boundingBox())!;
    expect(replyBox.x).toBeCloseTo(bodyBox.x);
    expect(replyBox.y - (bodyBox.y + bodyBox.height)).toBeLessThan(8);
    await respond.click();
    const replyLabel = (view: typeof page) => view.getByText('Trả lời Nhân viên demo', { exact: true });
    await expect(replyLabel(sender)).toHaveCSS('font-weight', '400');
    await expect(replyLabel(sender).getByText('Nhân viên demo', { exact: true })).toHaveCSS('font-weight', '700');
    await sender.getByRole('button', { name: 'Hủy trả lời' }).click();
    await expect(sender.getByRole('button', { name: 'Gửi trả lời' })).toHaveCount(0);
    await respond.click();
    const choosing = sender.waitForEvent('filechooser');
    await sender.getByRole('button', { name: 'Đính kèm tệp' }).click();
    await (await choosing).setFiles([attachment, discarded]);
    const remove = sender.getByRole('button', { name: `Bỏ tệp ${discarded.name}` });
    await expect(remove).toBeVisible();
    const card = remove.locator('..');
    await expect(card).toContainText(discarded.name);
    await expect(card).toHaveCSS('border-right-width', '1px');
    const [removeBox, cardBox] = await Promise.all([remove.boundingBox(), card.boundingBox()]);
    expect(cardBox!.x + cardBox!.width - removeBox!.x - removeBox!.width).toBeCloseTo(1);
    await remove.click();
    await sender.getByRole('textbox', { name: 'Nội dung trao đổi' }).fill(reply);
    await sender.getByRole('button', { name: 'Gửi trả lời' }).click();
    await expect(sender.getByText('Đã gửi trả lời.', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(reply, { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(replyLabel(page)).toHaveCSS('font-weight', '400');
    await expect(replyLabel(page).getByText('Nhân viên demo', { exact: true })).toHaveCSS('font-weight', '700');
    await expect(replyLabel(page).locator('..')).toHaveCSS('background-color', 'rgb(240, 237, 249)');
    await expect(replyLabel(page).locator('..')).toHaveCSS('border-left-width', '3px');
    const quote = replyLabel(page).locator('..').getByText(original, { exact: true });
    await expect(quote).toHaveCSS('-webkit-line-clamp', '2');
    const originalRow = history.getByText(original, { exact: true }).first().locator('../..');
    const replyRow = originalRow.locator('xpath=following-sibling::*[1]');
    await expect(replyRow.getByText(reply, { exact: true })).toBeVisible();
    await expect(replyRow.getByRole('button', { name: `Xem tệp ${attachment.name}` })).toBeVisible();
    expect((await replyRow.boundingBox())!.x).toBeGreaterThan((await originalRow.boundingBox())!.x);
    await expect(history.getByText(original, { exact: true })).toHaveCount(2);
    await expect(senderHistory.getByText(reply, { exact: true })).toHaveCount(0);
    await search.fill(reply);
    await expect(senderHistory.getByText(reply, { exact: true })).toBeVisible();
    await expect(senderHistory.getByText(original, { exact: true })).toHaveCount(2);
    await expect(senderHistory.getByText(unrelated, { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Đóng chi tiết công việc', exact: true }).click();
    await page.getByRole('button', { name: /^Thông báo(?:,|$)/ }).click();
    const notice = page.getByRole('button', { name: 'Chưa đọc: Có người trả lời trao đổi của bạn', exact: true });
    await expect(notice).toContainText(task);
    await notice.click();
    await expect(page.getByRole('heading', { name: task, exact: true })).toBeVisible();
  } finally {
    await sender.close();
  }
});

test('Văn thư nằm sau Dự án và hiển thị hồ sơ được giao hoặc theo dõi', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(previewUrl);
  await page.getByRole('button', { name: 'Đăng nhập bằng Google' }).click();
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
  await expect(page.getByRole('dialog', { name: 'Chi tiết công văn' })
    .getByText('01/2025', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Về sổ văn thư' }).click();
  await page.getByLabel('Tìm văn bản', { exact: true }).clear();
  await page.getByRole('button', { name: 'Văn bản đi', exact: true }).click();
  await expect(page.getByRole('button', { name: /Quyết định phân công phụ trách dự án/ })).toBeVisible();
});

test('Đơn từ trong app chuyển tạm ứng đã duyệt sang Thu chi', async ({ page, browser, request }) => {
  test.setTimeout(120_000);
  const admin = await browser.newPage({ ...devices['iPhone 13'] });
  await acknowledgeStartupReminder(admin);
  const reviewer = await browser.newPage({ ...devices['iPhone 13'] });
  await acknowledgeStartupReminder(reviewer);
  const reason = 'Tạm ứng kiểm thử ' + Date.now();
  const host = process.env.EXPO_PUBLIC_EMULATOR_HOST || '127.0.0.1';
  const port = process.env.EXPO_PUBLIC_FIRESTORE_EMULATOR_PORT || 8080;
  const documents = `http://${host}:${port}/v1/projects/demo-marchix-mobile/databases/(default)/documents`;
  const headers = { Authorization: 'Bearer owner' };
  let id = '';
  let overtimeId = '';
  let tripId = '';
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
    await openRequests(page, 'Đăng nhập bằng Google');
    for (const label of ['Đơn chờ duyệt', 'Đơn đã duyệt']) {
      await expect(page.getByText(label, { exact: true }).locator('..')).toHaveCSS('background-color', 'rgb(240, 234, 253)');
    }
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
    async function selectTimePart(label: string, value: string) {
      await popup.getByRole('button', { name: new RegExp(`^${label}:`) }).click();
      await page.getByRole('radiogroup', { name: label, exact: true }).getByRole('radio', { name: value, exact: true }).click();
    }
    async function expectDateBeforeTime() {
      for (const label of ['Từ ngày', 'Đến ngày']) {
        const [date, hour, minute] = await Promise.all([',', ' · Giờ:', ' · Phút:'].map(suffix =>
          popup.getByRole('button', { name: new RegExp(`^${label}${suffix}`) }).boundingBox()));
        expect(date!.x).toBeLessThan(hour!.x);
        expect(hour!.x).toBeLessThan(minute!.x);
      }
    }
    await expectDateBeforeTime();
    const today = todayInVietnam();
    const days = popup.getByRole('textbox', { name: 'Số ngày', exact: true });
    await days.fill('2,5');
    await popup.getByRole('button', { name: 'Tăng số ngày', exact: true }).click();
    await expect(days).toHaveValue('3,5');
    await popup.getByRole('button', { name: 'Giảm số ngày', exact: true }).click();
    await expect(days).toHaveValue('2,5');
    await expect(popup.getByRole('button', { name: 'Đến ngày, ' + formatTaskDate(shiftDay(today, 2)) })).toBeVisible();
    const dateButton = popup.getByRole('button', { name: /^Đến ngày,/ });
    await dateButton.scrollIntoViewIfNeeded();
    const daysY = (await days.boundingBox())!.y;
    await dateButton.click();
    const dateCalendar = page.getByRole('dialog', { name: 'Đến ngày', exact: true });
    await expect(dateCalendar.getByRole('button', { name: 'Tháng sau', exact: true })).toBeVisible();
    expect((await days.boundingBox())!.y).toBeCloseTo(daysY);
    if (today.slice(0, 7) !== shiftDay(today, 2).slice(0, 7)) {
      await dateCalendar.getByRole('button', { name: 'Tháng trước', exact: true }).click();
    }
    await dateCalendar.getByRole('button', { name: 'Ngày ' + formatTaskDate(today), exact: true }).click();
    await expect(days).toHaveValue('1');
    await selectType('Công tác');
    await expectDateBeforeTime();
    await expect(days).toHaveCount(0);
    const tripEnd = shiftDay(today, 1);
    await dateButton.click();
    if (today.slice(0, 7) !== tripEnd.slice(0, 7)) {
      await dateCalendar.getByRole('button', { name: 'Tháng sau', exact: true }).click();
    }
    await dateCalendar.getByRole('button', { name: 'Ngày ' + formatTaskDate(tripEnd), exact: true }).click();
    await selectTimePart('Từ ngày · Giờ', '08');
    await selectTimePart('Từ ngày · Phút', '15');
    await selectTimePart('Đến ngày · Giờ', '12');
    await selectTimePart('Đến ngày · Phút', '30');
    const tripReason = 'Công tác kiểm thử ' + Date.now();
    await popup.getByLabel('Địa điểm công tác').fill('Hà Nội');
    await popup.getByLabel('Mục đích / nội dung công tác').fill(tripReason);
    await popup.getByRole('button', { name: 'Gửi đơn' }).click();
    await expect(page.getByText('Đã gửi đơn. Đơn đang chờ duyệt.', { exact: true })).toBeVisible();
    await expect(popup).toHaveCount(0);
    const savedTrip = await findRequest(tripReason);
    tripId = savedTrip.name.split('/').at(-1);
    expect(savedTrip.fields.days).toEqual({ integerValue: '2' });
    expect(savedTrip.fields.trip.mapValue.fields.time.mapValue.fields).toEqual({
      from: { stringValue: '08:15' }, to: { stringValue: '12:30' },
    });
    await page.getByTestId(`request-${tripId}`).click();
    await expect(page.getByRole('button', { name: 'Từ ngày · Giờ: 08', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Đến ngày · Phút: 30', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Đóng đơn' }).click();
    await page.getByRole('button', { name: '+ Tạo đơn' }).click();
    await selectType('Làm thêm giờ');
    await expect(popup.getByRole('button', { name: /^Ngày,/ })).toBeVisible();
    await expect(popup.getByRole('button', { name: /^Đến ngày,/ })).toHaveCount(0);
    await selectTimePart('Số giờ làm thêm · Giờ', '24');
    await expect(popup.getByRole('button', { name: 'Số giờ làm thêm · Phút: 00', exact: true })).toBeDisabled();
    await selectTimePart('Số giờ làm thêm · Giờ', '01');
    await selectTimePart('Số giờ làm thêm · Phút', '15');
    const taskTitle = 'Kiểm tra giao diện trên điện thoại';
    await popup.getByRole('button', { name: /^Công việc phụ trách:/ }).click();
    const taskDropdown = page.getByRole('dialog', { name: 'Công việc phụ trách', exact: true });
    const taskChoice = taskDropdown.getByRole('checkbox', { name: taskTitle });
    await expect(taskChoice).toHaveText(taskTitle);
    await taskChoice.click();
    await taskDropdown.getByLabel('Tìm công việc phụ trách').fill('cap nhat');
    await taskDropdown.getByRole('checkbox', { name: 'Cập nhật hướng dẫn bàn giao' }).click();
    await expect(taskDropdown.getByRole('button', { name: 'Bỏ chọn ' + taskTitle })).toBeVisible();
    await taskDropdown.getByRole('button', { name: 'Xong' }).click();
    await expect(popup.getByText('Công việc phụ trách · Đã chọn 2')).toBeVisible();
    await expect(popup.getByRole('button', { name: /^Công việc phụ trách:/ }))
      .toHaveAccessibleName(`Công việc phụ trách: ${taskTitle}, Cập nhật hướng dẫn bàn giao`);
    const overtimeReason = 'Làm thêm kiểm thử ' + Date.now();
    await popup.getByLabel('Lý do làm thêm giờ').fill(overtimeReason);
    await popup.getByRole('button', { name: 'Gửi đơn' }).click();
    await expect(popup).toHaveCount(0);
    const savedOvertime = await findRequest(overtimeReason);
    overtimeId = savedOvertime.name.split('/').at(-1);
    expect(savedOvertime.fields.overtime.mapValue.fields.hours).toEqual({ doubleValue: 1.25 });
    expect(savedOvertime.fields.overtime.mapValue.fields.tasks.arrayValue.values
      .map((item: { mapValue: { fields: { id: { stringValue: string } } } }) => item.mapValue.fields.id.stringValue))
      .toEqual(['kiem-tra-giao-dien', 'cap-nhat-huong-dan']);
    await page.getByTestId(`request-${overtimeId}`).click();
    await expect(page.getByText('Công việc phụ trách · Đã chọn 2')).toBeVisible();
    await expect(page.getByText(/^Người tạo ·/)).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Chi tiết đơn' })
      .getByRole('button', { name: /^Xóa đơn/ })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Chi tiết đơn' })).toBeVisible();
    await page.getByRole('button', { name: 'Đóng đơn' }).click();
    await page.getByRole('button', { name: '+ Tạo đơn' }).click();
    await selectType('Đề xuất khác');
    await selectType('Tạm ứng lương');
    await page.getByLabel('Lý do / nội dung').fill(reason);
    await page.getByRole('button', { name: 'Gửi đơn' }).click();
    await expect(page.getByRole('alert')).toContainText('Nhập số tiền tạm ứng');
    await page.getByLabel('Số tiền tạm ứng (VNĐ)').fill('750000');
    await expect(page.getByLabel('Số tiền tạm ứng (VNĐ)')).toHaveValue('750.000');
    const month = today.slice(5, 7);
    const year = today.slice(0, 4);
    await popup.getByRole('button', { name: `Đổi tháng năm, ${month}/${year}` }).click();
    const monthCalendar = page.getByRole('dialog', { name: 'Trừ vào lương tháng' });
    const monthButtons = monthCalendar.getByRole('button', { name: /^Tháng \d+$/ });
    await expect(monthButtons).toHaveText(Array.from({ length: 12 }, (_, index) => String(index + 1)));
    const [leftMonth, rightMonth, calendar] = await Promise.all([
      monthButtons.nth(0).boundingBox(), monthButtons.nth(3).boundingBox(), monthCalendar.boundingBox(),
    ]);
    expect(leftMonth!.y).toBeCloseTo(rightMonth!.y);
    expect((leftMonth!.x + rightMonth!.x + rightMonth!.width) / 2).toBeCloseTo(calendar!.x + calendar!.width / 2);
    await monthCalendar.getByRole('button', { name: 'Năm sau' }).click();
    await monthCalendar.getByRole('button', { name: 'Tháng 1', exact: true }).click();
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
    await admin.getByRole('button', { name: /^Người duyệt:/ }).click();
    await admin.getByRole('dialog', { name: 'Người duyệt', exact: true })
      .getByRole('checkbox', { name: 'Người giao việc demo', exact: true }).click();
    await admin.getByRole('button', { name: 'Lưu người duyệt' }).click();
    await expect(admin.getByRole('heading', { name: 'Chi tiết đơn' })).toHaveCount(0);

    await openRequests(reviewer, 'Đăng nhập người giao việc (mô phỏng)');
    await reviewer.getByRole('button', { name: 'Mở menu' }).click();
    await reviewer.getByRole('dialog').getByRole('button', { name: 'Phê duyệt', exact: true }).click();
    const queuedRequest = reviewer.getByRole('button', { name: 'Mở hồ sơ: Tạm ứng lương: ' + reason, exact: true });
    await queuedRequest.click();
    await expect(reviewer.getByRole('dialog', { name: 'Chi tiết đơn' })).toBeVisible();
    await expect(reviewer.getByText('PHÊ DUYỆT', { exact: true })).toBeAttached();
    await reviewer.getByRole('button', { name: 'Từ chối', exact: true }).click();
    await expect(reviewer.getByRole('alert')).toContainText('Nhập lý do từ chối rồi bấm Từ chối lại.');
    await reviewer.getByLabel('Ý kiến xử lý').fill('Đã kiểm tra');
    await reviewer.getByRole('button', { name: 'Duyệt', exact: true }).click();
    await expect(reviewer.getByText('Đã duyệt đơn tạm ứng và tạo đề nghị chi chờ duyệt.', { exact: true })).toBeVisible();
    await expect(reviewer.getByRole('dialog', { name: 'Chi tiết đơn' })).toHaveCount(0);
    await expect(reviewer.getByRole('heading', { name: 'PHÊ DUYỆT', exact: true })).toBeVisible();
    await expect(queuedRequest).toHaveCount(0);
    await reviewer.getByRole('button', { name: /^(Xem|Duyệt) công việc: Rà soát tài liệu hướng dẫn$/ }).click();
    const taskReview = reviewer.getByRole('dialog', { name: 'Chi tiết phê duyệt công việc' });
    await expect(taskReview.getByText('Đã rà soát nội dung hướng dẫn.')).toBeVisible();
    await expect(reviewer.getByText('PHÊ DUYỆT', { exact: true })).toBeAttached();
    await taskReview.getByRole('button', { name: 'Đóng chi tiết phê duyệt' }).click();
    await expect(taskReview).toHaveCount(0);
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
    await admin.getByRole('button', { name: /^Người duyệt:/ }).click();
    await admin.getByRole('dialog', { name: 'Người duyệt', exact: true })
      .getByRole('checkbox', { name: 'Người giao việc demo', exact: true }).click();
    await admin.getByRole('button', { name: 'Lưu người duyệt' }).click();
    await page.getByRole('button', { name: 'Mở menu' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Chấm công', exact: true }).click();
    await showFullPersonalAttendanceMonth(page, today);
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
    if (tripId) await request.delete(documents + '/requests/' + tripId, { headers });
  }
});

test('Thống kê bảng công in đậm số với phần chữ nét thường', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(previewUrl);
  await page.getByRole('button', { name: 'Đăng nhập bằng Google' }).click();
  const openMenu = page.getByRole('button', { name: 'Mở menu' });
  const attendanceItem = page.getByRole('dialog').getByRole('button', { name: 'Chấm công', exact: true });
  await expect(async () => {
    if (!(await attendanceItem.isVisible())) await openMenu.click();
    await expect(attendanceItem).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 10_000 });
  await attendanceItem.click();
  const panel = page.getByRole('heading', { name: 'Bảng công của bạn' }).locator('../..');
  const number = /^\d+(?:[.,]\d+)?$/;
  for (const [label, unit, count] of [
    ['Công thực tế', 'công chuẩn', 2], ['Nghỉ phép / công tác', 'ngày', 1], ['Đi muộn', 'lần', 1],
  ] as const) {
    const title = panel.getByText(label, { exact: true });
    await expect(title).toHaveCSS('font-weight', '700');
    const tile = title.locator('..');
    const numbers = tile.getByText(number);
    await expect(numbers).toHaveCount(count);
    for (const value of await numbers.all()) {
      await expect(value).toHaveCSS('font-weight', '700');
      await expect(value).toHaveCSS('color', 'rgb(0, 0, 0)');
    }
    await expect(tile.getByText(unit, { exact: true })).toHaveCSS('font-weight', '400');
  }
  for (const label of ['Quên chấm vào', 'Quên chấm ra']) {
    const line = panel.getByText(new RegExp(`^${label} \\d+ lần$`));
    await expect(line).toHaveCSS('font-weight', '400');
    const value = line.getByText(number);
    await expect(value).toHaveCSS('font-weight', '700');
    await expect(value).toHaveCSS('color', 'rgb(0, 0, 0)');
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
  const weekdayLabel = today.getDay() === 0 ? 'Chủ nhật' : `Thứ ${today.getDay() + 1}`;
  const fullDateLabel = `${weekdayLabel}, ${formatTaskDate(local)}`;
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

  async function openAttendance(target: typeof page) {
    await target.getByRole('button', { name: 'Mở menu' }).click();
    await target.getByRole('dialog').getByRole('button', { name: 'Chấm công', exact: true }).click();
    await expect(target.getByRole('heading', { name: 'Chấm công', exact: true })).toBeVisible();
  }

  const admin = await browser.newPage({ ...devices['iPhone 13'] });
  await acknowledgeStartupReminder(admin);
  try {
    await page.setViewportSize({ width: 678, height: 794 });
    await page.context().setGeolocation({ latitude: 10.7719, longitude: 106.69 });
    const cdp = await page.context().newCDPSession(page);
    const { targetInfo } = await cdp.send('Target.getTargetInfo');
    await cdp.send('Browser.setPermission', {
      permission: { name: 'geolocation' },
      origin: new URL(previewUrl).origin,
      browserContextId: targetInfo.browserContextId,
      setting: 'denied',
    });
    await page.goto(previewUrl);
    await page.getByRole('button', { name: 'Đăng nhập bằng Google' }).click();
    await openAttendance(page);
    const personalHeading = page.getByRole('heading', { name: 'Bảng công của bạn' });
    await expect(personalHeading).toBeVisible();
    await expect(page.getByText('Ngày: ' + fullDateLabel, { exact: true })).toBeVisible();
    await expect(page.getByText(/^Ca làm việc: \d{2}:\d{2} - \d{2}:\d{2}$/)).toBeVisible();
    await expect(page.getByText(/^Quên chấm vào \d+ lần$/)).toBeVisible();
    await expect(page.getByText(/^Quên chấm ra \d+ lần$/)).toBeVisible();
    const liveClock = page.getByText(/^\d{2}:\d{2}:\d{2}$/).first();
    const initialTime = await liveClock.textContent();
    await expect.poll(() => liveClock.textContent()).not.toBe(initialTime);
    const checkIn = page.getByRole('button', { name: 'Chấm công vào', exact: true });
    const punchPanel = await checkIn.locator('..').boundingBox();
    const personalPanel = await personalHeading.locator('../..').boundingBox();
    expect(punchPanel?.width).toBeCloseTo(personalPanel!.width);
    expect(await page.evaluate(async () =>
      (await navigator.permissions.query({ name: 'geolocation' })).state)).toBe('denied');
    await checkIn.click();
    await expect(page.getByRole('alert')).toHaveText(
      'Cần cấp quyền truy cập vị trí để chấm công. Hãy cấp quyền vị trí rồi thử lại.');
    expect((await request.get(record, { headers })).status()).toBe(404);
    await cdp.detach();
    await page.context().grantPermissions(['geolocation'], { origin: previewUrl });
    // A fresh document starts a new geolocation request after the denied one.
    await page.reload();
    await openAttendance(page);
    await showFullPersonalAttendanceMonth(page, local);
    await expect.poll(() => page.evaluate(async () =>
      (await navigator.permissions.query({ name: 'geolocation' })).state)).toBe('granted');

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
    const workingTag = page.getByText('Đang làm', { exact: true });
    await expect(workingTag).toBeVisible();
    await expect(workingTag.locator('..').getByText(/^\d{2}:\d{2}:\d{2}$/)).toBeVisible();
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
    await expect(workingTag).toHaveCount(0);
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

    await admin.goto(previewUrl);
    await admin.getByRole('button', { name: 'Đăng nhập quản trị (mô phỏng)' }).click();
    await openAttendance(admin);
    await expect(admin.getByRole('heading', { name: 'Bảng chấm công toàn công ty' })).toBeVisible();
    const day = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][today.getDay()];
    const dateLabel = day + ' · ' + local.slice(8) + '/' + local.slice(5, 7);
    const companyTable = admin.getByRole('table');
    await expect(companyTable.getByRole('columnheader', { name: 'HỌ TÊN' })).toBeVisible();
    const monthPicker = admin.getByRole('button', { name: /^Chọn tháng:/ });
    const monthOptions = admin.getByRole('radiogroup', { name: 'Chọn tháng' }).getByRole('radio');
    const currentMonth = local.slice(5, 7) + '/' + local.slice(0, 4);
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
    const editor = admin.getByRole('dialog', { name: 'Sửa công', exact: true });
    await expect(editor).toContainText('Nhân viên: Nhân viên demo');
    await expect(editor.getByText('Ngày: ' + fullDateLabel, { exact: true })).toBeVisible();
    for (const [label, value] of [
      ['Giờ vào điều chỉnh · Giờ', '08'],
      ['Giờ vào điều chỉnh · Phút', '30'],
      ['Giờ ra điều chỉnh · Giờ', '08'],
    ]) {
      await editor.getByRole('button', { name: new RegExp('^' + label + ':') }).click();
      await admin.getByRole('radiogroup', { name: label }).getByRole('radio', { name: value, exact: true }).click();
    }
    await admin.getByRole('radio', { name: '1', exact: true }).click();
    await admin.getByLabel('Lý do điều chỉnh').fill(adjustmentReason);
    await admin.getByRole('button', { name: 'Lưu điều chỉnh' }).click();
    await expect(editor.getByRole('alert')).toHaveText('Giờ ra không được trước giờ vào.');
    await editor.getByRole('button', { name: 'Giờ ra điều chỉnh · Giờ: 08', exact: true }).click();
    await admin.getByRole('radiogroup', { name: 'Giờ ra điều chỉnh · Giờ' }).getByRole('radio', { name: '17', exact: true }).click();
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

    for (const [target, filename] of [[admin, 'cong-ty'], [page, 'ca-nhan']] as const) {
      const downloadPromise = target.waitForEvent('download');
      await target.getByRole('button', { name: 'Xuất Excel' }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe(`Bang-cong-${filename}-${local.slice(5, 7)}-${local.slice(0, 4)}.xlsx`);
      const filePath = await download.path();
      const workbook = read(await readFile(filePath!));
      const summarySheet = workbook.Sheets['Bảng chấm công'];
      expect(summarySheet.A4.v).toBe('BẢNG CHẤM CÔNG');
      expect(summarySheet.B7.v).toBe('Họ và tên');
      expect(['AI7', 'AJ7', 'AK7', 'AL7', 'AM7'].map(address => summarySheet[address].v))
        .toEqual(['x / ½', 'P', 'CT', '!', '–']);
      expect(summarySheet.B9.t).toBe('s');
      const summaryRows = utils.sheet_to_json<(string | number)[]>(summarySheet, { header: 1 });
      const employeeRow = summaryRows.find(row => row[1] === 'Nhân viên demo');
      expect(employeeRow?.[Number(local.slice(8)) + 2]).toBe('x');
      expect(employeeRow?.[34]).toBe(1);
      if (target === admin) {
        expect(workbook.SheetNames).toEqual(['Bảng chấm công']);
      } else {
        const rows = utils.sheet_to_json<(string | number)[]>(workbook.Sheets['Chi tiết cá nhân'], { header: 1 });
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
    await expect(attendanceConfirmation).toContainText(`Nhân viên demo ngày ${fullDateLabel}`);
    await attendanceConfirmation.getByRole('button', { name: 'Hủy' }).click();
    await expect(editor.getByRole('button', { name: 'Giờ vào điều chỉnh · Giờ: 08', exact: true })).toBeVisible();
    await expect(editor.getByRole('button', { name: 'Giờ vào điều chỉnh · Phút: 30', exact: true })).toBeVisible();
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
  await page.getByRole('button', { name: 'Đăng nhập bằng Google' }).click();
  async function selectDemoProject() {
    await page.getByRole('region', { name: 'Danh sách dự án' })
      .getByRole('button', { name: /^Chọn dự án:/ }).click();
    await page.getByRole('radiogroup', { name: 'Chọn dự án' })
      .getByRole('radio', { name: 'Marchix Mobile · Demo', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Tất cả dự án', exact: true }).click();
  await selectDemoProject();
  const list = page.getByRole('region', { name: 'Danh sách dự án' });
  const profile = page.getByRole('region', { name: 'Thông tin dự án' });
  await expect(page.getByRole('heading', { name: 'DỰ ÁN', exact: true })).toBeVisible();
  await expect(list.getByRole('heading', { name: 'DỰ ÁN', exact: true })).toHaveCount(0);
  await expect(profile.getByRole('heading', { name: 'Marchix Mobile · Demo' })).toBeVisible();
  const projectInfo = profile.getByText('Mã dự án', { exact: true }).locator('../..');
  await expect(projectInfo).toHaveCSS('border-top-width', '1px');
  await expect(projectInfo.getByText('DA-marchix-mobile-demo', { exact: true })).toBeVisible();
  await expect(projectInfo.getByText('Thời gian', { exact: true }).locator('..'))
    .toContainText('10/11/2026 → 30/11/2026');
  await expect(projectInfo.getByText('Người phụ trách', { exact: true }).locator('..'))
    .toContainText('Người giao việc demo');
  await expect(projectInfo.getByText('Mục tiêu / kết quả bàn giao', { exact: true }).locator('..'))
    .toContainText('Bàn giao bản thử trên điện thoại.');
  await expect(projectInfo.getByText('Giai đoạn hiện tại', { exact: true }).locator('..'))
    .toContainText('Kiểm thử nội bộ');
  await expect(projectInfo.getByText('Rủi ro / cần quyết định', { exact: true }).locator('..'))
    .toContainText('Xác nhận luồng đăng nhập trên thiết bị thật.');
  await expect(projectInfo.getByText('Mô tả ngắn', { exact: true }).locator('..'))
    .toContainText('Dữ liệu thử nghiệm.');
  await expect(profile.getByText('Đang chạy', { exact: true })).toBeVisible();
  await expect(profile.getByRole('progressbar', { name: /^Tiến độ dự án/ })).toHaveAttribute('aria-valuenow', '55');
  await expect(profile.getByText('55%', { exact: true })).toBeVisible();
  const work = page.getByRole('region', { name: 'Công việc đính kèm', exact: true });
  const tabList = page.getByRole('tablist', { name: 'Mục trong hồ sơ dự án' });
  await expect(work.locator(':scope > :first-child')).toHaveAttribute('role', 'tablist');
  await expect(tabList.getByRole('tab', { name: 'Công việc đính kèm' })).toHaveAttribute('aria-selected', 'true');
  const tabs = tabList.getByRole('tab');
  await expect(tabs).toHaveCount(3);
  const positions = await tabs.evaluateAll(items => items.map(item => item.getBoundingClientRect().top));
  expect(new Set(positions).size).toBe(1);
  await expect(page.getByRole('button', { name: '+ Thêm dự án' })).toHaveCount(0);

  await tabList.getByRole('tab', { name: 'Tài chính', exact: true }).click();
  const finance = page.getByRole('region', { name: 'Tài chính', exact: true });
  await expect(finance.getByRole('heading', { name: 'Tài chính dự án' })).toBeVisible();
  await expect(finance.getByText(/Trần vốn dự án/)).toBeVisible();
  await tabList.getByRole('tab', { name: 'Công việc đính kèm' }).click();
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

  await page.getByRole('button', { name: 'Mở menu' }).click();
  await page.getByTestId('workspace-drawer').getByRole('button', { name: 'Dự án', exact: true }).click();
  await selectDemoProject();
  await tabList.getByRole('tab', { name: 'Công việc đính kèm' }).click();
  await work.getByRole('button', { name: 'Mở công việc: Kiểm tra giao diện trên điện thoại' }).click();
  await expect(popup.getByRole('heading', { name: 'Kiểm tra giao diện trên điện thoại' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(popup).toBeHidden();
});

test('Tổng quan mở mặc định sau đăng nhập và dùng dữ liệu theo vai trò', async ({ page, browser }) => {
  test.setTimeout(60_000);
  const admin = await browser.newPage({ ...devices['iPhone 13'] });
  await acknowledgeStartupReminder(admin);
  async function openOverview(target: typeof page, login: string) {
    await target.goto(previewUrl);
    await target.getByRole('button', { name: login }).click();
    await expect(target.getByRole('heading', { name: 'Tổng quan', exact: true })).toBeVisible();
  }

  try {
    await openOverview(page, 'Đăng nhập bằng Google');
    const taskRing = page.getByLabel(/\d+ công việc/);
    await expect(taskRing).toBeVisible();
    const legendRow = page.getByRole('button', { name: /^Đang làm \d+$/ });
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
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(previewUrl);
  const accountLookup = page.waitForResponse(response => response.url().includes('/accounts:lookup') && response.ok());
  await page.getByRole('button', { name: 'Đăng nhập bằng Google' }).click();
  const { users } = await (await accountLookup).json();
  const accountCreatedAt = Number(users[0].createdAt);
  expect(accountCreatedAt).toBeGreaterThan(0);

  const openMenu = page.getByRole('button', { name: 'Mở menu' });
  const drawer = page.getByRole('dialog');
  const menuLines = openMenu.locator(':scope > [aria-hidden="true"]');
  await expect(menuLines).toHaveCount(3);
  const [topLine, middleLine, bottomLine] = await menuLines.evaluateAll(lines => lines.map(line => {
    const { width, height, x, y } = line.getBoundingClientRect();
    return { width, height, x, y };
  }));
  expect(middleLine).toMatchObject({ width: topLine.width, height: topLine.height, x: topLine.x });
  expect(bottomLine).toMatchObject({ width: topLine.width, height: topLine.height, x: topLine.x });
  expect(middleLine.y - topLine.y).toBeCloseTo(bottomLine.y - middleLine.y);
  await expect(page.getByRole('button', { name: 'Đăng xuất', exact: true })).toHaveCount(0);
  await openMenu.click();
  const drawerPanel = drawer.getByTestId('workspace-drawer');
  const brandName = drawer.getByText('MarHub', { exact: true });
  const menuSearch = drawer.getByRole('textbox', { name: 'Tìm mục menu' });
  const searchIcon = menuSearch.locator('..').locator('[aria-hidden="true"] img');
  await expect(brandName).toHaveCSS('color', 'rgb(96, 65, 189)');
  const initialViewport = page.viewportSize()!;
  for (const [width, drawerWidth] of [[280, 208], [320, 208], [390, 248], [430, 248], [768, 280]]) {
    await page.setViewportSize({ ...initialViewport, width });
    await expect(drawerPanel).toHaveCSS('width', `${drawerWidth}px`);
    await expect(brandName).toBeInViewport({ ratio: 1 });
    await expect(searchIcon).toBeVisible();
    const [logoBox, searchBox] = await Promise.all([
      drawer.getByLabel('Logo MarHub').boundingBox(), menuSearch.boundingBox(),
    ]);
    expect(searchBox!.x).toBeCloseTo(logoBox!.x);
    expect(searchBox!.y - (logoBox!.y + logoBox!.height)).toBeCloseTo(12);
    expect(await brandName.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await expect(drawer.getByRole('button', { name: 'Thông tin cá nhân' })).toBeInViewport({ ratio: 1 });
  }
  await page.setViewportSize(initialViewport);
  const items = drawer.getByRole('button');
  const labels = [
    'Đóng menu', 'Tổng quan', 'Công việc', 'Kế hoạch tuần', 'Phê duyệt', 'KPI',
    'Chấm công', 'Thu chi', 'Đơn từ', 'Phiếu lương', 'Dự án', 'Văn thư', 'Cài đặt', 'Thông tin cá nhân', 'Đăng xuất',
  ];
  await expect(items).toHaveCount(labels.length);
  for (const [index, label] of labels.entries()) await expect(items.nth(index)).toHaveAccessibleName(label);
  await menuSearch.fill('luong');
  await expect(drawer.getByRole('button', { name: 'Phiếu lương' })).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Tổng quan' })).toHaveCount(0);
  await menuSearch.fill('không có trong menu');
  await expect(drawer.getByText('Không tìm thấy mục phù hợp.')).toBeVisible();
  await drawer.getByRole('button', { name: 'Xóa từ khóa tìm mục menu' }).click();
  await expect(menuSearch).toHaveValue('');
  await expect(drawer.getByRole('button', { name: 'Tổng quan' })).toBeVisible();

  await drawer.getByRole('button', { name: 'Thông tin cá nhân' }).click();
  await expect(drawer).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Thông tin cá nhân' })).toBeVisible();
  const profileName = page.getByText('Nhân viên demo', { exact: true });
  await expect(profileName).toBeVisible();
  const role = profileName.locator('..').getByText('Nhân viên', { exact: true });
  await expect(role).toBeVisible();
  expect((await role.boundingBox())!.y).toBeGreaterThan((await profileName.boundingBox())!.y);
  const emailLabel = page.getByText('Email liên hệ', { exact: true });
  const emailValue = page.getByText('nhanvien@example.test', { exact: true });
  await expect(emailValue).toBeVisible();
  const activity = page.getByText('Thời gian hoạt động', { exact: true }).locator('..');
  const activityDays = Math.floor((Date.now() - accountCreatedAt) / (24 * 60 * 60 * 1000));
  await expect(activity.getByText(`${activityDays.toLocaleString('vi-VN')} ngày`, { exact: true })).toBeVisible();
  await expect(emailValue).toHaveCSS('text-align', 'right');
  await expect(emailLabel).toHaveCSS('font-weight', '700');
  await expect(emailLabel).toHaveCSS('color', 'rgb(0, 0, 0)');
  await expect(emailValue).toHaveCSS('font-weight', '500');
  await expect(emailValue).toHaveCSS('color', 'rgb(100, 90, 116)');
  const chooseAvatar = page.waitForEvent('filechooser');
  const changeAvatar = page.getByRole('button', { name: 'Đổi ảnh đại diện' });
  await changeAvatar.click();
  await (await chooseAvatar).setFiles('assets/marchix-mark.png');
  await expect(page.getByText('Đã cập nhật ảnh đại diện.')).toBeVisible();
  const avatarImage = page.locator('img[src^="data:image/png;base64,"]');
  await expect(avatarImage).toHaveCount(1);
  await expect(changeAvatar.locator('..').getByText('ND', { exact: true })).toHaveCount(0);

  await openMenu.click();
  await expect(drawer.getByRole('button', { name: 'Thông tin cá nhân' })).toHaveAttribute('aria-current', 'page');
  await menuSearch.fill('CAI DAT');
  await drawer.getByRole('button', { name: 'Cài đặt' }).click();
  await expect(drawer).toBeHidden();
  await expect(page.getByRole('tablist', { name: 'Nhóm cài đặt' }).getByRole('tab')).toHaveCount(1);
  await expect(page.getByRole('tab', { name: 'Chung' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Cài đặt' })).toBeVisible();
  const managementUrl = 'https://quanly.marchix.vn/';
  await page.context().route(managementUrl, route => route.fulfill({ body: 'Quản lý Marchix' }));
  const managementPopup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Web Quản lý Marchix ↗' }).click();
  const managementPage = await managementPopup;
  await expect(managementPage).toHaveURL(managementUrl);
  await managementPage.close();
  await openMenu.click();
  await expect(menuSearch).toHaveValue('');
  await drawer.getByRole('button', { name: 'Đóng menu' }).click();
  await expect(drawer).toBeHidden();
  const appInformation = page.getByRole('heading', { name: 'Thông tin ứng dụng' }).locator('..');
  await expect(appInformation.getByText('Phiên bản', { exact: true }).locator('..')
    .getByText('0.4.0', { exact: true })).toBeVisible();
  await expect(appInformation.getByText('Hệ điều hành', { exact: true }).locator('..')
    .getByText('iOS', { exact: true })).toBeVisible();
  const managementButton = page.getByRole('button', { name: 'Web Quản lý Marchix ↗' });
  expect((await managementButton.boundingBox())!.y).toBeGreaterThan((await appInformation.boundingBox())!.y);
  const appearance = page.getByRole('radiogroup', { name: 'Chế độ hiển thị' });
  const heading = page.getByRole('heading', { name: 'Cài đặt' });
  const lightMode = appearance.getByRole('radio', { name: 'Sáng' });
  const lightModeLabel = lightMode.getByText('Sáng', { exact: true });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(heading).toHaveCSS('color', 'rgb(245, 240, 252)');
  await expect(lightModeLabel).toHaveCSS('color', 'rgb(196, 184, 212)');
  await lightMode.click();
  await expect(heading).toHaveCSS('color', 'rgb(33, 25, 53)');
  await expect(lightModeLabel).toHaveCSS('color', 'rgb(100, 90, 116)');
  await expect(lightModeLabel).toHaveCSS('font-weight', '500');
  await appearance.getByRole('radio', { name: 'Tối' }).click();
  await expect(heading).toHaveCSS('color', 'rgb(245, 240, 252)');
  const reminderSwitch = page.getByRole('switch', { name: 'Nhắc hạn công việc', exact: true });
  const reminderTiming = page.getByRole('radiogroup', { name: 'Thời điểm nhắc hạn' });
  await expect(reminderSwitch).toHaveAttribute('aria-checked', 'false');
  await expect(reminderTiming).toBeHidden();
  await reminderSwitch.click();
  await reminderTiming.getByRole('radio', { name: 'Trước 3 ngày' }).click();
  await expect.poll(() => page.evaluate(() => [
    localStorage.getItem('marchix:theme'),
    localStorage.getItem('marchix:due-reminders:nhanvien@example.test'),
  ])).toEqual(['dark', '3']);
  await page.reload();
  await openMenu.click();
  await drawer.getByRole('button', { name: 'Cài đặt' }).click();
  await expect(appearance.getByRole('radio', { name: 'Tối' })).toBeChecked();
  await expect(reminderTiming.getByRole('radio', { name: 'Trước 3 ngày' })).toBeChecked();
  await reminderSwitch.click();
  await expect(reminderTiming).toBeHidden();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('marchix:due-reminders:nhanvien@example.test')))
    .toBe('off:3');
  await page.reload();
  await openMenu.click();
  await drawer.getByRole('button', { name: 'Cài đặt' }).click();
  await expect(reminderSwitch).toHaveAttribute('aria-checked', 'false');
  await expect(reminderTiming).toBeHidden();
  await reminderSwitch.click();
  await expect(reminderTiming.getByRole('radio', { name: 'Trước 3 ngày' })).toBeChecked();

  const customTiming = reminderTiming.getByRole('radio', { name: 'Tùy chỉnh' });
  const customDays = page.getByRole('textbox', { name: 'Số ngày trước hạn' });
  const saveTiming = page.getByRole('button', { name: 'Lưu thời điểm' });
  await customTiming.click();
  await customDays.fill('366');
  await expect(saveTiming).toBeDisabled();
  await customDays.fill('7');
  await saveTiming.click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('marchix:due-reminders:nhanvien@example.test')))
    .toBe('7');
  await page.reload();
  await openMenu.click();
  await drawer.getByRole('button', { name: 'Cài đặt' }).click();
  await expect(customTiming).toBeChecked();
  await expect(customDays).toHaveValue('7');

  await openMenu.click();
  await drawer.getByRole('button', { name: 'Thông tin cá nhân' }).click();
  await expect(emailLabel).toHaveCSS('color', 'rgb(245, 240, 252)');
  await expect(emailValue).toHaveCSS('color', 'rgb(196, 184, 212)');

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
  await expect(page.getByRole('button', { name: 'Đăng nhập bằng Google' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Tài khoản gần đây' })).toBeVisible();
  await page.getByRole('button', { name: 'Đăng nhập với nhanvien@example.test' }).click();
  await openMenu.click();
  await drawer.getByRole('button', { name: 'Thông tin cá nhân' }).click();
  await expect(page.getByText('nhanvien@example.test', { exact: true })).toBeVisible();
  await expect(avatarImage).toHaveCount(1);
});

test('Xóa từng tài khoản gần đây và xóa tất cả trên màn hình đăng nhập', async ({ page }) => {
  await page.goto(previewUrl);
  const googleLogin = page.getByRole('button', { name: 'Đăng nhập bằng Google', exact: true });
  await expect(googleLogin).toBeVisible();
  await page.evaluate(() => {
    localStorage.setItem('marchix:recent-accounts:v1:demo-marchix-mobile', JSON.stringify([
      { email: 'nhanvien@example.test', name: 'Nhân viên demo', photoURL: null },
      { email: 'quantri@example.test', name: 'Quản trị demo', photoURL: null },
    ]));
  });
  await page.reload();

  const staffLogin = page.getByRole('button', { name: 'Đăng nhập với nhanvien@example.test', exact: true });
  const adminLogin = page.getByRole('button', { name: 'Đăng nhập với quantri@example.test', exact: true });
  const clearAll = page.getByRole('button', { name: 'Đăng xuất tất cả tài khoản', exact: true });
  await expect(staffLogin).toBeVisible();
  await page.getByRole('button', { name: 'Xóa nhanvien@example.test khỏi tài khoản gần đây', exact: true }).click();
  await expect(staffLogin).toBeHidden();
  await expect(adminLogin).toBeVisible();
  await page.reload();
  await expect(adminLogin).toBeVisible();
  await expect(staffLogin).toBeHidden();

  await clearAll.click();
  const recentHeading = page.getByRole('heading', { name: 'Tài khoản gần đây' });
  await expect(recentHeading).toBeHidden();
  await page.reload();
  await expect(googleLogin).toBeVisible();
  await expect(recentHeading).toBeHidden();
  await expect(clearAll).toBeHidden();
});

test('KPI đọc điểm đã chốt, tính điểm theo dự án và giới hạn theo vai trò', async ({ page, browser, request }) => {
  test.setTimeout(60_000);
  const host = process.env.EXPO_PUBLIC_EMULATOR_HOST || '127.0.0.1';
  const port = process.env.EXPO_PUBLIC_FIRESTORE_EMULATOR_PORT || '8080';
  const emulator = `http://${host}:${port}/v1/projects/demo-marchix-mobile/databases/(default)/documents`;
  const headers = { Authorization: 'Bearer owner' };
  const employee = 'nhanvien@example.test';
  const colleague = 'dongnghiep@example.test';
  const month = '2025-03';
  const task = { assigneeEmail: employee, title: 'KPI thử nghiệm', priority: 'Cao',
    due: month + '-10', status: 'Chờ duyệt', rating: 'Khá', projectId: 'marchix-mobile-demo' };
  const paths = [
    ['tasks/kpi-test-late', { ...task, doneAt: month + '-10T17:00:00.000Z' }],
    ['tasks/kpi-test-missing-date', { ...task, priority: 'Thấp' }],
    ['tasks/kpi-test-other-project', { ...task, projectId: 'kpi-other-project', status: 'Xong' }],
    ['kpi/kpi-test-staff', { email: employee, month, total: 3, onTime: 3, late: 0, missed: 0, pending: 0,
      pct: '92', grade: 'A', lockedAt: '2025-04-01T00:00:00.000Z' }],
    ['kpi/kpi-test-colleague', { email: colleague, month, total: 1, onTime: 1, late: 0, missed: 0, pending: 0, pct: 100 }],
  ] as const;
  async function openKpi(target: typeof page, login: string) {
    await target.goto(previewUrl);
    await target.getByRole('button', { name: login }).click();
    await target.getByRole('button', { name: 'Mở menu' }).click();
    await target.getByRole('dialog').getByRole('button', { name: 'KPI', exact: true }).click();
    await target.getByRole('button', { name: /^Tháng:/ }).click();
    await target.getByRole('radio', { name: '03/2025', exact: true }).click();
  }

  const admin = await browser.newPage({ ...devices['iPhone 13'] });
  await acknowledgeStartupReminder(admin);
  try {
    const seeded = await Promise.all(paths.map(([path, values]) => request.patch(`${emulator}/${path}`, {
      headers, data: { fields: Object.fromEntries(Object.entries(values).map(([key, value]) =>
        [key, typeof value === 'number' ? { integerValue: String(value) } : { stringValue: value }])) },
    })));
    for (const response of seeded) expect(response.ok()).toBe(true);
    await openKpi(page, 'Đăng nhập bằng Google');
    const rules = page.getByRole('button', { name: /^Cách tính KPI/ });
    const rulesFrame = rules.locator('..');
    await expect(rulesFrame).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(rulesFrame).toHaveCSS('border-top-width', '1px');
    await rules.click();
    const explanation = rulesFrame.getByRole('heading', { name: 'Công việc được tính' });
    await expect(explanation).toBeVisible();
    await expect(rulesFrame.getByRole('heading', { name: 'Điểm từng công việc' })).toBeVisible();
    await expect(rulesFrame.getByRole('heading', { name: 'Điểm KPI và xếp loại' })).toBeVisible();
    await expect(rulesFrame.getByText(/KPI \(%\) = Tổng điểm đạt được/)).toBeVisible();
    await rules.click();
    await expect(explanation).toHaveCount(0);
    await expect(page.getByText('Điểm đã chốt tự động: 07:00 01/04/2025.')).toBeVisible();
    await expect(page.getByText('92%', { exact: true })).toBeVisible();
    const pendingReview = page.getByText('Chờ duyệt', { exact: true }).locator('..');
    const completed = page.getByText('Xong', { exact: true }).locator('..');
    await expect(pendingReview.getByText('2', { exact: true })).toBeVisible();
    await expect(completed.getByText('1', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Đồng nghiệp demo' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Dự án: Toàn công ty' }).click();
    await page.getByRole('radio', { name: 'Marchix Mobile · Demo' }).click();
    await expect(page.getByText('45%', { exact: true })).toBeVisible();
    const grade = page.getByText('Xếp loại D');
    await expect(grade).toBeVisible();
    await expect(grade.getByText('Xếp loại', { exact: true })).toHaveCSS('font-weight', '700');
    await expect(grade).toHaveCSS('font-weight', '500');
    await expect(pendingReview.getByText('2', { exact: true })).toBeVisible();
    await expect(completed.getByText('0', { exact: true })).toBeVisible();
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
  const port = process.env.EXPO_PUBLIC_FIRESTORE_EMULATOR_PORT || 8080;
  const documents = `http://${host}:${port}/v1/projects/demo-marchix-mobile/databases/(default)/documents`;
  const headers = { Authorization: 'Bearer owner' };
  const plan = `${documents}/weekPlans/${employee}_${week}`;
  const farPlan = `${documents}/weekPlans/${employee}_${farWeek}`;
  const prior = await request.get(plan, { headers });
  const priorFields = prior.ok() ? (await prior.json()).fields : null;
  const priorFar = await request.get(farPlan, { headers });
  const priorFarFields = priorFar.ok() ? (await priorFar.json()).fields : null;
  const taskId = `test-week-plan-${Date.now()}`;
  const taskPath = `${documents}/tasks/${taskId}`;
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
  await acknowledgeStartupReminder(admin);
  try {
    expect((await request.patch(taskPath, { headers, data: { fields: fields({
      title, assigneeEmail: employee, status: 'Đang làm', due: shiftDay(week, 6),
    }) } })).ok()).toBeTruthy();
    expect((await request.patch(farTaskPath, { headers, data: { fields: fields({
      title: farTaskTitle, assigneeEmail: employee, status: 'Đang làm', due: farWeek,
    }) } })).ok()).toBeTruthy();
    expect((await request.patch(plan, { headers, data: { fields: fields({
      email: employee, week, priorities: 'Nội dung cũ', blockers: 'Hỗ trợ từ kế hoạch trên web', updatedAt: new Date().toISOString(),
    }) } })).ok()).toBeTruthy();

    await openPlanning(page, 'Đăng nhập bằng Google');
    await expect(page.getByText(/^(?:Thứ [2-7]|Chủ nhật), \d{2}\/\d{2}\/\d{4}$/)).toBeVisible();
    const suggestion = page.getByRole('button', { name: new RegExp(title) });
    await expect(suggestion).toBeVisible();
    await expect(suggestion.getByText('Trạng thái: Đang làm', { exact: true })).toBeVisible();
    await expect(suggestion.getByText('Hạn chót: ' + formatTaskDate(shiftDay(week, 6)), { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Đối chiếu checklist phát hành/ })).toHaveCount(0);
    await selectWeekOnCalendar(page, week, calendarDay);
    await expect(page.getByText(weekRange(nextWeek))).toBeVisible();
    await expect(suggestion).toHaveCount(0);
    await expect(page.getByText(/Việc hoàn thành tuần trước/)).toHaveCount(0);
    await page.getByRole('button', { name: 'Tuần này' }).click();
    await suggestion.click();
    const task = page.getByRole('dialog', { name: 'Chi tiết công việc' });
    await expect(task).toBeVisible();
    await expect(task.getByText(title, { exact: true })).toBeVisible();
    await task.getByRole('button', { name: 'Đóng chi tiết công việc' }).click();
    await expect(task).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Kế hoạch tuần', exact: true })).toBeVisible();
    await expect(suggestion).toBeVisible();
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
    await expect(page.getByText(weekRange(shiftDay(farWeek, -7)))).toBeVisible();
    await page.getByRole('button', { name: 'Tuần này' }).click();
    await expect(content).toHaveValue(updated);
    await selectWeekOnCalendar(page, week, farWeek);
    await expect(content).toHaveValue(farContent);
    const unfinished = 'Nội dung đang nhập dở cho tuần xa';
    await content.fill(unfinished);
    const farSuggestion = page.getByRole('button', { name: new RegExp(farTaskTitle) });
    await farSuggestion.click();
    await expect(task.getByText(farTaskTitle, { exact: true })).toBeVisible();
    await expect(task.getByRole('button', { name: 'Quay lại Kế hoạch tuần', exact: true })).toHaveCount(0);
    await task.getByRole('button', { name: 'Đóng chi tiết công việc', exact: true }).click();
    await expect(task).toBeHidden();
    await expect(page.getByText(weekRange(farWeek))).toBeVisible();
    await expect(content).toHaveValue(unfinished);
    await expect(page.getByText('Có thay đổi chưa lưu', { exact: true })).toBeVisible();
    expect((await (await request.get(farPlan, { headers })).json()).fields.priorities.stringValue).toBe(farContent);
    await expect(farSuggestion).toBeVisible();
    await page.getByRole('button', { name: 'Tuần sau' }).click();
    await expect(page.getByText(weekRange(shiftDay(farWeek, 7)))).toBeVisible();
    await page.getByRole('button', { name: 'Tuần này' }).click();
    await page.getByRole('button', { name: 'Tuần trước' }).click();
    await expect(page.getByText(weekRange(previousWeek))).toBeVisible();
    await page.getByRole('button', { name: 'Tuần sau' }).click();
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
    await expect(admin.getByText('Đã lưu', { exact: true }).first()).toBeVisible();
    await expect(admin.getByText('Chưa lưu', { exact: true }).first()).toBeVisible();
    await expect(admin.getByText(updated, { exact: true })).toBeVisible();
  } finally {
    await admin.close();
    await request.delete(taskPath, { headers });
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
    const settingsDrawer = page.getByRole('dialog');
    const drawerAvatar = settingsDrawer.getByRole('button', { name: 'Thông tin cá nhân' }).getByTestId('member-avatar');
    await expect(drawerAvatar).toHaveCSS('border-top-width', '1px');
    await expect(drawerAvatar).toHaveCSS('border-top-color', 'rgb(0, 0, 0)');
    await settingsDrawer.getByRole('button', { name: 'Cài đặt' }).click();
    const labels = ['Chung', 'Tài khoản', 'Chi cố định', 'Công & việc', 'Ngân sách', 'Lương & BH'];
    await expect(page.getByRole('tab')).toHaveText(labels);

    await openTab(labels[1]);
    await page.getByRole('button', { name: '+ Thêm tài khoản' }).click();
    const accountPopup = page.getByRole('dialog', { name: 'Thêm tài khoản', exact: true });
    await accountPopup.getByRole('textbox', { name: 'Tên hiển thị' }).fill('Nhân viên kiểm thử');
    await accountPopup.getByRole('textbox', { name: 'Email', exact: true }).fill(memberEmail);
    const projectSwitch = { name: 'Xem trao đổi và tệp dự án', exact: true };
    const addProjectAccess = accountPopup.getByRole('switch', projectSwitch);
    await expect(addProjectAccess).toBeEnabled();
    await expect(accountPopup.getByRole('switch', { name: 'Marchix Mobile · Demo', exact: true })).toHaveCount(0);
    await expect(addProjectAccess).toHaveAttribute('aria-checked', 'false');
    await addProjectAccess.click();
    await expect(addProjectAccess).toHaveAttribute('aria-checked', 'true');
    await accountPopup.getByRole('button', { name: 'Lưu cài đặt' }).click();
    await expect(accountPopup).toBeHidden();
    await expect.poll(async () => (await read(`members/${memberEmail}`))?.role?.stringValue).toBe('staff');
    const memberAvatar = page.getByRole('button', { name: /Nhân viên kiểm thử/ }).getByTestId('member-avatar');
    await expect(memberAvatar).toHaveCSS('border-top-width', '1px');
    await expect(memberAvatar).toHaveCSS('border-top-color', 'rgb(0, 0, 0)');
    await page.getByRole('button', { name: /Nhân viên kiểm thử/ }).click();
    const editAccountPopup = page.getByRole('dialog', { name: 'Chỉnh sửa tài khoản', exact: true });
    await expect(editAccountPopup).toBeVisible();
    await expect(editAccountPopup.getByRole('textbox', { name: 'Tên hiển thị' })).toHaveCount(0);
    await expect(editAccountPopup.getByRole('textbox', { name: 'Email', exact: true })).toHaveCount(0);
    await expect(editAccountPopup.getByRole('button', { name: 'Hủy', exact: true })).toHaveCount(0);
    const editProjectAccess = editAccountPopup.getByRole('switch', projectSwitch);
    await expect(editProjectAccess).toHaveAttribute('aria-checked', 'true');
    await editProjectAccess.click();
    await editAccountPopup.getByRole('button', { name: 'Lưu cài đặt' }).click();
    await expect(editAccountPopup).toBeHidden();

    await openTab(labels[2]);
    const expenseTable = page.getByRole('table', { name: 'Bảng chi phí cố định' });
    const emptyExpenses = page.getByText('Chưa có khoản chi cố định.', { exact: true });
    await expect(emptyExpenses).toBeVisible();
    await expect(expenseTable).toBeHidden();
    await page.getByRole('button', { name: '+ Thêm khoản chi' }).click();
    const expensePopup = page.getByRole('dialog', { name: 'Thêm khoản chi', exact: true });
    await expensePopup.getByRole('textbox', { name: 'Tên khoản chi' }).fill(expenseName);
    await expensePopup.getByRole('textbox', { name: 'Tên đối tượng' }).fill('Nhà cung cấp kiểm thử');
    await expensePopup.getByRole('textbox', { name: 'Số tiền / tháng' }).fill('85000');
    await expensePopup.getByRole('button', { name: 'Lưu cài đặt' }).click();
    await expect(expensePopup).toBeHidden();
    const deleteExpense = page.getByRole('button', { name: `Xóa khoản chi ${expenseName}`, exact: true });
    await expect(deleteExpense).toBeVisible();
    const { documents: recurring } = await (await fetch(`${base}/recurring`, { headers })).json();
    recurringId = recurring.find((item: { fields: { name: { stringValue: string } } }) =>
      item.fields.name.stringValue === expenseName).name.split('/').at(-1);
    await expect(emptyExpenses).toBeHidden();
    const expenseRow = expenseTable.getByRole('row').filter({ has: deleteExpense });
    await expect(expenseRow.getByRole('cell', { name: 'Nhà cung cấp kiểm thử' })).toBeVisible();
    await expect(expenseRow.getByRole('cell', { name: 'Đang áp dụng' })).toBeVisible();
    await expenseRow.getByRole('button', { name: `Sửa khoản chi ${expenseName}` }).click();
    const editExpense = page.getByRole('dialog', { name: 'Chỉnh sửa khoản chi cố định' });
    await expect(editExpense.getByRole('textbox', { name: 'Tên khoản chi' })).toHaveValue(expenseName);
    await editExpense.getByRole('button', { name: 'Đóng chỉnh sửa khoản chi cố định' }).click();
    const total = expenseTable.getByRole('row').filter({ hasText: 'Tổng chi phí cố định / tháng' });
    await expect(total).toContainText(/85[.]000\s*₫/);
    await deleteExpense.click();
    const confirm = page.getByRole('alertdialog', { name: 'Xác nhận xóa khoản chi cố định' });
    await confirm.getByRole('button', { name: 'Hủy' }).click();
    await expect(deleteExpense).toBeVisible();
    await deleteExpense.click();
    await confirm.getByRole('button', { name: 'Xóa khoản chi' }).click();
    await expect(deleteExpense).toBeHidden();
    await expect(emptyExpenses).toBeVisible();
    await expect(expenseTable).toBeHidden();
    expect((await fetch(`${base}/recurring/${recurringId}`, { headers })).status).toBe(404);

    await openTab(labels[3]);
    const gpsToggle = page.getByRole('switch', { name: 'Chỉ cho chấm công tại văn phòng (GPS)', exact: true });
    const workHeading = page.getByRole('heading', { name: 'Chấm công & công việc' });
    const workPanel = workHeading.locator('..');
    const saveWork = page.getByRole('button', { name: 'Lưu cài đặt', exact: true });
    const inlineSaveWork = workPanel.getByRole('button', { name: 'Lưu cài đặt', exact: true });
    const saveDock = saveWork.locator('../..');
    async function expectDockAligned() {
      await expect.poll(async () => {
        const [panel, dock] = await Promise.all([workPanel.boundingBox(), saveDock.boundingBox()]);
        if (!panel || !dock) return Infinity;
        return Math.max(Math.abs(panel.x - dock.x), Math.abs(panel.x + panel.width - dock.x - dock.width));
      }).toBeLessThanOrEqual(1);
    }
    async function scrollWork(toBottom: boolean) {
      await workHeading.evaluate((heading, bottom) => {
        let viewport = heading.parentElement;
        while (viewport && getComputedStyle(viewport).overflowY !== 'auto') viewport = viewport.parentElement;
        if (!viewport) throw new Error('Không tìm thấy vùng cuộn cài đặt');
        viewport.scrollTop = bottom ? viewport.scrollHeight : 0;
      }, toBottom);
    }
    await expect(saveWork).toBeInViewport({ ratio: 1 });
    await expect(inlineSaveWork).toHaveCount(0);
    await expectDockAligned();
    const mobileViewport = page.viewportSize()!;
    const scrollbar = await page.addStyleTag({ content: '::-webkit-scrollbar { width: 16px; }' });
    await page.setViewportSize({ width: 1060, height: mobileViewport.height });
    await expectDockAligned();
    await scrollbar.evaluate(element => { element.parentNode?.removeChild(element); });
    await page.setViewportSize(mobileViewport);
    await scrollWork(true);
    await expect(inlineSaveWork).toBeInViewport({ ratio: 1 });
    await expect(saveWork).toHaveCount(1);
    await scrollWork(false);
    await expect(saveWork).toBeInViewport({ ratio: 1 });
    await expect(inlineSaveWork).toHaveCount(0);
    const reminderToggle = page.getByRole('switch', { name: 'Nhắc quên chấm công', exact: true });
    const remindInHour = page.getByRole('button', { name: /^Nhắc quên chấm vào lúc – Giờ:/ });
    const remindInMinute = page.getByRole('button', { name: /^Nhắc quên chấm vào lúc – Phút:/ });
    const remindOutHour = page.getByRole('button', { name: /^Nhắc quên chấm ra lúc – Giờ:/ });
    const remindOutMinute = page.getByRole('button', { name: /^Nhắc quên chấm ra lúc – Phút:/ });
    await expect(reminderToggle).toHaveAttribute('aria-checked', 'false');
    await expect(remindInHour).toHaveCount(0);
    await expect(remindOutHour).toHaveCount(0);
    await reminderToggle.click();
    await expect(reminderToggle).toHaveAttribute('aria-checked', 'true');
    const reminderBoxes = await Promise.all([remindInHour, remindInMinute, remindOutHour, remindOutMinute]
      .map(button => button.boundingBox()));
    expect(reminderBoxes.every(box => box?.y === reminderBoxes[0]?.y)).toBe(true);
    expect(reminderBoxes[0]!.y).toBeGreaterThan((await reminderToggle.boundingBox())!.y);
    expect(reminderBoxes[0]!.y).toBeLessThan((await gpsToggle.boundingBox())!.y);
    await remindInMinute.click();
    await page.getByRole('radiogroup', { name: 'Nhắc quên chấm vào lúc – Phút' })
      .getByRole('radio', { name: '35', exact: true }).click();
    await reminderToggle.click();
    await expect(remindInMinute).toHaveCount(0);
    await reminderToggle.click();
    await expect(remindInMinute).toHaveAccessibleName('Nhắc quên chấm vào lúc – Phút: 35');
    const thumb = gpsToggle.getByTestId('settings-switch-thumb');
    const officeCoordinates = page.getByRole('heading', { name: 'Tọa độ văn phòng', exact: true });
    const latitude = page.getByRole('textbox', { name: 'Vĩ độ (độ)', exact: true });
    const longitude = page.getByRole('textbox', { name: 'Kinh độ (độ)', exact: true });
    const radius = page.getByRole('textbox', { name: 'Bán kính cho phép (m)', exact: true });
    await expect(gpsToggle).toBeVisible();
    const initialGps = (await gpsToggle.getAttribute('aria-checked')) === 'true';
    await expect(officeCoordinates).toHaveCount(initialGps ? 1 : 0);
    await expect(thumb).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(thumb).toHaveCSS('box-shadow', 'rgb(0, 0, 0) 0px 0px 0px 0.5px inset');
    await gpsToggle.click();
    await expect(gpsToggle).toHaveAttribute('aria-checked', String(!initialGps));
    await expect(officeCoordinates).toHaveCount(initialGps ? 0 : 1);
    await expect(thumb).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(thumb).toHaveCSS('box-shadow', 'rgb(0, 0, 0) 0px 0px 0px 0.5px inset');
    await gpsToggle.press('Space');
    await expect(gpsToggle).toHaveAttribute('aria-checked', String(initialGps));
    if (!initialGps) await gpsToggle.click();
    await expect(officeCoordinates).toBeVisible();
    await expect(radius).toBeVisible();
    const latitudeBox = (await latitude.boundingBox())!;
    const longitudeBox = (await longitude.boundingBox())!;
    const radiusBox = (await radius.boundingBox())!;
    const radiusLabelBox = (await page.getByText(/^Bán kính cho phép/).boundingBox())!;
    expect(latitudeBox.y).toBe(longitudeBox.y);
    expect(longitudeBox.x).toBeLessThan(latitudeBox.x);
    expect(radiusBox.y).toBeGreaterThan(latitudeBox.y);
    expect(radiusLabelBox.x + radiusLabelBox.width).toBeLessThan(radiusBox.x);
    expect(radiusBox.y + radiusBox.height / 2).toBeCloseTo(radiusLabelBox.y + radiusLabelBox.height / 2 + 3, 0);
    await expect(latitude.locator('..').getByText('°', { exact: true })).toBeVisible();
    await expect(longitude.locator('..').getByText('°', { exact: true })).toBeVisible();
    const shiftHour = page.getByRole('button', { name: /^Giờ vào ca – Giờ:/ });
    const shiftOutHour = page.getByRole('button', { name: /^Giờ ra ca – Giờ:/ });
    await expect(page.getByRole('heading', { name: 'Giờ vào/ra ca' })).toBeVisible();
    const shiftInPosition = (await shiftHour.boundingBox())!;
    const shiftOutPosition = (await shiftOutHour.boundingBox())!;
    expect(shiftInPosition.y).toBe(shiftOutPosition.y);
    expect(shiftInPosition.x).toBeLessThan(shiftOutPosition.x);
    await shiftHour.click();
    await page.getByRole('radio', { name: '08', exact: true }).click();
    await page.getByRole('button', { name: /^Giờ vào ca – Phút:/ }).click();
    await page.getByRole('radio', { name: '15', exact: true }).click();
    const graceInput = page.getByRole('textbox', { name: 'Phút đi muộn cho phép', exact: true });
    const graceLabelPosition = (await page.getByText(/^Phút đi muộn cho phép/).boundingBox())!;
    const graceInputPosition = (await graceInput.boundingBox())!;
    expect(graceLabelPosition.x + graceLabelPosition.width).toBeLessThan(graceInputPosition.x);
    expect(graceInputPosition.y + graceInputPosition.height / 2)
      .toBeCloseTo(graceLabelPosition.y + graceLabelPosition.height / 2 + 3, 0);
    await graceInput.fill('12');
    const monday = page.getByRole('button', { name: /^Thứ 2:/ });
    await monday.click();
    await page.getByRole('radiogroup', { name: 'Thứ 2' }).getByRole('radio', { name: 'Nửa ngày' }).click();
    await expect(monday).toHaveAccessibleName('Thứ 2: Nửa ngày');
    const inputFontSize = await latitude.evaluate(input => getComputedStyle(input).fontSize);
    await expect(shiftHour.getByText('08', { exact: true })).toHaveCSS('font-size', inputFontSize);
    await expect(monday.getByText('Nửa ngày', { exact: true })).toHaveCSS('font-size', inputFontSize);
    await expect(page.getByRole('heading', { name: 'Thời gian nghỉ trưa' })).toBeVisible();
    const lunchStart = page.getByRole('button', { name: /^Nghỉ trưa từ – Giờ:/ });
    const lunchEnd = page.getByRole('button', { name: /^Nghỉ trưa đến – Giờ:/ });
    const fromPosition = (await lunchStart.boundingBox())!;
    const untilPosition = (await lunchEnd.boundingBox())!;
    expect(fromPosition.y).toBe(untilPosition.y);
    expect(fromPosition.x).toBeLessThan(untilPosition.x);
    await lunchStart.click();
    await page.getByRole('radio', { name: '12', exact: true }).click();
    await page.getByRole('button', { name: /^Nghỉ trưa từ – Phút:/ }).click();
    await page.getByRole('radio', { name: '15', exact: true }).click();
    const overrideDate = todayInVietnam();
    const overrideLabel = formatTaskDate(overrideDate);
    await page.getByRole('button', { name: 'Thiết lập ngày cụ thể', exact: true }).click();
    const calendar = page.getByRole('dialog', { name: 'Thiết lập ngày cụ thể' });
    await calendar.getByRole('button', { name: `Ngày ${overrideLabel}`, exact: true }).click();
    await calendar.getByRole('button', { name: /^Lịch làm việc trong ngày:/ }).click();
    await page.getByRole('radiogroup', { name: 'Lịch làm việc trong ngày' })
      .getByRole('radio', { name: 'Nghỉ', exact: true }).click();
    await calendar.getByRole('button', { name: 'Áp dụng cho ngày này' }).click();
    await expect(calendar.getByRole('button', { name: `Ngày ${overrideLabel}, Nghỉ`, exact: true })
      .getByTestId('calendar-day-marker')).toBeVisible();
    await calendar.getByRole('button', { name: 'Đóng lịch' }).click();
    const overrideRows = page.getByRole('button', { name: /^Sửa lịch ngày / });
    await expect(overrideRows).toHaveCount(0);
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
      lunchFrom: { stringValue: '12:15' },
      grace: { integerValue: '12' },
      dayOverrides: { mapValue: { fields: { [overrideDate]: { integerValue: '0' } } } },
      remindIn: { stringValue: '08:35' },
      remindOut: { stringValue: '17:45' },
      gpsOn: { booleanValue: true },
      gpsLat: { doubleValue: -12.345 },
      gpsLng: { doubleValue: -98.765 },
      gpsRadius: { integerValue: '250' },
    });
    await openTab(labels[0]);
    await expect(latitude).toHaveCount(0);
    await openTab(labels[3]);
    await expect(reminderToggle).toHaveAttribute('aria-checked', 'true');
    await expect(remindInMinute).toHaveAccessibleName('Nhắc quên chấm vào lúc – Phút: 35');
    await expect(latitude).toHaveValue('-12.345');
    await expect(longitude).toHaveValue('-98.765');
    await expect(radius).toHaveValue('250');
    await expect(overrideRows).toHaveCount(0);
    const nextMonth = shiftDay(overrideDate.slice(0, 7) + '-01', 32).slice(0, 7) + '-01';
    const followingMonth = shiftDay(nextMonth, 32).slice(0, 7) + '-01';
    const rangeStart = shiftDay(followingMonth, -2);
    const rangeEnd = shiftDay(followingMonth, 1);
    const dayButton = (day: string, description?: string) => calendar.getByRole('button', {
      name: `Ngày ${formatTaskDate(day)}${description ? ', ' + description : ''}`, exact: true,
    });
    const workdayChoice = (label: string, choice: string) =>
      page.getByRole('radiogroup', { name: label }).getByRole('radio', { name: choice, exact: true });
    const rangeEditor = 'Lịch làm việc cho khoảng ngày';

    await page.getByRole('button', { name: 'Thiết lập ngày cụ thể', exact: true }).click();
    const legend = calendar.getByRole('group', { name: 'Chú thích lịch làm việc' });
    const legendColor = (label: string) => legend.getByText(label, { exact: true }).locator('..')
      .getByTestId('calendar-legend-marker').evaluate(dot => getComputedStyle(dot).backgroundColor);
    const [fullDayColor, halfDayColor, offDayColor] = await Promise.all(['Cả ngày', 'Nửa ngày', 'Nghỉ'].map(legendColor));
    expect(new Set([fullDayColor, halfDayColor, offDayColor]).size).toBe(3);
    await expect(dayButton(overrideDate, 'Nghỉ').getByTestId('calendar-day-marker')).toHaveCSS('background-color', offDayColor);
    await calendar.getByRole('button', { name: 'Tháng sau', exact: true }).click();
    const firstDay = dayButton(rangeStart);
    await firstDay.scrollIntoViewIfNeeded();
    const box = (await firstDay.boundingBox())!;
    const touch = await page.context().newCDPSession(page);
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
    });
    await expect(calendar.getByText(`Đã chọn ngày đầu ${formatTaskDate(rangeStart)}. Chọn ngày cuối.`)).toBeVisible();
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await touch.detach();
    await calendar.getByRole('button', { name: 'Tháng sau', exact: true }).click();
    await dayButton(rangeEnd).tap();
    await expect(dayButton(followingMonth)).toHaveAttribute('aria-pressed', 'true');
    await expect(dayButton(rangeEnd)).toHaveAttribute('aria-pressed', 'true');
    await calendar.getByRole('button', { name: new RegExp('^' + rangeEditor + ':') }).click();
    await workdayChoice(rangeEditor, 'Nửa ngày').click();
    await calendar.getByRole('button', { name: 'Áp dụng cho các ngày đã chọn' }).click();
    await expect(dayButton(followingMonth, 'Nửa ngày').getByTestId('calendar-day-marker')).toHaveCSS('background-color', halfDayColor);
    await expect(dayButton(rangeEnd, 'Nửa ngày').getByTestId('calendar-day-marker')).toHaveCSS('background-color', halfDayColor);
    const rangeDates = [rangeStart, shiftDay(rangeStart, 1), followingMonth, rangeEnd];
    const readOverrides = async () => (await read('settings/work'))?.dayOverrides?.mapValue?.fields;

    await calendar.getByRole('button', { name: 'Tháng trước', exact: true }).click();
    await expect(dayButton(rangeStart, 'Nửa ngày').getByTestId('calendar-day-marker')).toHaveCSS('background-color', halfDayColor);
    await dayButton(rangeStart, 'Nửa ngày').tap();
    await expect(dayButton(rangeStart, 'Nửa ngày').getByTestId('calendar-day-marker')).toHaveCSS('background-color', halfDayColor);
    await calendar.getByRole('button', { name: 'Lịch làm việc trong ngày: Nửa ngày' }).click();
    await workdayChoice('Lịch làm việc trong ngày', 'Cả ngày').click();
    await calendar.getByRole('button', { name: 'Áp dụng cho ngày này' }).click();
    await expect(dayButton(rangeStart, 'Cả ngày').getByTestId('calendar-day-marker')).toHaveCSS('background-color', fullDayColor);
    await calendar.getByRole('button', { name: 'Đóng lịch' }).click();
    await page.getByRole('button', { name: 'Lưu cài đặt' }).click();
    await expect.poll(readOverrides).toMatchObject(Object.fromEntries(rangeDates.map(day =>
      [day, day === rangeStart ? { integerValue: '1' } : { doubleValue: 0.5 }])));
    await expect(overrideRows).toHaveCount(0);
    await page.getByRole('button', { name: 'Thiết lập ngày cụ thể', exact: true }).click();
    await calendar.getByRole('button', { name: 'Tháng sau', exact: true }).click();
    await expect(dayButton(rangeStart, 'Cả ngày').getByTestId('calendar-day-marker')).toHaveCSS('background-color', fullDayColor);
    await calendar.getByRole('button', { name: 'Đóng lịch' }).click();

    await page.getByRole('button', { name: 'Mở menu' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Chấm công', exact: true }).click();
    await expect(page.getByText(/Ca làm việc:\s*Ngày nghỉ/)).toBeVisible();
    await page.getByRole('button', { name: 'Mở menu' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cài đặt', exact: true }).click();
    await openTab(labels[3]);
    await page.getByRole('button', { name: 'Thiết lập ngày cụ thể', exact: true }).click();
    await dayButton(overrideDate, 'Nghỉ').tap();
    await calendar.getByRole('button', { name: 'Dùng lại lịch cố định' }).click();
    await expect(dayButton(overrideDate)).toHaveAttribute('aria-pressed', 'true');
    await expect(dayButton(overrideDate).getByTestId('calendar-day-marker')).toHaveCount(0);
    await expect(calendar.getByRole('button', { name: 'Dùng lại lịch cố định' })).toHaveCount(0);
    const weekdayIndex = new Date(overrideDate + 'T00:00:00Z').getUTCDay();
    const weeklyLabel = ['Nghỉ', 'Nửa ngày', 'Cả ngày', 'Cả ngày', 'Cả ngày', 'Cả ngày', 'Nửa ngày'][weekdayIndex];
    await expect(calendar.getByRole('button', { name: `Lịch làm việc trong ngày: ${weeklyLabel}`, exact: true })).toBeVisible();
    await calendar.getByRole('button', { name: 'Tháng sau', exact: true }).click();
    await dayButton(rangeStart, 'Cả ngày').tap();
    await expect(dayButton(rangeStart, 'Cả ngày')).toHaveAttribute('aria-pressed', 'true');
    await calendar.getByRole('button', { name: 'Đóng lịch' }).click();
    await radius.fill('');
    await gpsToggle.click();
    await reminderToggle.click();
    await expect(remindInMinute).toHaveCount(0);
    await expect(remindOutMinute).toHaveCount(0);
    await expect(latitude).toHaveCount(0);
    await expect(longitude).toHaveCount(0);
    await expect(radius).toHaveCount(0);
    await page.getByRole('button', { name: 'Lưu cài đặt' }).click();
    await expect.poll(async () => (await read('settings/work'))?.dayOverrides?.mapValue?.fields?.[overrideDate]).toBeUndefined();
    await expect.poll(() => read('settings/work')).toMatchObject({
      gpsOn: { booleanValue: false },
      gpsRadius: { integerValue: '250' },
      remindIn: { stringValue: '' },
      remindOut: { stringValue: '' },
    });
    await page.getByRole('button', { name: 'Thiết lập ngày cụ thể', exact: true }).click();
    await expect(dayButton(overrideDate).getByTestId('calendar-day-marker')).toHaveCount(0);
    await calendar.getByRole('button', { name: 'Đóng lịch' }).click();

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
    const projectPath = 'projects/marchix-mobile-demo';
    const collaborators: { stringValue: string }[] = (await read(projectPath))?.collaborators?.arrayValue?.values ?? [];
    if (collaborators.some(member => member.stringValue === memberEmail)) {
      await fetch(`${base}/${projectPath}?updateMask.fieldPaths=collaborators`, {
        method: 'PATCH', headers, body: JSON.stringify({
          fields: { collaborators: { arrayValue: { values: collaborators.filter(member => member.stringValue !== memberEmail) } } },
        }),
      });
    }
    await fetch(`${base}/members/${memberEmail}`, { method: 'DELETE', headers });
    if (recurringId) await fetch(`${base}/recurring/${recurringId}`, { method: 'DELETE', headers });
  }
});

test('Nhắc hạn chỉ hiện việc được giao trong khoảng đã chọn và mở được chi tiết', async ({ page }) => {
  const host = process.env.EXPO_PUBLIC_EMULATOR_HOST || '127.0.0.1';
  const port = process.env.EXPO_PUBLIC_FIRESTORE_EMULATOR_PORT || 8080;
  const collection = `http://${host}:${port}/v1/projects/demo-marchix-mobile/databases/(default)/documents/tasks`;
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
    await page.getByRole('button', { name: 'Đăng nhập bằng Google' }).click();
    const openMenu = page.getByRole('button', { name: 'Mở menu' });
    const drawer = page.getByRole('dialog');
    await openMenu.click();
    await drawer.getByRole('button', { name: 'Cài đặt' }).click();
    const reminderSwitch = page.getByRole('switch', { name: 'Nhắc hạn công việc' });
    await expect(reminderSwitch).not.toBeChecked();
    await reminderSwitch.click();
    await expect(page.getByRole('radio', { name: 'Trước 1 ngày' })).toBeChecked();
    await openMenu.click();
    await drawer.getByRole('button', { name: 'Công việc' }).click();
    await page.getByRole('button', { name: /công việc đến hạn.*Xem/i }).click();
    for (const task of cases.slice(1)) {
      await expect(page.getByRole('button', { name: new RegExp(`^${task.title}`) })).toHaveCount(0);
    }
    await page.getByRole('button', { name: new RegExp(`^${cases[0].title}`) }).click();
    await expect(page.getByRole('heading', { name: cases[0].title })).toBeVisible();
    await page.getByRole('button', { name: 'Đóng chi tiết công việc' }).click();
    await openMenu.click();
    await drawer.getByRole('button', { name: 'Cài đặt' }).click();
    await expect(reminderSwitch).toBeChecked();
    await reminderSwitch.click();
    await expect(reminderSwitch).not.toBeChecked();
    await openMenu.click();
    await drawer.getByRole('button', { name: 'Công việc' }).click();
    await expect(page.getByRole('button', { name: /công việc đến hạn.*Xem/i })).toHaveCount(0);
  } finally {
    await Promise.all(documents.map(doc => fetch(doc, { method: 'DELETE', headers })));
  }
});

test('Quản trị viên xem và mở được công việc của thành viên khác', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(previewUrl);
  await page.getByRole('button', { name: 'Đăng nhập quản trị (mô phỏng)' }).click();
  await openTasks(page);
  const statBoxes: { x: number; y: number; width: number }[] = [];
  for (const [label, background, color] of [
    ['Chưa làm', 'rgb(240, 237, 249)', 'rgb(100, 90, 116)'],
    ['Đang làm', 'rgb(228, 240, 253)', 'rgb(21, 80, 131)'],
    ['Vướng', 'rgb(251, 232, 229)', 'rgb(158, 52, 43)'],
    ['Chờ duyệt', 'rgb(253, 241, 215)', 'rgb(128, 81, 12)'],
    ['Xong', 'rgb(221, 243, 237)', 'rgb(11, 97, 85)'],
    ['Quá hạn', 'rgb(240, 234, 253)', 'rgb(96, 65, 189)'],
  ]) {
    const card = page.getByLabel(new RegExp(`^${label}: \\d+ công việc$`));
    const count = card.getByText(/^\d+$/);
    await expect(card).toHaveCSS('background-color', background);
    await expect(count).toHaveCSS('color', color);
    const labelBox = await card.getByText(label, { exact: true }).boundingBox();
    const countBox = await count.boundingBox();
    expect(labelBox && countBox && countBox.y >= labelBox.y + labelBox.height).toBe(true);
    statBoxes.push((await card.boundingBox())!);
  }
  await expect(page.getByLabel(/^(Chưa xong|Khác|Đã xong): \d+ công việc$/)).toHaveCount(0);
  expect(statBoxes.slice(0, 3).map(box => box.y)).toEqual(Array(3).fill(statBoxes[0].y));
  expect(statBoxes.slice(3).map(box => box.y)).toEqual(Array(3).fill(statBoxes[3].y));
  expect(statBoxes[3].y).toBeGreaterThan(statBoxes[0].y);
  for (let column = 0; column < 3; column++) {
    expect(statBoxes[column].x).toBeCloseTo(statBoxes[column + 3].x);
    expect(statBoxes[column].width).toBeCloseTo(statBoxes[column + 3].width);
  }
  const title = 'Việc riêng của đồng nghiệp';
  await page.getByRole('button', { name: `Mở công việc: ${title}` }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
});

test('Popup giao và sửa việc hiển thị mức ưu tiên và các trạng thái phù hợp', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(previewUrl);
  await page.getByRole('button', { name: 'Đăng nhập người giao việc (mô phỏng)' }).click();
  await openTasks(page);
  const statuses = ['Chưa làm', 'Đang làm', 'Vướng', 'Chờ duyệt', 'Xong'];
  const tones = await Promise.all(statuses.map(async status => {
    const stat = page.getByLabel(new RegExp(`^${status}: \\d+ công việc$`));
    const background = await stat.evaluate(element => getComputedStyle(element).backgroundColor);
    const color = await stat.getByText(status, { exact: true }).evaluate(element => getComputedStyle(element).color);
    return { status, background, color };
  }));

  async function checkChoices(title: string, label: string, selected: string) {
    const form = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
    await form.getByRole('button', { name: 'Tùy chọn', exact: true }).click();
    const group = form.getByRole('radiogroup', { name: label, exact: true });
    const availableTones = tones.slice(0, 3);
    await expect(group.getByRole('radio')).toHaveText(availableTones.map(({ status }) => status));
    for (const { status, background, color } of availableTones) {
      const choice = group.getByRole('radio', { name: status, exact: true });
      await expect(choice).toHaveCSS('background-color', background);
      await expect(choice.getByText(status, { exact: true })).toHaveCSS('color', color);
      await expect(choice).toBeEnabled();
    }
    await expect(group.getByRole('radio', { name: selected, exact: true })).toBeChecked();
    return group;
  }

  await page.getByRole('button', { name: '+ Giao việc', exact: true }).click();
  const createTask = page.getByRole('button', { name: 'Tạo công việc', exact: true });
  await expect(createTask.locator('..')).toHaveCSS('border-top-width', '0px');
  await expect(createTask.getByText('Tạo công việc')).toHaveCSS('font-weight', '500');
  const emptyAssignee = page.getByRole('button', { name: 'Người thực hiện: Chưa thiết lập', exact: true });
  await expect(emptyAssignee).toBeVisible({ timeout: 15_000 });
  await expect(emptyAssignee.getByText('Chưa thiết lập', { exact: true })).toHaveCSS('color', 'rgb(118, 118, 118)');
  const emptyDue = page.getByRole('button', { name: 'Hạn chót, Chưa thiết lập', exact: true });
  await expect(emptyDue.getByText('Chưa thiết lập', { exact: true })).toHaveCSS('color', 'rgb(118, 118, 118)');
  const priorities = page.getByRole('radiogroup', { name: 'Mức độ ưu tiên', exact: true });
  await expect(priorities.getByRole('radio')).toHaveText(['Cao', 'Trung bình', 'Thấp']);
  for (const [priority, background, color] of [
    ['Cao', tones[2].background, tones[2].color],
    ['Trung bình', 'rgb(255, 240, 213)', 'rgb(135, 80, 9)'],
    ['Thấp', tones[4].background, tones[4].color],
  ]) {
    const choice = priorities.getByRole('radio', { name: priority, exact: true });
    await expect(choice).toHaveCSS('background-color', background);
    await expect(choice).toHaveCSS('border-top-left-radius', '13px');
    await expect(choice.getByText(priority, { exact: true })).toHaveCSS('color', color);
    await expect(choice.getByText(priority, { exact: true })).toHaveCSS('font-weight', '700');
  }
  const highPriority = priorities.getByRole('radio', { name: 'Cao', exact: true });
  await highPriority.click();
  await expect(highPriority).toBeChecked();
  await expect(highPriority).toHaveCSS('border-top-color', tones[2].color);
  const initial = await checkChoices('Giao việc mới', 'Tình trạng ban đầu', 'Chưa làm');
  await expect(page.getByRole('dialog').getByText(/Chờ duyệt|^Xong$/)).toHaveCount(0);
  const blocked = initial.getByRole('radio', { name: 'Vướng', exact: true });
  await blocked.click();
  await expect(blocked).toBeChecked();
  await expect(blocked).toHaveCSS('border-top-color', tones[2].color);
  await page.getByRole('button', { name: 'Đóng giao việc', exact: true }).click();

  await page.getByRole('button', { name: 'Mở công việc: Kiểm tra giao diện trên điện thoại', exact: true }).click();
  await page.getByRole('button', { name: 'Chỉnh sửa', exact: true }).click();
  await checkChoices('Chỉnh sửa công việc', 'Trạng thái', 'Đang làm');
  await page.getByRole('button', { name: 'Đóng chỉnh sửa', exact: true }).click();
  await page.getByRole('button', { name: 'Đóng chi tiết công việc', exact: true }).click();

  await page.getByRole('button', { name: 'Mở công việc: Rà soát tài liệu hướng dẫn', exact: true }).click();
  await page.getByRole('button', { name: 'Chỉnh sửa', exact: true }).click();
  const lockedForm = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Chỉnh sửa công việc', exact: true }) });
  await lockedForm.getByRole('button', { name: 'Tùy chọn', exact: true }).click();
  await expect(lockedForm.getByText('Chờ duyệt', { exact: true })).toBeVisible();
  await expect(lockedForm.getByRole('radiogroup', { name: 'Trạng thái', exact: true })).toHaveCount(0);
});

test('Công việc giữ bộ lọc và chế độ Kanban khi mở chi tiết', async ({ page }) => {
  await page.goto(previewUrl);
  await page.getByRole('button', { name: 'Đăng nhập bằng Google' }).click();
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
  const lastFilter = (await page.getByRole('button', { name: /^Hạng mục:/ }).boundingBox())!;
  expect((await search.boundingBox())!.y).toBeGreaterThan(lastFilter.y + lastFilter.height);
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
  const emptyMessage = page.getByText('Không có việc phù hợp', { exact: true });
  const emptyState = emptyMessage.locator('..');
  const emptyIcon = emptyState.locator('img');
  await expect(emptyMessage).toBeVisible();
  await expect(emptyMessage).toHaveCSS('color', 'rgb(114, 114, 114)');
  await expect(emptyState).toHaveCSS('opacity', '0.9');
  await expect(emptyIcon).toHaveAttribute('src', /search\.png/);
  const iconBounds = (await emptyIcon.locator('..').boundingBox())!;
  expect(iconBounds.y + iconBounds.height).toBeLessThan((await emptyMessage.boundingBox())!.y);
  await expect(status).toHaveAccessibleName('Trạng thái: Xong');
  await expect(status).toHaveAttribute('aria-expanded', 'false');
  await status.click();
  await page.getByRole('radio', { name: 'Chưa làm', exact: true }).click();
  await kanban.click();
  await card.scrollIntoViewIfNeeded();
  const cardBefore = (await card.boundingBox())!;
  await card.click();
  const taskPopup = page.getByRole('dialog', { name: 'Chi tiết công việc', exact: true });
  await expect(taskPopup.getByRole('heading', { name: task })).toBeVisible();
  await expect(taskPopup.getByRole('progressbar', { name: 'Tiến độ công việc' })).toBeVisible();
  await taskPopup.getByRole('button', { name: 'Đóng chi tiết công việc' }).click();
  await expect(taskPopup).toBeHidden();
  expect((await card.boundingBox())!.y).toBeCloseTo(cardBefore.y, 0);
  await expect(search).toHaveValue('cap nhat huong dan');
  await expect(status).toHaveAccessibleName('Trạng thái: Chưa làm');
  await expect(assignee).toHaveAccessibleName('Người thực hiện: Nhân viên demo');
  await expect(page.getByRole('heading', { name: 'Chưa làm' })).toBeVisible();
  await expect(card).toBeVisible();

  await page.getByRole('button', { name: 'Xóa bộ lọc' }).click();
  await expect(search).toHaveValue('');
  await expect(status).toHaveAccessibleName('Trạng thái: Tất cả');
  await expect(assignee).toHaveAccessibleName('Người thực hiện: Tất cả');

  await page.getByRole('button', { name: 'Danh sách', exact: true }).click();
  const category = page.getByRole('button', { name: /^Hạng mục:/ });
  const projectCard = page.getByRole('button', { name: 'Mở công việc: Kiểm tra giao diện trên điện thoại' });
  await category.click();
  await page.getByRole('radio', { name: 'Marchix Mobile · Demo', exact: true }).click();
  await expect(projectCard).toBeVisible();
  await expect(card).toHaveCount(0);
  await projectCard.click();
  await expect(taskPopup.getByRole('heading', { name: 'Kiểm tra giao diện trên điện thoại' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(taskPopup).toBeHidden();
  await page.getByRole('button', { name: 'Biểu đồ Gantt', exact: true }).click();
  const ganttRow = (await projectCard.boundingBox())!;
  const ganttProgress = (await projectCard.getByText(/^\d+%$/).boundingBox())!;
  expect(Math.abs(ganttProgress.y + ganttProgress.height / 2 - (ganttRow.y + ganttRow.height / 2))).toBeLessThan(1);
  const range = page.getByRole('button', { name: /^Khung thời gian:/ });
  const ganttCount = range.locator('../..').getByRole('heading', { name: /^\d+ công việc$/ });
  const countBox = (await ganttCount.boundingBox())!;
  const rangeBox = (await range.boundingBox())!;
  expect(rangeBox.x).toBeGreaterThan(countBox.x + countBox.width);
  expect(rangeBox.y + rangeBox.height / 2).toBeCloseTo(countBox.y + countBox.height / 2);
  const ganttDates = page.getByLabel('Trục thời gian công việc').getByText(/^\d{2}\/\d{2}$/);
  await expect(range).toHaveAccessibleName('Khung thời gian: Theo tháng');
  const [year, month] = todayInVietnam().split('-');
  const monthDays = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  await expect(ganttDates).toHaveCount(monthDays);
  await expect(ganttDates.first()).toHaveText(`01/${month}`);
  await expect(ganttDates.last()).toHaveText(`${monthDays}/${month}`);
  const rangeBackground = await range.evaluate(element => getComputedStyle(element).backgroundColor);
  await range.click();
  await page.getByRole('radiogroup', { name: 'Khung thời gian' }).getByRole('radio', { name: 'Theo tuần', exact: true }).click();
  await expect(range).toHaveCSS('background-color', rangeBackground);
  const monday = mondayOf(todayInVietnam());
  await expect(ganttDates).toHaveText(Array.from({ length: 7 }, (_, index) => formatTaskDate(shiftDay(monday, index)).slice(0, 5)));
  await projectCard.click();
  await expect(taskPopup.getByRole('heading', { name: 'Kiểm tra giao diện trên điện thoại' })).toBeVisible();
  await taskPopup.getByRole('button', { name: 'Đóng chi tiết công việc' }).click();
  await expect(range).toHaveAccessibleName('Khung thời gian: Theo tuần');
  await page.getByRole('button', { name: 'Danh sách', exact: true }).click();
  await expect(range).toHaveCount(0);
  await category.click();
  await page.getByRole('radio', { name: 'Chung toàn công ty', exact: true }).click();
  await expect(card).toBeVisible();
  await expect(projectCard).toHaveCount(0);
  await page.getByRole('button', { name: 'Xóa bộ lọc' }).click();
  await expect(category).toHaveAccessibleName('Hạng mục: Tất cả');
  await expect(projectCard).toBeVisible();
});

test('Gantt dùng màu riêng và chạm để làm nổi bật từng công việc', async ({ page, request }) => {
  const host = process.env.EXPO_PUBLIC_EMULATOR_HOST || '127.0.0.1';
  const port = process.env.EXPO_PUBLIC_FIRESTORE_EMULATOR_PORT || 8080;
  const base = `http://${host}:${port}/v1/projects/demo-marchix-mobile/databases/(default)/documents/tasks`;
  const headers = { Authorization: 'Bearer owner' };
  const email = 'nhanvien@example.test';
  const start = `${todayInVietnam().slice(0, 7)}-01`;
  const runId = Date.now();
  const titles = [`Gantt kiểm thử A ${runId}`, `Gantt kiểm thử B ${runId}`, `Gantt kiểm thử C ${runId}`];
  const urls = titles.map((_, index) => `${base}/gantt-focus-${runId}-${index}`);
  try {
    for (const [index, url] of urls.entries()) {
      const response = await request.patch(url, { headers, data: { fields: {
        title: { stringValue: titles[index] }, assignedBy: { stringValue: email }, assigneeEmail: { stringValue: email },
        status: { stringValue: 'Chưa làm' }, due: { stringValue: shiftDay(start, 1) },
        ...(index !== 1 ? { startDate: { stringValue: index === 0 ? start : shiftDay(start, 1) } } : {}),
      } } });
      expect(response.ok()).toBe(true);
    }
    await page.goto(previewUrl);
    await page.getByRole('button', { name: 'Đăng nhập bằng Google' }).click();
    await openTasks(page);
    await page.getByRole('button', { name: 'Biểu đồ Gantt', exact: true }).click();
    const [bar, marker, oneDayBar] = titles.map(title =>
      page.getByRole('button', { name: `Làm nổi bật trên biểu đồ: ${title}`, exact: true }));
    const [first, second] = titles.map(title => page.getByRole('button', { name: `Mở công việc: ${title}`, exact: true }));
    await expect(bar).toBeVisible();
    await expect(marker).toBeVisible();
    await expect(bar.locator(':scope > div')).toHaveCSS('width', '112px');
    await expect(oneDayBar.locator(':scope > div')).toHaveCSS('width', '56px');
    await expect(marker.locator(':scope > div')).toHaveCSS('width', '10px');
    const color = (element: Element) => getComputedStyle(element).backgroundColor;
    const barColor = await bar.locator(':scope > div > div').first().evaluate(color);
    const markerColor = await marker.locator(':scope > div').evaluate(color);
    expect(barColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(barColor).not.toBe(markerColor);
    await bar.tap();
    await expect(bar).toHaveAttribute('aria-pressed', 'true');
    await expect(first).toHaveCSS('opacity', '1');
    await expect(second).toHaveCSS('opacity', '0.38');
    await expect(marker).toHaveCSS('opacity', '0.38');
    await marker.tap();
    await expect(marker).toHaveAttribute('aria-pressed', 'true');
    await expect(second).toHaveCSS('opacity', '1');
    await expect(first).toHaveCSS('opacity', '0.38');
    await expect(bar).toHaveCSS('opacity', '0.38');
    await marker.tap();
    await expect(marker).toHaveAttribute('aria-pressed', 'false');
    await expect(first).toHaveCSS('opacity', '1');
    await expect(bar).toHaveCSS('opacity', '1');
    await first.click();
    await expect(page.getByRole('dialog', { name: 'Chi tiết công việc', exact: true }))
      .toContainText(titles[0]);
  } finally {
    for (const url of urls) await request.delete(url, { headers });
  }
});

test('Kanban rút gọn thẻ và giữ để kéo qua các cột bằng cảm ứng', async ({ context, page }) => {
  const title = 'Kiểm tra giao diện Kanban với một tên công việc rất dài để xác nhận nội dung dừng ở đúng hai dòng trên điện thoại';
  const host = process.env.EXPO_PUBLIC_EMULATOR_HOST || '127.0.0.1';
  const port = process.env.EXPO_PUBLIC_FIRESTORE_EMULATOR_PORT || 8080;
  const doc = `http://${host}:${port}/v1/projects/demo-marchix-mobile/databases/(default)/documents/tasks/kanban-test-${Date.now()}`;
  const deadline = shiftDay(todayInVietnam(), -12);
  const headers = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
  const fixture = await fetch(doc, { method: 'PATCH', headers, body: JSON.stringify({ fields: {
    title: { stringValue: title }, assigneeEmail: { stringValue: 'nhanvien@example.test' },
    status: { stringValue: 'Chưa làm' }, progress: { integerValue: '25' },
    due: { stringValue: deadline }, priority: { stringValue: 'Cao' },
  } }) });
  expect(fixture.ok).toBeTruthy();
  try {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(previewUrl);
    await page.getByRole('button', { name: 'Đăng nhập bằng Google' }).click();
    await openTasks(page);
    const search = page.getByRole('textbox', { name: 'Tìm tên công việc' });
    await expect(search).toBeVisible({ timeout: 15_000 });
    const placeholderStyle = () => search.evaluate(input => {
      const { color, fontSize, fontWeight } = getComputedStyle(input, '::placeholder');
      return { color, fontSize, fontWeight };
    });
    const lightPlaceholder = { color: 'rgb(130, 130, 130)', fontSize: '16px', fontWeight: '400' };
    await expect.poll(placeholderStyle).toEqual(lightPlaceholder);
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(placeholderStyle).toEqual({ ...lightPlaceholder, color: 'rgb(140, 140, 140)' });
    await page.emulateMedia({ colorScheme: 'light' });
    await search.fill('Kiểm tra giao diện Kanban');
    await expect(search).toHaveCSS('font-weight', '500');
    await expect(search).toHaveCSS('font-size', '17px');
    await page.getByRole('button', { name: 'Xóa từ khóa tìm tên công việc' }).click();
    await expect(search).toHaveValue('');
    await expect.poll(placeholderStyle).toEqual(lightPlaceholder);
    await search.fill('Kiểm tra giao diện Kanban');
    const card = page.getByRole('button', { name: `Mở công việc: ${title}` });
    await page.getByRole('button', { name: 'Danh sách', exact: true }).click();
    {
      await expect(card.getByText(title, { exact: true })).toHaveCSS('-webkit-line-clamp', '2');
      await expect(card.getByText('Người giao việc:', { exact: true })).toHaveCount(0);
      const priorityText = card.getByText('Cao', { exact: true });
      await expect(priorityText).toHaveCSS('color', 'rgb(158, 52, 43)');
      await expect(priorityText.locator('..')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      const [assignee, due, overdue, priority] = await Promise.all([
        card.getByText('Người thực hiện:', { exact: true }).boundingBox(),
        card.getByText(`Hạn chót: ${formatTaskDate(deadline)}`, { exact: true }).boundingBox(),
        card.getByText('Quá hạn 12 ngày', { exact: true }).boundingBox(),
        card.getByText('Mức độ ưu tiên: Cao', { exact: true }).boundingBox(),
      ]);
      expect(overdue!.x).toBeGreaterThan(due!.x + due!.width);
      expect(overdue!.y + overdue!.height / 2).toBeCloseTo(due!.y + due!.height / 2);
      expect(priority!.y - due!.y).toBeCloseTo(due!.y - assignee!.y);
    }

    await page.getByRole('button', { name: 'Bảng Kanban', exact: true }).click();
    await expect(card.getByText(title, { exact: true })).toHaveCSS('-webkit-line-clamp', '2');
    await expect(card).toHaveText(`${title}25%`);
    const track = card.getByRole('progressbar', { name: 'Tiến độ công việc' });
    await expect(track).toHaveAttribute('aria-valuenow', '25');
    const [trackBox, valueBox] = await Promise.all([
      track.boundingBox(),
      card.getByText('25%', { exact: true }).boundingBox(),
    ]);
    expect(trackBox!.x + trackBox!.width).toBeLessThan(valueBox!.x);

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
    const detailPriority = page.getByRole('dialog', { name: 'Chi tiết công việc', exact: true })
      .getByText('Mức độ ưu tiên', { exact: true }).locator('..').getByText('Cao', { exact: true });
    await expect(detailPriority).toHaveCSS('color', 'rgb(158, 52, 43)');
    await expect(detailPriority).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  } finally {
    await fetch(doc, { method: 'DELETE', headers });
  }
});

test('bỏ ngay việc con đã chọn trong form giao việc', async ({ page }) => {
  await page.goto(previewUrl);
  await page.getByRole('button', { name: 'Đăng nhập người giao việc (mô phỏng)' }).click();
  await openTasks(page);
  await page.getByRole('button', { name: '+ Giao việc', exact: true }).click();
  const form = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Giao việc mới', exact: true }) });
  await form.getByRole('button', { name: 'Tùy chọn', exact: true }).click();
  for (const title of ['Việc con giữ lại', 'Việc con cần bỏ']) {
    await form.getByRole('textbox', { name: 'Tên việc con', exact: true }).fill(title);
    await form.getByRole('button', { name: '+ Thêm việc con' }).click();
  }
  const removeChild = form.getByRole('button', { name: 'Bỏ việc con 2', exact: true });
  await removeChild.click();
  await expect(form.getByRole('textbox', { name: 'Tên việc con 2', exact: true })).toHaveCount(0);
  await expect(removeChild).toHaveCount(0);
  await expect(form.getByRole('textbox', { name: 'Tên việc con 1', exact: true })).toHaveValue('Việc con giữ lại');
});

test('chọn nhiều người, đặt lịch và giao tệp riêng cho từng công việc', async ({ browser, page }) => {
  test.setTimeout(90_000);
  const receiver = await browser.newContext({ ...devices['iPhone 13'] });
  const title = `Kiểm thử giao việc ${Date.now()}`;
  const attachment = { name: 'Tài liệu bàn giao.bin', mimeType: 'application/octet-stream', buffer: Buffer.alloc(950 * 1024, 0xab) };
  const isAttachmentResponse = (response: Response) => response.url().endsWith('/downloadMobileTaskAttachment') &&
    response.request().method() === 'POST';
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
    await acknowledgeStartupReminder(receiverPage);
    await Promise.all([page.goto(previewUrl), receiverPage.goto(previewUrl)]);
    await Promise.all([
      page.getByRole('button', { name: 'Đăng nhập người giao việc (mô phỏng)' }).click(),
      receiverPage.getByRole('button', { name: 'Đăng nhập bằng Google' }).click(),
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
    const titleInput = form.getByRole('textbox', { name: 'Tên công việc' });
    await expect.poll(() => titleInput.evaluate(input => getComputedStyle(input, '::placeholder').fontWeight)).toBe('400');
    await titleInput.fill(title);
    await expect(titleInput).toHaveCSS('font-weight', '500');
    await expect(form.getByRole('radio', { name: 'Trung bình', exact: true })).toBeChecked();
    await form.getByRole('textbox', { name: 'Hạng mục', exact: true }).fill('  Bàn giao  ');
    await form.getByRole('button', { name: /^Người thực hiện:/ }).click();
    const assigneePicker = page.getByRole('dialog', { name: 'Người thực hiện', exact: true });
    const search = assigneePicker.getByRole('textbox', { name: 'Tìm thành viên' });
    await search.fill('nhan vien demo');
    const staff = assigneePicker.getByRole('checkbox', { name: 'Nhân viên demo', exact: true });
    await staff.click();
    await expect(staff.getByText('ND', { exact: true })).toBeVisible();
    await expect(staff).not.toContainText('nhanvien@example.test');
    await expect(staff).toBeChecked();
    await staff.click();
    await expect(staff).not.toBeChecked();
    await staff.click();
    await assigneePicker.getByRole('button', { name: 'Xóa từ khóa tìm thành viên' }).click();
    await expect(search).toHaveValue('');
    const own = assigneePicker.getByRole('checkbox', { name: 'Người giao việc demo', exact: true });
    await own.click();
    await expect(own).toBeChecked();
    await expect(staff).toBeChecked();
    await assigneePicker.getByRole('button', { name: 'Xong', exact: true }).click();
    await expect(form.getByRole('button', { name: 'Người thực hiện: Nhân viên demo, Người giao việc demo', exact: true })).toBeVisible();
    const highPriority = form.getByRole('radio', { name: 'Cao', exact: true });
    await highPriority.click();
    const highPriorityBackground = await highPriority.evaluate(element => getComputedStyle(element).backgroundColor);
    const highPriorityColor = await highPriority.getByText('Cao', { exact: true })
      .evaluate(element => getComputedStyle(element).color);
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

    await form.getByRole('button', { name: 'Tùy chọn', exact: true }).click();
    const initialProgress = form.getByRole('textbox', { name: 'Tiến độ ban đầu (%)' });
    const increaseProgress = form.getByRole('button', { name: 'Tăng tiến độ ban đầu (%)', exact: true });
    const decreaseProgress = form.getByRole('button', { name: 'Giảm tiến độ ban đầu (%)', exact: true });
    await expect(decreaseProgress).toBeDisabled();
    await increaseProgress.click();
    await expect(initialProgress).toHaveValue('1');
    await decreaseProgress.click();
    await expect(initialProgress).toHaveValue('0');
    await initialProgress.fill('101');
    await expect(initialProgress).toHaveValue('0');
    await initialProgress.fill('2a%');
    await expect(initialProgress).toHaveValue('0');
    await initialProgress.fill('100');
    await expect(initialProgress).toHaveValue('100');
    await expect(increaseProgress).toBeDisabled();
    await form.getByRole('radio', { name: 'Hằng tuần', exact: true }).click();
    await form.getByRole('checkbox', { name: 'Mốc bàn giao dự án' }).click();
    const watcherTrigger = form.getByRole('button', { name: /^Người theo dõi:/ });
    await watcherTrigger.scrollIntoViewIfNeeded();
    const watcherTriggerBefore = await watcherTrigger.boundingBox();
    await watcherTrigger.click();
    const watcherPicker = page.getByRole('dialog', { name: 'Người theo dõi', exact: true });
    await expect(watcherPicker).toBeVisible();
    const pickerBounds = (await watcherPicker.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(pickerBounds.x + pickerBounds.width / 2).toBeCloseTo(viewport.width / 2, 0);
    expect(pickerBounds.y + pickerBounds.height / 2).toBeCloseTo(viewport.height / 2, 0);
    const coveredTrigger = page.getByRole('button', { name: /^Người theo dõi:/, includeHidden: true });
    expect((await coveredTrigger.boundingBox())?.y).toBeCloseTo(watcherTriggerBefore!.y, 0);
    await watcherPicker.getByRole('textbox', { name: 'Tìm người theo dõi' }).fill('nhan vien');
    const watcher = watcherPicker.getByRole('checkbox', { name: 'Nhân viên demo', exact: true });
    await watcher.click();
    await expect(watcher).toBeChecked();
    await expect(watcher.getByText('ND', { exact: true })).toBeVisible();
    await watcherPicker.getByRole('button', { name: 'Xong', exact: true }).click();
    await form.getByRole('textbox', { name: 'Tên việc con' }).fill('Kiểm tra trước khi bàn giao');
    await form.getByRole('button', { name: '+ Thêm việc con' }).click();
    const completionMode = form.getByRole('button', { name: /^Chế độ hoàn thành:/ });
    const approverPicker = form.getByRole('button', { name: /^Người duyệt:/ });
    await expect(completionMode).toHaveAccessibleName('Chế độ hoàn thành: Cần nghiệm thu');
    await approverPicker.click();
    await page.getByRole('dialog', { name: 'Người duyệt', exact: true })
      .getByRole('checkbox', { name: 'Quản trị demo', exact: true }).click();
    const completionBackground = await completionMode.evaluate(button => getComputedStyle(button).backgroundColor);
    await completionMode.click();
    await page.getByRole('radiogroup', { name: 'Chế độ hoàn thành' })
      .getByRole('radio', { name: 'Chỉ báo cáo kết quả', exact: true }).click();
    await expect(completionMode).toHaveAccessibleName('Chế độ hoàn thành: Chỉ báo cáo kết quả');
    await expect(completionMode).toHaveCSS('background-color', completionBackground);
    await expect(approverPicker).toHaveAccessibleName('Người duyệt: Quản trị demo');
    await form.getByRole('textbox', { name: 'Mô tả / Yêu cầu bàn giao' }).fill('Mô tả cho cả hai người thực hiện.');
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
      expect(fields.requireReview.booleanValue).toBe(false);
      expect(fields.approverEmail.stringValue).toBe('quantri@example.test');
      if (fields.assigneeEmail.stringValue === 'nhanvien@example.test') {
        const local = new Date(Date.parse(fields.createdAt.stringValue) + 7 * 60 * 60 * 1000).toISOString();
        assignmentTime = `${local.slice(11, 16)} ${local.slice(0, 10).split('-').reverse().join('/')}`;
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
    const assignmentToast = page.getByText('Đã giao việc cho 2 người.', { exact: true });
    await expect(assignmentToast).toBeVisible();
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
    await page.getByRole('button', { name: 'Trao đổi & tài liệu', exact: true }).click();
    const [senderAttachmentResponse] = await Promise.all([
      page.waitForResponse(isAttachmentResponse),
      page.getByRole('button', { name: `Xem tệp ${attachment.name}` }).click(),
    ]);
    expect(senderAttachmentResponse.ok()).toBe(true);
    await senderAttachmentResponse.finished();
    const attachmentHeader = page.getByRole('heading', { name: attachment.name, exact: true }).locator('..');
    const downloadButton = attachmentHeader.getByRole('button', { name: 'Tải xuống', exact: true });
    const closePreview = attachmentHeader.getByRole('button', { name: 'Đóng xem trước', exact: true });
    await expect(downloadButton).toBeVisible();
    const placement = await downloadButton.evaluate(button => {
      const download = button.getBoundingClientRect();
      const close = button.nextElementSibling;
      const closeBox = close?.getBoundingClientRect();
      return close?.getAttribute('aria-label') === 'Đóng xem trước' && closeBox &&
        download.right <= closeBox.left && Math.abs(download.top - closeBox.top) < 1;
    });
    expect(placement).toBe(true);
    const senderDownloadEvent = page.waitForEvent('download');
    await downloadButton.click();
    const senderDownload = await senderDownloadEvent;
    expect(senderDownload.suggestedFilename()).toBe(attachment.name);
    expect((await readFile((await senderDownload.path())!)).equals(attachment.buffer)).toBeTruthy();
    await closePreview.click();
    await page.getByRole('button', { name: 'Đóng chi tiết công việc' }).click();
    await expect(assignee).toHaveAccessibleName('Người thực hiện: Nhân viên demo');
    await expect(received.getByText(`Hạn chót: ${deadline}`, { exact: true })).toBeVisible();
    await expect(received.getByText('Mức độ ưu tiên: Cao', { exact: true })).toBeVisible();
    const cardPriority = received.getByText('Cao', { exact: true });
    await expect(cardPriority).toHaveCSS('color', highPriorityColor);
    await expect(cardPriority).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(cardPriority.locator('..')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(received).toContainText('Chưa làm');
    await expect(received).toContainText('0%');
    await receiverPage.getByRole('button', { name: 'Biểu đồ Gantt', exact: true }).click();
    const ganttDeadline = received.getByText(`Hạn chót: ${deadline}`, { exact: true });
    await expect(ganttDeadline).toHaveCSS('font-weight', '500');
    await expect(ganttDeadline.getByText('Hạn chót:', { exact: true })).toHaveCSS('font-weight', '700');
    const firstTick = receiverPage.getByLabel('Trục thời gian công việc').getByText(/^\d{2}\/\d{2}$/).first();
    await expect(firstTick.locator('..')).toHaveCSS('align-items', 'center');
    await received.click();
    await expect(receiverPage.getByRole('button', { name: 'Chỉnh sửa', exact: true })).toHaveCount(0);
    const detail = receiverPage.getByRole('dialog', { name: 'Chi tiết công việc', exact: true });
    const metadataValue = (label: string, value: string) => detail
      .getByText(label, { exact: true })
      .locator('..').getByText(value, { exact: true });
    const detailDue = metadataValue('Hạn chót', deadline);
    const detailMilestone = metadataValue('Mốc bàn giao dự án', 'Có');
    await expect(detailDue).toBeVisible();
    await expect(metadataValue('Mức độ ưu tiên', 'Cao')).toBeVisible();
    await expect(metadataValue('Hạng mục', 'Bàn giao')).toBeVisible();
    await expect(metadataValue('Ngày bắt đầu', `15/${suffix}`)).toBeVisible();
    await expect(metadataValue('Người thực hiện', 'Nhân viên demo')).toBeVisible();
    await expect(metadataValue('Dự án', 'Chung toàn công ty')).toBeVisible();
    await expect(metadataValue('Lặp lại', 'Hằng tuần')).toBeVisible();
    await expect(metadataValue('Người theo dõi', 'Nhân viên demo')).toBeVisible();
    await expect(detailMilestone).toBeVisible();
    for (const field of [detailDue, detailMilestone]) {
      await expect(field).toHaveCSS('text-align', 'right');
    }

    const progressBlock = receiverPage.getByRole('progressbar', { name: 'Tiến độ công việc' }).locator('..');
    for (const status of ['Đang làm', 'Vướng']) {
      await receiverPage.getByRole('radio', { name: status, exact: true }).click();
      await expect(progressBlock.getByText(status, { exact: true })).toBeVisible();
    }
    await expect(sent).toContainText('Chưa làm');
    await receiverPage.getByRole('radio', { name: 'Chưa làm', exact: true }).click();
    await expect(progressBlock.getByText('Chưa làm', { exact: true })).toBeVisible();
    await expect(receiverPage.getByRole('checkbox', { name: 'Kiểm tra trước khi bàn giao' })).not.toBeChecked();
    await receiverPage.getByRole('button', { name: 'Mô tả', exact: true }).click();
    const description = receiverPage.getByRole('heading', { name: 'Mô tả / Yêu cầu bàn giao' }).locator('..');
    await expect(description).toHaveCSS('border-top-width', '0px');
    await expect(description.getByText('Mô tả cho cả hai người thực hiện.').locator('..')).toHaveCSS('border-top-width', '1px');
    await receiverPage.getByRole('button', { name: 'Trao đổi & tài liệu', exact: true }).click();
    await expect(receiverPage.getByText('Nhắn khi có vướng mắc.')).toBeVisible();
    await expect(receiverPage.getByText('Lời nhắn khi giao việc', { exact: true })).toBeVisible();
    const discussion = receiverPage.getByRole('heading', { name: 'Trao đổi', exact: true }).locator('../..');
    await expect(discussion.getByText(/^Nội dung trao đổi(?: \*)?$/)).toHaveCount(0);
    await expect(discussion.getByText('Người giao việc demo', { exact: true })).toBeVisible();
    await expect(discussion.getByText('ND', { exact: true })).toBeVisible();
    await expect(discussion.getByText(assignmentTime, { exact: true })).toBeVisible();
    await detail.getByRole('textbox', { name: 'Nội dung trao đổi' }).fill('Đã nhận công việc.');
    await detail.getByRole('button', { name: 'Gửi trao đổi' }).click();
    await expect(discussion.getByText('Đã nhận công việc.', { exact: true })).toBeVisible();
    await expect(discussion.getByText('Nhân viên demo', { exact: true })).toBeVisible();
    const attachmentCard = receiverPage.getByRole('button', { name: `Xem tệp ${attachment.name}` });
    const iconBox = await attachmentCard.getByText('BIN', { exact: true }).boundingBox();
    const filenameBox = await attachmentCard.getByText(attachment.name, { exact: true }).boundingBox();
    expect(iconBox!.x).toBeLessThan(filenameBox!.x);
    const [downloadResponse] = await Promise.all([
      receiverPage.waitForResponse(isAttachmentResponse),
      attachmentCard.click(),
    ]);
    expect(downloadResponse.ok()).toBe(true);
    await downloadResponse.finished();
    await expect(receiverPage.getByRole('heading', { name: attachment.name, exact: true })).toBeVisible();
    const downloading = receiverPage.waitForEvent('download');
    await receiverPage.getByRole('button', { name: 'Tải xuống', exact: true }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe(attachment.name);
    expect((await readFile((await download.path())!)).equals(attachment.buffer)).toBeTruthy();
    await receiverPage.getByRole('button', { name: 'Đóng xem trước', exact: true }).click();
    const downloadRequest = downloadResponse.request();
    const { data } = downloadRequest.postDataJSON();
    const otherId = taskIds.find(id => id !== data.taskId);
    const unauthorized = await receiverPage.request.post(downloadRequest.url(), {
      headers: { Authorization: (await downloadRequest.headerValue('authorization'))! },
      data: { data: { taskId: otherId, fileId: fileIds[taskIds.indexOf(otherId!)] } },
    });
    expect(unauthorized.status()).toBe(403);

    await receiverPage.getByRole('button', { name: 'Chung', exact: true }).click();
    const checked = receiverPage.getByRole('checkbox', { name: 'Kiểm tra trước khi bàn giao' });
    const checkRequest = receiverPage.waitForResponse(response => response.url().endsWith('/setTaskChecklistItem') &&
      response.request().method() === 'POST');
    await checked.click();
    const checkResponse = await checkRequest;
    expect(checkResponse.ok(), await checkResponse.text()).toBeTruthy();
    await expect(checked).toBeChecked({ timeout: 15000 });
    await expect(assignmentToast).toBeHidden({ timeout: 5000 });
    await sent.click();
    await expect(page.getByRole('checkbox', { name: 'Kiểm tra trước khi bàn giao' })).toBeChecked();
    await page.getByRole('button', { name: 'Chỉnh sửa', exact: true }).click();
    const editForm = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Chỉnh sửa công việc', exact: true }) });
    await expect(editForm).toBeVisible();
    const editTitle = editForm.getByRole('textbox', { name: 'Tên công việc' });
    await expect(editTitle).toHaveValue(title);
    const editCategory = editForm.getByRole('textbox', { name: 'Hạng mục', exact: true });
    await expect(editCategory).toHaveValue('Bàn giao');
    await editCategory.fill('Nghiệm thu');
    const editHighPriority = editForm.getByRole('radio', { name: 'Cao', exact: true });
    await expect(editHighPriority).toBeChecked();
    await expect(editHighPriority).toHaveCSS('background-color', highPriorityBackground);
    await expect(editHighPriority.getByText('Cao', { exact: true })).toHaveCSS('color', highPriorityColor);
    await expect(editForm.getByText(attachment.name, { exact: true })).toBeVisible();
    await expect(editForm.getByRole('button', { name: 'Người thực hiện: Nhân viên demo', exact: true })).toBeVisible({ timeout: 15000 });
    await editForm.getByRole('button', { name: `Hạn chót, ${deadline}` }).click();
    const newDeadline = `22/${suffix}`;
    await dueCalendar.getByRole('button', { name: `Ngày ${newDeadline}` }).click();
    const updatedTitle = `${title} đã sửa`;
    await editTitle.fill(updatedTitle);
    const lowPriority = editForm.getByRole('radio', { name: 'Thấp', exact: true });
    await lowPriority.click();
    await expect(lowPriority).toBeChecked();
    await expect(lowPriority).not.toHaveCSS('background-color', highPriorityBackground);
    const lowPriorityColor = await lowPriority.getByText('Thấp', { exact: true })
      .evaluate(element => getComputedStyle(element).color);
    expect(lowPriorityColor).not.toBe(highPriorityColor);
    await editForm.getByRole('button', { name: 'Tùy chọn', exact: true }).click();
    await expect(editForm.getByRole('button', { name: 'Chế độ hoàn thành: Chỉ báo cáo kết quả' })).toBeVisible();
    await expect(editForm.getByRole('button', { name: 'Người duyệt: Quản trị demo' })).toBeVisible();
    await expect(editForm.getByRole('textbox', { name: 'Mô tả / Yêu cầu bàn giao' })).toHaveValue('Mô tả cho cả hai người thực hiện.');
    await editForm.getByRole('textbox', { name: 'Lời nhắn khi giao việc' }).fill('Lời nhắn đã chỉnh sửa.');
    await editForm.getByRole('textbox', { name: 'Tên việc con', exact: true }).fill('Mục mới sau khi sửa');
    await editForm.getByRole('button', { name: 'Thông tin chính', exact: true }).click();
    await expect(editTitle).toHaveValue(updatedTitle);
    await expect(editForm.getByRole('textbox', { name: 'Tên việc con', exact: true })).toHaveCount(0);
    await editForm.getByRole('button', { name: 'Tùy chọn', exact: true }).click();
    await expect(editForm.getByRole('textbox', { name: 'Tên việc con', exact: true })).toHaveValue('Mục mới sau khi sửa');
    const editing = page.waitForResponse(response => response.url().endsWith('/updateMobileTask') &&
      response.request().method() === 'POST');
    await editForm.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
    const edited = await editing;
    expect(edited.ok(), await edited.text()).toBeTruthy();
    await expect(editForm).toBeHidden();
    await expect(page.getByRole('heading', { name: updatedTitle, exact: true })).toBeVisible();
    await expect(receiverPage.getByRole('heading', { name: updatedTitle, exact: true })).toBeVisible();
    await expect(metadataValue('Hạn chót', newDeadline)).toBeVisible();
    await expect(metadataValue('Mức độ ưu tiên', 'Thấp')).toHaveCSS('color', lowPriorityColor);
    await expect(metadataValue('Hạng mục', 'Nghiệm thu')).toBeVisible();
    await receiverPage.getByRole('button', { name: 'Trao đổi & tài liệu', exact: true }).click();
    await expect(receiverPage.getByText('Lời nhắn đã chỉnh sửa.')).toBeVisible();
    await expect(discussion.getByText('Đã nhận công việc.', { exact: true })).toBeVisible();
    await expect(receiverPage.getByRole('button', { name: `Xem tệp ${attachment.name}` })).toBeVisible();
    await receiverPage.getByRole('button', { name: 'Chung', exact: true }).click();
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
  const host = process.env.EXPO_PUBLIC_EMULATOR_HOST || '127.0.0.1';
  const port = process.env.EXPO_PUBLIC_FIRESTORE_EMULATOR_PORT || 8080;
  const documentUrl = `http://${host}:${port}/v1/projects/demo-marchix-mobile/databases/(default)/documents/tasks/progress-test-${suffix}`;
  const headers = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
  const fixture = await fetch(documentUrl, { method: 'PATCH', headers, body: JSON.stringify({ fields: {
    title: { stringValue: task },
    assigneeEmail: { stringValue: 'nhanvien@example.test' },
    status: { stringValue: 'Chưa làm' },
    progress: { integerValue: '0' },
  } }) });
  expect(fixture.ok).toBeTruthy();
  const openTask = (target: typeof page) => target.getByRole('button', { name: `Mở công việc: ${task}` });
  const login = (target: typeof page) => target.getByRole('button', { name: 'Đăng nhập bằng Google' }).click();

  const other = await browser.newContext({ ...devices['iPhone 13'] });
  try {
    const otherPage = await other.newPage();
    await acknowledgeStartupReminder(otherPage);
    await page.emulateMedia({ colorScheme: 'light' });
    await Promise.all([page.goto(previewUrl), otherPage.goto(previewUrl)]);
    await Promise.all([login(page), login(otherPage)]);
    await Promise.all([openTasks(page), openTasks(otherPage)]);
    await expect(page.getByRole('heading', { name: 'CÔNG VIỆC', exact: true })).toBeVisible();
    await expect(page.getByText('Việc riêng của đồng nghiệp')).toHaveCount(0);
    await Promise.all([page, otherPage].map(target =>
      target.getByRole('textbox', { name: 'Tìm tên công việc' }).fill(task)));
    await Promise.all([openTask(page).click(), openTask(otherPage).click()]);
    const detail = page.getByRole('dialog', { name: 'Chi tiết công việc', exact: true });
    const otherDetail = otherPage.getByRole('dialog', { name: 'Chi tiết công việc', exact: true });
    const statuses = detail.getByRole('radiogroup', { name: 'Trạng thái', exact: true });
    await expect(statuses.getByRole('radio')).toHaveText(['Chưa làm', 'Đang làm', 'Vướng']);
    for (const [label, background, color] of [
      ['Chưa làm', 'rgb(240, 237, 249)', 'rgb(100, 90, 116)'],
      ['Đang làm', 'rgb(228, 240, 253)', 'rgb(21, 80, 131)'],
      ['Vướng', 'rgb(251, 232, 229)', 'rgb(158, 52, 43)'],
    ]) {
      const choice = statuses.getByRole('radio', { name: label, exact: true });
      await expect(choice).toHaveCSS('background-color', background);
      await expect(choice.getByText(label, { exact: true })).toHaveCSS('color', color);
    }
    const initialStatus = statuses.getByRole('radio', { name: 'Chưa làm', exact: true });
    await expect(initialStatus).toBeChecked();
    await expect(initialStatus).toHaveCSS('border-top-color', 'rgb(100, 90, 116)');
    const progress = detail.getByRole('textbox', { name: 'Tiến độ (%)', exact: true });
    const previous = await progress.inputValue();
    await progress.fill('50');
    await detail.getByRole('button', { name: 'Tăng tiến độ (%)', exact: true }).click();
    await expect(progress).toHaveValue('51');
    await detail.getByRole('button', { name: 'Giảm tiến độ (%)', exact: true }).click();
    await expect(progress).toHaveValue('50');
    await progress.fill(previous);
    await progress.fill('101');
    await expect(progress).toHaveValue(previous);
    await progress.fill('9.5');
    await expect(progress).toHaveValue(previous);
    await progress.fill('a%');
    await expect(progress).toHaveValue(previous);
    await progress.clear();
    await detail.getByRole('button', { name: 'Lưu tiến độ', exact: true }).click();
    const errorToast = page.getByRole('alert').filter({ hasText: 'Nhập số nguyên từ 0 đến 100.' });
    await expect(errorToast).toBeVisible();
    await expect(errorToast.locator('..').getByText('\u26A0\uFE0E')).toHaveCSS('color', 'rgb(158, 52, 43)');
    await progress.fill('75');
    const blockedStatus = statuses.getByRole('radio', { name: 'Vướng', exact: true });
    await blockedStatus.click();
    await expect(blockedStatus).toBeChecked();
    await expect(blockedStatus).toHaveCSS('border-top-color', 'rgb(158, 52, 43)');
    await detail.getByRole('button', { name: 'Lưu tiến độ', exact: true }).click();
    const toast = page.getByText('Đã lưu tiến độ.', { exact: true });
    await expect(toast).toBeVisible();
    const toastContainer = toast.locator('..');
    await expect(toastContainer.getByText('✓')).toHaveCSS('color', 'rgb(11, 97, 85)');
    await expect(detail.getByRole('heading', { name: task, exact: true })).toBeVisible();
    await expect(progress).toHaveValue('75');
    const bounds = (await toastContainer.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(bounds.x + bounds.width / 2).toBeCloseTo(viewport.width / 2, 0);
    expect(viewport.height - (bounds.y + bounds.height)).toBeLessThan(48);
    await expect(toast).toBeHidden({ timeout: 4000 });
    await expect(detail.getByRole('heading', { name: task, exact: true })).toBeVisible();
    await progress.fill('80');
    await detail.getByRole('button', { name: 'Lưu tiến độ', exact: true }).click();
    await expect(toast).toBeVisible();
    await expect(detail.getByRole('heading', { name: task, exact: true })).toBeVisible();
    await detail.getByRole('button', { name: 'Đóng chi tiết công việc' }).click();
    await expect(openTask(page)).toContainText('80%');
    await expect(openTask(page)).toContainText('Vướng');
    await otherDetail.getByRole('textbox', { name: 'Tiến độ (%)', exact: true }).fill('90');
    await otherDetail.getByRole('button', { name: 'Lưu tiến độ', exact: true }).click();
    await expect(otherPage.getByRole('alert')).toContainText('Công việc vừa thay đổi');
    await otherDetail.getByRole('button', { name: 'Đóng chi tiết công việc' }).click();
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
