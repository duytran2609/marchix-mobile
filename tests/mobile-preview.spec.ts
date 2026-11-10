import { devices, expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const previewUrl = process.env.MARCHIX_PREVIEW_URL ?? 'http://localhost:8081';

test.use({ ...devices['iPhone 13'], defaultBrowserType: 'chromium' });

test('menu bên trái mở đúng mục và giữ điều hướng theo vai trò nhân viên', async ({ page }) => {
  await page.addInitScript(() => {
    window.open = url => {
      document.documentElement.dataset.openedUrl = String(url);
      return null;
    };
  });
  await page.goto(previewUrl);
  await page.getByRole('button', { name: 'Đăng nhập Google (mô phỏng)' }).click();

  const openMenu = page.getByRole('button', { name: 'Mở menu' });
  const drawer = page.getByRole('dialog');
  await expect(page.getByRole('button', { name: 'Đăng xuất', exact: true })).toHaveCount(0);
  await openMenu.click();
  const items = drawer.getByRole('button');
  const labels = [
    'Đóng menu', 'Tổng quan', 'Công việc', 'Kế hoạch tuần', 'Phê duyệt', 'KPI',
    'Chấm công', 'Thu chi', 'Đơn từ', 'Phiếu lương', 'Dự án', 'Đăng xuất',
  ];
  await expect(items).toHaveCount(labels.length);
  for (const [index, label] of labels.entries()) await expect(items.nth(index)).toHaveAccessibleName(label);

  await drawer.getByRole('button', { name: 'Phê duyệt' }).click();
  await expect(drawer).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Việc chờ duyệt' })).toBeVisible();

  await openMenu.click();
  await drawer.getByRole('button', { name: 'Công việc' }).click();
  await expect(page.getByRole('heading', { name: 'CÔNG VIỆC', exact: true })).toBeVisible();

  await openMenu.click();
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();

  await openMenu.click();
  await drawer.getByRole('button', { name: 'Kế hoạch tuần' }).click();
  await expect(drawer).toBeHidden();
  await expect(page.locator('html')).toHaveAttribute('data-opened-url', 'https://quanly.marchix.vn/#ke-hoach-tuan');

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

test('Công việc giữ bộ lọc và chế độ Kanban khi mở chi tiết', async ({ page }) => {
  await page.goto(previewUrl);
  await page.getByRole('button', { name: 'Đăng nhập Google (mô phỏng)' }).click();
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
  const receiver = await browser.newContext({ ...devices['iPhone 13'] });
  const title = `Kiểm thử giao việc ${Date.now()}`;
  const attachment = { name: 'Tài liệu bàn giao.bin', mimeType: 'application/octet-stream', buffer: Buffer.alloc(950 * 1024, 0xab) };
  const documents = 'http://127.0.0.1:8080/v1/projects/demo-marchix-mobile/databases/(default)/documents';
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
    const received = receiverPage.getByRole('button', { name: `Mở công việc: ${title}` });
    await expect(receiverPage.getByRole('heading', { name: 'CÔNG VIỆC', exact: true })).toBeVisible();
    await expect(received).toHaveCount(0);

    await page.getByRole('button', { name: '+ Giao việc', exact: true }).click();
    const form = page.getByRole('dialog');
    const close = form.getByRole('button', { name: 'Đóng giao việc' });
    await expect(close).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(close.getByText('×', { exact: true })).toHaveCSS('color', 'rgb(0, 0, 0)');
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
    const dueDate = form.getByRole('button', { name: /^Hạn chót,/ });
    await startDate.scrollIntoViewIfNeeded();
    const dueBefore = await dueDate.boundingBox();
    await startDate.click();
    await expect(form.getByRole('button', { name: 'Tháng sau' })).toBeVisible();
    expect((await dueDate.boundingBox())?.y).toBeCloseTo(dueBefore!.y, 0);
    await page.keyboard.press('Escape');
    await expect(form.getByRole('button', { name: 'Tháng sau' })).toHaveCount(0);
    await expect(form).toBeVisible();
    await startDate.click();
    await form.getByRole('button', { name: 'Tháng sau' }).click();
    await form.getByRole('button', { name: `Ngày 15/${suffix}` }).click();
    await expect(form.getByRole('button', { name: `Ngày bắt đầu, 15/${suffix}` })).toBeVisible();
    await form.getByRole('button', { name: /^Hạn chót,/ }).click();
    await expect(form.getByRole('button', { name: `Ngày 14/${suffix}` })).toBeDisabled();
    await form.getByRole('button', { name: `Ngày ${deadline}` }).click();
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
    await expect(sent).toContainText('Người thực hiện: Nhân viên demo');
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
    await expect(form.getByRole('heading', { name: 'Chỉnh sửa công việc' })).toBeVisible();
    const editTitle = form.getByRole('textbox', { name: 'Tên công việc' });
    await expect(editTitle).toHaveValue(title);
    await expect(form.getByRole('radio', { name: 'Cao', exact: true })).toBeChecked();
    await expect(form.getByText(attachment.name, { exact: true })).toBeVisible();
    await expect(form.getByRole('checkbox', { name: 'Nhân viên demo', exact: true })).toBeChecked({ timeout: 15000 });
    await form.getByRole('button', { name: `Hạn chót, ${deadline}` }).click();
    const newDeadline = `22/${suffix}`;
    await form.getByRole('button', { name: `Ngày ${newDeadline}` }).click();
    const updatedTitle = `${title} đã sửa`;
    await editTitle.fill(updatedTitle);
    await form.getByRole('radio', { name: 'Thấp', exact: true }).click();
    await form.getByRole('button', { name: 'Tùy chọn thêm' }).click();
    await expect(form.getByRole('textbox', { name: 'Mô tả / chỗ vướng' })).toHaveValue('Mô tả cho cả hai người thực hiện.');
    await form.getByRole('textbox', { name: 'Lời nhắn khi giao việc' }).fill('Lời nhắn đã chỉnh sửa.');
    await form.getByRole('textbox', { name: 'Tên việc con' }).fill('Mục mới sau khi sửa');
    const editing = page.waitForResponse(response => response.url().endsWith('/updateMobileTask') &&
      response.request().method() === 'POST');
    await form.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
    const edited = await editing;
    expect(edited.ok(), await edited.text()).toBeTruthy();
    await expect(form).toBeHidden();
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
