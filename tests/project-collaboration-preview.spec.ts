import { acknowledgeStartupReminder, test } from './helpers/startupReminder';
import { expect } from '@playwright/test';

const previewUrl = process.env.MARCHIX_PREVIEW_URL ?? 'http://localhost:8081';

test('Chọn người phụ trách và trạng thái khi thêm, sửa dự án', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(previewUrl);
  await page.getByRole('button', { name: 'Đăng nhập quản trị (mô phỏng)' }).click();
  await page.getByRole('button', { name: 'Mở menu' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Dự án', exact: true }).click();
  await page.getByRole('button', { name: '+ Thêm dự án' }).click();
  const create = page.getByRole('dialog', { name: 'Thêm dự án', exact: true });
  const profile = page.getByRole('region', { name: 'Thông tin dự án' });
  const code = await create.getByText(/^Mã dự án: DA-\w+$/).textContent();
  const id = code?.match(/DA-(\w+)$/)?.[1];
  expect(id).toBeTruthy();
  const host = process.env.EXPO_PUBLIC_EMULATOR_HOST || '127.0.0.1';
  const port = process.env.EXPO_PUBLIC_FIRESTORE_EMULATOR_PORT || 8080;
  const document = `http://${host}:${port}/v1/projects/demo-marchix-mobile/databases/(default)/documents/projects/${id}`;
  const headers = { Authorization: 'Bearer owner' };

  try {
    await expect(create.getByRole('textbox', { name: 'Email người phụ trách' })).toHaveCount(0);
    await expect(create.getByRole('button', { name: 'Hủy', exact: true })).toHaveCount(0);
    await expect(create.getByRole('button', { name: 'Đóng biểu mẫu dự án' })).toBeVisible();
    await create.getByPlaceholder('Nhập tên dự án').fill('Dự án kiểm thử người phụ trách');
    await expect(create.getByPlaceholder('Nhập mục tiêu hoặc kết quả cần bàn giao')).toBeVisible();
    await expect(create.getByRole('button', { name: 'Ngày bắt đầu, Chọn ngày bắt đầu' })).toBeVisible();
    await create.getByRole('button', { name: 'Người phụ trách: Chọn người phụ trách' }).click();
    const picker = page.getByRole('dialog', { name: 'Người phụ trách' });
    await picker.getByRole('textbox', { name: 'Tìm thành viên' }).fill('nhan vien');
    await expect(picker.getByRole('checkbox')).toHaveCount(1);
    await picker.getByRole('checkbox', { name: 'Nhân viên demo' }).click();
    await expect(picker).toBeHidden();
    await expect(create.getByRole('button', { name: 'Người phụ trách: Nhân viên demo' })).toBeVisible();

    const statuses = create.getByRole('radiogroup', { name: 'Trạng thái' });
    const backgrounds = await statuses.getByRole('radio').evaluateAll(items => items.map(item => getComputedStyle(item).backgroundColor));
    expect(backgrounds).toHaveLength(3);
    expect(new Set(backgrounds).size).toBe(3);
    const paused = statuses.getByRole('radio', { name: 'Tạm dừng' });
    await paused.click();
    await expect(paused).toBeChecked();
    const pausedColor = await paused.evaluate(item => getComputedStyle(item).backgroundColor);
    await create.getByRole('button', { name: 'Lưu dự án' }).click();
    await expect(create).toBeHidden();
    await expect(profile.getByText('Nhân viên demo', { exact: true })).toBeVisible();
    await expect(profile.getByText('Tạm dừng', { exact: true })).toHaveCSS('background-color', pausedColor);
    const response = await request.get(document, { headers });
    expect(response.ok()).toBe(true);
    const { fields } = await response.json();
    expect(fields.ownerEmail.stringValue).toBe('nhanvien@example.test');

    await profile.getByRole('button', { name: 'Chỉnh sửa' }).click();
    const edit = page.getByRole('dialog', { name: 'Chỉnh sửa dự án' });
    await expect(edit.getByRole('button', { name: 'Người phụ trách: Nhân viên demo' })).toBeVisible();
    await expect(edit.getByRole('radio', { name: 'Tạm dừng' })).toBeChecked();
    await edit.getByRole('button', { name: 'Bỏ người phụ trách' }).click();
    await expect(edit.getByRole('button', { name: 'Người phụ trách: Chọn người phụ trách' })).toBeVisible();
    await edit.getByRole('radio', { name: 'Xong', exact: true }).click();
    await edit.getByRole('button', { name: 'Lưu dự án' }).click();
    await expect(edit).toBeHidden();
    await expect(profile.getByText('Xong', { exact: true })).toBeVisible();
    const updated = await request.get(document, { headers });
    expect(updated.ok()).toBe(true);
    const updatedFields = (await updated.json()).fields;
    expect(updatedFields.owner.stringValue).toBe('');
    expect(updatedFields.ownerEmail.stringValue).toBe('');
  } finally {
    await request.delete(document, { headers });
  }
});

test('Trao đổi có tệp, trả lời và chuyển tài liệu vào thư mục dự án', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(previewUrl);
  await page.getByRole('button', { name: 'Đăng nhập quản trị (mô phỏng)' }).click();
  await page.getByRole('button', { name: 'Mở menu' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Dự án', exact: true }).click();
  await page.getByRole('button', { name: /^Chọn dự án:/ }).click();
  await page.getByRole('radio', { name: 'Marchix Mobile · Demo', exact: true }).click();
  await page.getByRole('tab', { name: 'Trao đổi & tài liệu', exact: true }).click();
  const workspace = page.getByRole('region', { name: 'Trao đổi & tài liệu', exact: true });
  await expect(workspace.getByRole('textbox', { name: 'Nội dung trao đổi' })).toHaveCount(0);
  await expect(workspace.getByRole('button', { name: 'Gửi trao đổi' })).toHaveCount(0);
  const postButton = workspace.getByRole('button', { name: 'Đăng trao đổi', exact: true });
  await postButton.click();
  const composer = page.getByRole('dialog', { name: 'Đăng trao đổi', exact: true });
  await composer.getByRole('textbox', { name: 'Tiêu đề trao đổi' }).fill('Rà soát hồ sơ demo');
  await expect(composer.getByRole('button', { name: 'Hủy', exact: true })).toHaveCount(0);
  await composer.getByRole('button', { name: 'Đóng biểu mẫu' }).click();
  await expect(composer).toBeHidden();
  await postButton.click();
  await expect(composer.getByRole('textbox', { name: 'Tiêu đề trao đổi' })).toHaveValue('Rà soát hồ sơ demo');
  await composer.getByRole('textbox', { name: 'Nội dung trao đổi' }).fill('Tệp kiểm thử của dự án.');
  const chooser = page.waitForEvent('filechooser');
  await composer.getByRole('button', { name: 'Đính kèm ảnh / tài liệu vào bài' }).click();
  await (await chooser).setFiles({ name: 'hoso-demo.txt', mimeType: 'text/plain', buffer: Buffer.from('Dữ liệu kiểm thử.') });
  await expect(composer.getByRole('button', { name: 'Bỏ hoso-demo.txt' })).toBeVisible();
  await composer.getByRole('button', { name: 'Đăng trao đổi', exact: true }).click();
  await expect(composer).toBeHidden();
  await expect(workspace.getByRole('heading', { name: 'Rà soát hồ sơ demo' })).toBeVisible();
  const postSearch = workspace.getByRole('textbox', { name: 'Tìm bài trao đổi' });
  await postSearch.fill('không có bài này');
  await expect(workspace.getByText('Chưa có trao đổi khớp bộ lọc.')).toBeVisible();
  await workspace.getByRole('button', { name: 'Xóa từ khóa tìm bài trao đổi' }).click();
  await expect(workspace.getByRole('heading', { name: 'Rà soát hồ sơ demo' })).toBeVisible();
  const post = workspace.getByRole('heading', { name: 'Rà soát hồ sơ demo' }).locator('..');
  await post.getByRole('button', { name: 'Ghim bài', exact: true }).click();
  await expect(workspace.getByText('Đã ghim · Cập nhật', { exact: true })).toBeVisible();
  await post.getByRole('button', { name: /^Trả lời trao đổi của/ }).click();
  const comments = post.getByRole('region', { name: 'Bình luận dự án' });
  await expect(comments.getByText('Tệp kiểm thử của dự án.', { exact: true })).toBeVisible();
  await expect(comments.getByRole('textbox', { name: 'Nội dung trao đổi' })).toBeFocused();
  await comments.getByRole('textbox', { name: 'Nội dung trao đổi' }).fill('Đã xem hồ sơ.');
  await comments.getByRole('button', { name: 'Gửi trả lời' }).click();
  await expect(comments.getByText('Đã xem hồ sơ.', { exact: true })).toBeVisible();
  await comments.getByRole('button', { name: /^Trả lời trao đổi của/ }).click();
  await comments.getByRole('textbox', { name: 'Nội dung trao đổi' }).fill('Đã ghi nhận phản hồi.');
  await comments.getByRole('button', { name: 'Gửi trả lời' }).click();
  await expect(comments.getByText('Đã ghi nhận phản hồi.', { exact: true })).toBeVisible();
  await expect(comments.getByText('Đã xem hồ sơ.', { exact: true })).toHaveCount(2);

  await expect(workspace.getByRole('button', { name: 'Thành viên được xem trao đổi và tệp', exact: true })).toHaveCount(0);

  const library = workspace.getByRole('button', { name: 'Ảnh, tệp & thư mục', exact: true });
  await expect(library).toHaveAttribute('aria-expanded', 'false');
  await expect(library).toContainText('▾');
  await library.click();
  await expect(library).toHaveAttribute('aria-expanded', 'true');
  await expect(library).toContainText('▴');
  await expect(workspace.getByRole('heading', { name: 'Ảnh, tệp & thư mục', exact: true })).toHaveCount(0);
  await expect(workspace.getByRole('button', { name: 'Tạo thư mục', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(workspace.getByRole('button', { name: 'Chọn thư mục từ máy tính' })).toHaveCount(0);
  const folder = workspace.getByRole('button', { name: /^Thư mục:/ });
  const attachFile = workspace.getByRole('button', { name: 'Đính kèm ảnh / tài liệu', exact: true });
  await expect(folder).toHaveCount(0);
  await expect(attachFile).toHaveCount(0);
  await expect(workspace.getByRole('button', { name: /^Tải lên / })).toHaveCount(0);
  const folderName = workspace.getByRole('textbox', { name: 'Tên thư mục mới' });
  const createFolder = workspace.getByRole('button', { name: '+ Tạo thư mục', exact: true });
  await folderName.fill('Nghiệm thu demo');
  const createBounds = (await createFolder.boundingBox())!;
  const fieldBounds = (await folderName.boundingBox())!;
  expect(createBounds.width).toBeLessThan(fieldBounds.width);
  expect(Math.abs((createBounds.x + createBounds.width) - (fieldBounds.x + fieldBounds.width))).toBeLessThan(2);
  await createFolder.click();
  await expect(workspace.getByText('Đã tạo thư mục.')).toBeVisible();
  await workspace.getByRole('button', { name: 'Xem thư mục', exact: true }).click();
  await expect(folderName).toHaveCount(0);
  await expect(folder).toHaveAccessibleName('Thư mục: Nghiệm thu demo');
  const background = await folder.evaluate(item => getComputedStyle(item).backgroundColor);
  const uploadChooser = page.waitForEvent('filechooser');
  await attachFile.click();
  await (await uploadChooser).setFiles({ name: 'nghiem-thu.txt', mimeType: 'text/plain', buffer: Buffer.from('Biên bản nghiệm thu.') });
  await workspace.getByRole('button', { name: 'Tải lên Nghiệm thu demo' }).click();
  await expect(workspace.getByText('Đã tải tệp lên.')).toBeVisible();
  await expect(workspace.getByRole('button', { name: /^nghiem-thu\.txt ·/ })).toBeVisible();
  await expect(workspace.getByRole('button', { name: /^hoso-demo\.txt ·/ })).toHaveCount(0);
  await folder.click();
  await page.getByRole('radio', { name: 'Tất cả tệp', exact: true }).click();
  await expect(folder).toHaveCSS('background-color', background);
  await workspace.getByRole('button', { name: /^Chuyển thư mục · hoso-demo\.txt:/ }).click();
  await page.getByRole('radio', { name: 'Nghiệm thu demo', exact: true }).click();
  await expect(workspace.getByText('Đã chuyển tệp.')).toBeVisible();
  await workspace.getByRole('button', { name: /^hoso-demo\.txt ·/ }).first().click();
  await expect(page.getByRole('heading', { name: 'hoso-demo.txt' })).toBeVisible();
  await expect(page.getByText('Dữ liệu kiểm thử.', { exact: true })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Tải xuống', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('hoso-demo.txt');
});

test('Cấp và thu hồi quyền xem trao đổi và tệp trong popup chỉnh sửa tài khoản', async ({ page, browser }) => {
  test.setTimeout(60_000);
  const member = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await acknowledgeStartupReminder(member);
    await member.goto(previewUrl);
    await member.getByRole('button', { name: 'Đăng nhập bằng Google' }).click();
    await member.getByRole('button', { name: 'Mở menu' }).click();
    await member.getByRole('dialog').getByRole('button', { name: 'Dự án', exact: true }).click();
    await member.getByRole('button', { name: /^Chọn dự án:/ }).click();
    await member.getByRole('radio', { name: 'Marchix Mobile · Demo', exact: true }).click();
    await member.getByRole('tab', { name: 'Trao đổi & tài liệu', exact: true }).click();
    const workspace = member.getByRole('region', { name: 'Trao đổi & tài liệu', exact: true });
    const postButton = workspace.getByRole('button', { name: 'Đăng trao đổi', exact: true });
    await expect(workspace.getByText(/thành viên được cấp quyền có thể xem/)).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(previewUrl);
    await page.getByRole('button', { name: 'Đăng nhập quản trị (mô phỏng)' }).click();
    await page.getByRole('button', { name: 'Mở menu' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cài đặt', exact: true }).click();
    await page.getByRole('tab', { name: 'Tài khoản', exact: true }).click();
    const account = page.getByRole('button', { name: /Nhân viên demo/ });
    const editor = page.getByRole('dialog', { name: 'Chỉnh sửa tài khoản', exact: true });
    const permissions = page.getByRole('region', { name: 'Xem trao đổi và tệp dự án', exact: true });
    await expect(permissions).toHaveCount(0);

    for (const checked of [false, true]) {
      await account.click();
      const toggle = permissions.getByRole('switch', { name: 'Xem trao đổi và tệp dự án', exact: true });
      await expect(toggle).toBeEnabled();
      await expect(toggle).toHaveAttribute('aria-checked', String(checked));
      await expect(permissions.getByRole('switch')).toHaveCount(1);
      const otherRight = await editor.getByRole('switch', { name: 'Quản lý văn thư', exact: true })
        .evaluate(element => element.getBoundingClientRect().right);
      await expect.poll(() => toggle.evaluate(element => element.getBoundingClientRect().right)).toBeCloseTo(otherRight);
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-checked', String(!checked));
      await expect(postButton).toHaveCount(checked ? 1 : 0);
      await editor.getByRole('button', { name: 'Lưu cài đặt' }).click();
      await expect(editor).toBeHidden();
      await expect(postButton).toHaveCount(checked ? 0 : 1);
    }
  } finally {
    await member.close();
  }
});
