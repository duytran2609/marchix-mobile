import { test } from './helpers/startupReminder';
import { devices, expect } from '@playwright/test';
import { formatTaskDate, shiftDay, todayInVietnam } from '../src/features/tasks/taskDates';

test.use({ ...devices['iPhone 13'], defaultBrowserType: 'chromium' });

test('Chuông thông báo mở đúng công việc, đơn từ, thu chi và kỳ lương', async ({ page, request }) => {
  test.setTimeout(120_000);
  page.setDefaultTimeout(15_000);
  const host = process.env.EXPO_PUBLIC_EMULATOR_HOST || '127.0.0.1';
  const port = process.env.EXPO_PUBLIC_FIRESTORE_EMULATOR_PORT || 8080;
  const root = `http://${host}:${port}/v1/projects/demo-marchix-mobile/databases/(default)/documents`;
  const headers = { Authorization: 'Bearer owner' };
  const uid = 'inbox-' + Date.now();
  const staff = 'nhanvien@example.test';
  const now = new Date().toISOString();
  const paths: string[] = [];
  async function fixture(path: string, values: Record<string, string | number | boolean>) {
    paths.push(path);
    const fields = Object.fromEntries(Object.entries(values).map(([key, value]) => [key,
      typeof value === 'boolean' ? { booleanValue: value }
        : typeof value === 'number' ? { integerValue: String(value) } : { stringValue: value }]));
    const response = await request.patch(`${root}/${path}`, { headers, data: { fields } });
    expect(response.ok(), path).toBe(true);
  }
  async function note(name: string, title: string, link: string, target: Record<string, string> = {}) {
    await fixture(`notifications/${uid}-${name}`, { title, link, to: staff, body: '',
      from: 'quantri@example.test', createdAt: now, read: false, ...target });
  }
  async function openNote(title: string) {
    await page.getByRole('button', { name: /^Thông báo(?:,|$)/ }).click();
    await page.getByRole('button', { name: 'Chưa đọc: ' + title, exact: true }).click();
  }
  const changes = [
    ['assignee', 'Bạn là người thực hiện mới', 'Người thực hiện: Thành viên A → Nhân viên demo'],
    ['due', 'Hạn công việc đã thay đổi', 'Hạn: 26/11/2026 → 28/11/2026'],
    ['reviewer', 'Người duyệt công việc đã thay đổi', 'Người duyệt: Thành viên A → Thành viên B'],
  ];
  const removedTitle = 'Bạn không còn phụ trách thực hiện công việc';
  const removedBody = 'Công việc: Việc đã bàn giao\nNgười thực hiện: Nhân viên demo → Thành viên B';
  const updatedTaskId = uid + '-updated';
  const updatedTaskTitle = 'Công việc cập nhật từ chuông';
  const reviews = [
    { key: 'submitted', title: 'Có việc chờ duyệt', taskTitle: 'Việc vừa gửi duyệt', status: 'Chờ duyệt',
      body: 'Người gửi duyệt: Thành viên A\nKết quả: Chờ duyệt\nBáo cáo kết quả: Đã gửi tài liệu.' },
    { key: 'approved', title: 'Công việc đã được duyệt', taskTitle: 'Việc đã duyệt xong', status: 'Xong',
      body: 'Người duyệt: Thành viên B\nKết quả: Đã duyệt\nXếp loại: Tốt\nNhận xét: Đủ tài liệu.' },
    { key: 'rework', title: 'Công việc cần làm lại', taskTitle: 'Việc được trả lại', status: 'Đang làm',
      body: 'Người yêu cầu làm lại: Thành viên B\nKết quả: Yêu cầu làm lại\nLý do: Bổ sung bản đối chiếu.' },
  ];
  try {
    await fixture('tasks/' + uid, { title: 'Việc đã bàn giao', assigneeEmail: 'nguoigiao@example.test',
      assignedBy: 'quantri@example.test', status: 'Đang làm' });
    await fixture('tasks/' + updatedTaskId, { title: updatedTaskTitle, assigneeEmail: staff,
      assignedBy: 'quantri@example.test', status: 'Đang làm', due: todayInVietnam() });
    await fixture('requests/' + uid, { type: 'Nghỉ phép', status: 'Đã duyệt', createdBy: staff,
      reason: 'Nội dung đơn thử từ chuông', from: '2026-11-16', to: '2026-11-16', days: 1 });
    await fixture('cash/' + uid, { type: 'chi', status: 'Đã chi', createdBy: staff, amount: 10000,
      date: '2026-11-16', note: 'Chứng từ thử từ chuông' });
    await fixture('payroll/2026-07_' + uid, { month: '2026-07', email: staff, status: 'Đã chốt' });
    await Promise.all([
      ...reviews.map(({ key, taskTitle, status }) => fixture(`tasks/${uid}-${key}`, {
        title: taskTitle, assigneeEmail: staff, assignedBy: 'quantri@example.test', status,
      })),
      note('task', 'Thông báo thử giao việc', '#cong-viec', { taskId: 'cap-nhat-huong-dan' }),
      note('request', 'Thông báo thử đơn từ', '#don-tu/' + uid),
      note('cash', 'Thông báo thử thu chi', '#thu-chi/' + uid),
      note('payroll', 'Thông báo thử phiếu lương', '#luong/2026-07'),
      ...changes.map(([key, title, body]) => note(key, title, '#cong-viec', {
        taskId: updatedTaskId, body: `Công việc: ${updatedTaskTitle}\n${body}`,
      })),
      note('other-due', 'Hạn công việc đã thay đổi', '#cong-viec', {
        taskId: 'cap-nhat-huong-dan', body: 'Công việc: Cập nhật hướng dẫn bàn giao\nHạn: 26/11/2026 → 28/11/2026',
      }),
      ...reviews.map(({ key, title, taskTitle, body }) => note(key, title, '#cong-viec', {
        taskId: `${uid}-${key}`, body: `Công việc: ${taskTitle}\n${body}`,
      })),
      note('removed', removedTitle, '#cong-viec', { taskId: uid, body: removedBody }),
    ]);
    await page.goto(process.env.MARCHIX_PREVIEW_URL ?? 'http://localhost:8081', {
      timeout: 90_000, waitUntil: 'domcontentloaded',
    });
    await page.getByRole('button', { name: 'Đăng nhập bằng Google', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Tổng quan', exact: true })).toBeVisible({ timeout: 15_000 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await openNote('Thông báo thử giao việc');
    await expect(page.getByRole('heading', { name: 'Cập nhật hướng dẫn bàn giao', exact: true })).toBeVisible();
    for (const [, title, body] of changes) {
      await page.getByRole('button', { name: /^Thông báo(?:,|$)/ }).click();
      const change = page.getByRole('button', { name: 'Chưa đọc: ' + title, exact: true })
        .filter({ hasText: `Công việc: ${updatedTaskTitle}` });
      await expect(change).toContainText(body);
      await change.click();
      await expect(page.getByRole('heading', { name: updatedTaskTitle, exact: true })).toBeVisible();
    }
    for (const { title, body, taskTitle } of reviews) {
      await page.getByRole('button', { name: /^Thông báo(?:,|$)/ }).click();
      const notification = page.getByRole('button', { name: 'Chưa đọc: ' + title, exact: true }).filter({ hasText: taskTitle });
      await expect(notification).toContainText(body);
      await notification.click();
      await expect(page.getByRole('heading', { name: taskTitle, exact: true })).toBeVisible();
    }
    await openNote(removedTitle);
    await expect(page.getByRole('alert').filter({ hasText: 'bạn không còn quyền mở' })).toBeVisible();
    await expect(page.getByRole('heading', { name: removedTitle })).toBeVisible();
    await expect(page.getByText(removedBody, { exact: true })).toBeVisible();
    await openNote('Thông báo thử đơn từ');
    await expect(page.getByRole('dialog', { name: 'Chi tiết đơn' })).toContainText('Nội dung đơn thử từ chuông');
    await page.getByRole('button', { name: 'Đóng đơn', exact: true }).click();
    await openNote('Thông báo thử thu chi');
    await expect(page.getByRole('heading', { name: 'Chứng từ thử từ chuông', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Về sổ thu chi', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Chứng từ thử từ chuông', exact: true })).toBeHidden();
    await openNote('Thông báo thử phiếu lương');
    await expect(page.getByRole('button', { name: 'Chọn tháng: 07/2026', exact: true })).toBeVisible();
    await expect(page.getByText('Tháng 07/2026', { exact: true })).toBeVisible();
  } finally {
    await Promise.all(paths.map(path => request.delete(`${root}/${path}`, { headers })));
  }
});

test('Chuông nhắc sắp đến hạn và quá hạn, mở đúng công việc trùng tên', async ({ page, request }) => {
  const host = process.env.EXPO_PUBLIC_EMULATOR_HOST || '127.0.0.1';
  const port = process.env.EXPO_PUBLIC_FIRESTORE_EMULATOR_PORT || 8080;
  const root = `http://${host}:${port}/v1/projects/demo-marchix-mobile/databases/(default)/documents/tasks`;
  const headers = { Authorization: 'Bearer owner' };
  const uid = 'deadline-inbox-' + Date.now();
  const staff = 'nhanvien@example.test';
  const today = todayInVietnam();
  const tomorrow = shiftDay(today, 1);
  const yesterday = shiftDay(today, -1);
  const title = 'Việc trùng tên để thử nhắc hạn';
  const tasks = {
    upcoming: { title, due: tomorrow, status: 'Đang làm', note: 'Mô tả việc sắp đến hạn' },
    overdue: { title, due: yesterday, status: 'Vướng', note: 'Mô tả việc đã quá hạn' },
    today: { title: 'Việc hết hạn hôm nay', due: today, status: 'Chưa làm' },
    outside: { title: 'Việc ngoài khoảng nhắc', due: shiftDay(today, 3), status: 'Đang làm' },
    pending: { title: 'Việc đang chờ duyệt', due: yesterday, status: 'Chờ duyệt' },
    done: { title: 'Việc đã xong', due: yesterday, status: 'Xong' },
    sent: { title: 'Việc giao cho người khác', due: yesterday, status: 'Đang làm', assigneeEmail: 'nguoigiao@example.test' },
  };
  const taskUrl = (id: string) => `${root}/${uid}-${id}`;
  async function saveTask(id: keyof typeof tasks, change?: { status: string }) {
    const fields = Object.fromEntries(Object.entries({ assigneeEmail: staff, assignedBy: staff, ...tasks[id], ...change })
      .map(([name, value]) => [name, { stringValue: value }]));
    expect((await request.patch(taskUrl(id), { headers, data: { fields } })).ok()).toBe(true);
  }
  const bell = page.getByRole('button', { name: /^Thông báo(?:,|$)/ });
  const upcoming = page.getByRole('button', { name: 'Chưa đọc: Sắp đến hạn: ' + title, exact: true });
  const overdue = page.getByRole('button', { name: 'Chưa đọc: Quá hạn: ' + title, exact: true });
  const closeBell = page.getByRole('button', { name: 'Đóng thông báo', exact: true });
  const unreadTab = page.getByRole('tab', { name: /^Chưa đọc/ });
  async function openSettings() {
    await page.getByRole('button', { name: 'Mở menu' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cài đặt', exact: true }).click();
  }
  try {
    for (const id of Object.keys(tasks) as (keyof typeof tasks)[]) await saveTask(id);
    await page.goto(process.env.MARCHIX_PREVIEW_URL ?? 'http://localhost:8081');
    await page.getByRole('button', { name: 'Đăng nhập bằng Google', exact: true }).click();
    await openSettings();
    const reminderSwitch = page.getByRole('switch', { name: 'Nhắc hạn công việc' });
    await expect(reminderSwitch).not.toBeChecked();
    await reminderSwitch.click();
    await expect(page.getByText('Đã bật nhắc hạn công việc trên chuông.', { exact: true })).toBeVisible();
    await bell.click();
    await expect(page.getByRole('button', { name: /^Loại thông báo/ })).toHaveCount(0);
    await expect(upcoming).toContainText(`Hạn ${formatTaskDate(tomorrow)} · Còn 1 ngày`);
    await expect(overdue).toContainText(`Hạn ${formatTaskDate(yesterday)} · Đã quá 1 ngày`);
    await expect(page.getByRole('button', { name: 'Chưa đọc: Đến hạn hôm nay: ' + tasks.today.title })).toBeVisible();
    for (const task of [tasks.outside, tasks.pending, tasks.done, tasks.sent]) {
      await expect(page.getByRole('button', { name: new RegExp(task.title) })).toHaveCount(0);
    }

    await upcoming.click();
    await page.getByRole('button', { name: 'Mô tả', exact: true }).click();
    await expect(page.getByText(tasks.upcoming.note, { exact: true })).toBeVisible();
    await bell.click();
    await unreadTab.click();
    await expect(upcoming).toHaveCount(0);
    await overdue.click();
    await page.getByRole('button', { name: 'Mô tả', exact: true }).click();
    await expect(page.getByText(tasks.overdue.note, { exact: true })).toBeVisible();

    await page.reload();
    await bell.click();
    await expect(page.getByRole('button', { name: 'Sắp đến hạn: ' + title, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Quá hạn: ' + title, exact: true })).toBeVisible();
    await saveTask('overdue', { status: 'Xong' });
    await expect(page.getByRole('button', { name: 'Quá hạn: ' + title, exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Đánh dấu tất cả đã đọc', exact: true }).click();
    await expect(page.getByText(/^Đã đánh dấu \d+ thông báo là đã đọc\.$/)).toBeVisible();
    await unreadTab.click();
    await expect(page.getByText('Không có thông báo chưa đọc.', { exact: true })).toBeVisible();
    await closeBell.click();
    await openSettings();
    await expect(reminderSwitch).toBeChecked();
    await page.getByRole('radio', { name: 'Trước 3 ngày', exact: true }).click();
    await expect(page.getByText('Đã đặt nhắc việc trước hạn 3 ngày.', { exact: true })).toBeVisible();
    await reminderSwitch.click();
    await expect(page.getByText('Đã tắt nhắc hạn công việc trên chuông.', { exact: true })).toBeVisible();
    await bell.click();
    await expect(page.getByRole('button', { name: 'Sắp đến hạn: ' + title, exact: true })).toHaveCount(0);
  } finally {
    await Promise.all(Object.keys(tasks).map(id => request.delete(taskUrl(id), { headers })));
  }
});
