import { acknowledgeStartupReminder, test } from './helpers/startupReminder';
import { expect, type Locator } from '@playwright/test';

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

test('Tách trao đổi và tài liệu, tạo thư mục và tải tệp dự án', async ({ page }) => {
  test.setTimeout(90_000);
  const attachment = (name: string, text: string) => ({ name, mimeType: 'text/plain', buffer: Buffer.from(text) });
  async function choose(button: Locator, ...files: ReturnType<typeof attachment>[]) {
    const chooser = page.waitForEvent('filechooser');
    await button.click();
    await (await chooser).setFiles(files);
  }
  async function checkPreview(scope: Locator, name: string, text: string) {
    const file = scope.getByRole('button', { name, exact: true });
    const card = file.locator('..');
    await expect(card).toHaveCSS('border-radius', '9px');
    await expect(file.getByText(name, { exact: true })).toHaveCSS('font-weight', '700');
    await file.click();
    await expect(page.getByText(text, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Đóng xem trước', exact: true }).click();
    const remove = card.getByRole('button', { name: 'Bỏ tệp ' + name, exact: true });
    await expect(remove).toHaveText('');
    const [removeBox, cardBox] = await Promise.all([remove.boundingBox(), card.boundingBox()]);
    expect(cardBox!.x + cardBox!.width - removeBox!.x - removeBox!.width).toBeLessThanOrEqual(2);
    return remove;
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(previewUrl);
  await page.getByRole('button', { name: 'Đăng nhập quản trị (mô phỏng)' }).click();
  await page.getByRole('button', { name: 'Mở menu' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Dự án', exact: true }).click();
  await page.getByRole('button', { name: /^Chọn dự án:/ }).click();
  await page.getByRole('radio', { name: 'Marchix Mobile · Demo', exact: true }).click();
  await page.getByRole('tab', { name: 'Trao đổi', exact: true }).click();
  const workspace = page.getByRole('region', { name: 'Trao đổi', exact: true });
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
  await expect(composer.getByRole('button', { name: /Đính kèm/ })).toHaveCount(0);
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
  await expect(comments.getByRole('button', { name: 'Đính kèm tệp', exact: true })).toHaveCount(0);
  await comments.getByRole('button', { name: 'Gửi trả lời' }).click();
  await expect(comments.getByText('Đã xem hồ sơ.', { exact: true })).toBeVisible();
  await comments.getByRole('button', { name: /^Trả lời trao đổi của/ }).click();
  await comments.getByRole('textbox', { name: 'Nội dung trao đổi' }).fill('Đã ghi nhận phản hồi.');
  await comments.getByRole('button', { name: 'Gửi trả lời' }).click();
  await expect(comments.getByText('Đã ghi nhận phản hồi.', { exact: true })).toBeVisible();
  await expect(comments.getByText('Đã xem hồ sơ.', { exact: true })).toHaveCount(2);

  await expect(workspace.getByRole('button', { name: 'Thành viên được xem trao đổi và tệp', exact: true })).toHaveCount(0);

  await expect(workspace.getByRole('textbox', { name: 'Tên thư mục mới' })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Tài liệu', exact: true }).click();
  const documents = page.getByRole('region', { name: 'Tài liệu', exact: true });
  await expect(documents.getByRole('button', { name: 'Đăng trao đổi' })).toHaveCount(0);
  await expect(documents.getByRole('button', { name: 'Xem thư mục', exact: true })).toHaveCount(0);
  await expect(documents.getByRole('button', { name: 'Chọn thư mục từ máy tính' })).toHaveCount(0);
  const folder = documents.getByRole('button', { name: /^Thư mục:/ });
  const attachFile = documents.getByRole('button', { name: 'Đính kèm ảnh / tài liệu', exact: true });
  await expect(folder).toHaveAccessibleName('Thư mục: Tất cả tệp');
  await expect(attachFile).toBeVisible();
  await expect(documents.getByRole('button', { name: 'Tải lên Chung', exact: true })).toBeDisabled();
  const folderName = documents.getByRole('textbox', { name: 'Tên thư mục mới' });
  const createFolder = documents.getByRole('button', { name: '+ Tạo thư mục', exact: true });
  await folderName.fill('Nghiệm thu demo');
  const createBounds = (await createFolder.boundingBox())!;
  const fieldBounds = (await folderName.boundingBox())!;
  const folderBounds = (await folder.boundingBox())!;
  expect(createBounds.x).toBeGreaterThanOrEqual(fieldBounds.x + fieldBounds.width);
  expect(Math.abs(createBounds.y - fieldBounds.y)).toBeLessThan(2);
  expect(folderBounds.y).toBeGreaterThan(createBounds.y + createBounds.height);
  await expect(createFolder).toHaveCSS('background-color', 'rgb(96, 65, 189)');
  await expect(createFolder.getByText('+ Tạo thư mục')).toHaveCSS('color', 'rgb(255, 255, 255)');
  await createFolder.click();
  await expect(documents.getByText('Đã tạo thư mục.')).toBeVisible();
  await expect(folderName).toHaveValue('');
  await expect(folder).toHaveAccessibleName('Thư mục: Nghiệm thu demo');
  const background = await folder.evaluate(item => getComputedStyle(item).backgroundColor);
  await choose(attachFile, attachment('nghiem-thu.txt', 'Biên bản nghiệm thu.'),
    attachment('bo-thu-vien.txt', 'Không tải lên.'));
  await checkPreview(documents, 'nghiem-thu.txt', 'Biên bản nghiệm thu.');
  await documents.getByRole('button', { name: 'Bỏ tệp bo-thu-vien.txt', exact: true }).click();
  await expect(documents.getByRole('button', { name: 'bo-thu-vien.txt', exact: true })).toHaveCount(0);
  await documents.getByRole('button', { name: 'Tải lên Nghiệm thu demo' }).click();
  await expect(documents.getByText('Đã tải tệp lên.')).toBeVisible();
  await expect(documents.getByRole('button', { name: /^nghiem-thu\.txt ·/ })).toBeVisible();
  await folder.click();
  await page.getByRole('radio', { name: 'Tất cả tệp', exact: true }).click();
  await expect(folder).toHaveCSS('background-color', background);
  await documents.getByRole('button', { name: /^Chuyển thư mục · nghiem-thu\.txt:/ }).click();
  await page.getByRole('radio', { name: 'Chung', exact: true }).click();
  await expect(documents.getByText('Đã chuyển tệp.')).toBeVisible();
  await documents.getByRole('button', { name: /^nghiem-thu\.txt ·/ }).first().click();
  await expect(page.getByRole('heading', { name: 'nghiem-thu.txt' })).toBeVisible();
  await expect(page.getByText('Biên bản nghiệm thu.', { exact: true })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Tải xuống', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('nghiem-thu.txt');
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
    await member.getByRole('tab', { name: 'Trao đổi', exact: true }).click();
    const workspace = member.getByRole('region', { name: 'Trao đổi', exact: true });
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
