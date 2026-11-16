import { expect, devices } from '@playwright/test';
import { test } from './helpers/startupReminder';
import { pilotProjectMentionId } from '../src/features/notifications/projectMention';

test.use({ ...devices['iPhone 13'], defaultBrowserType: 'chromium' });

for (const mode of ['pilot', 'structured', 'missing-project', 'legacy'] as const) {
  test(`Thông báo dự án ${mode} không mở nhầm dự án đầu tiên`, async ({ page, request }) => {
    const suffix = Date.now().toString();
    const projectId = `Đà-Nẵng-${suffix}`;
    const firstId = `first-mention-${suffix}`;
    const targetName = `ZZ · Dự án được nhắc ${suffix}`;
    const firstName = `AA · Dự án không liên quan ${suffix}`;
    const title = 'Bạn được nhắc trong dự án';
    const host = process.env.EXPO_PUBLIC_EMULATOR_HOST || '127.0.0.1';
    const port = process.env.EXPO_PUBLIC_FIRESTORE_EMULATOR_PORT || 8080;
    const base = `http://${host}:${port}/v1/projects/demo-marchix-mobile/databases/(default)/documents`;
    const headers = { Authorization: 'Bearer owner' };
    const targetId = mode === 'missing-project' ? `deleted-${suffix}` : projectId;
    const noteId = mode === 'pilot' || mode === 'missing-project'
      ? pilotProjectMentionId(targetId, suffix.padStart(20, 'A')) : `${mode}-${suffix}`;
    const postTitle = `Trao đổi đúng dự án ${suffix}`;
    const fixtures: Array<[string, Record<string, string | boolean | string[]>]> = [
      [`projects/${firstId}`, { name: firstName, ownerEmail: 'nhanvien@example.test', status: 'Đang chạy' }],
      [`projects/${encodeURIComponent(projectId)}`, { name: targetName, ownerEmail: 'nhanvien@example.test', status: 'Đang chạy' }],
      [`projects/${encodeURIComponent(projectId)}/posts/mention-post`, {
        title: postTitle, body: 'Nội dung giả cho hồi quy thông báo.', kind: 'Cập nhật', status: 'open', pinned: false,
        files: [], mentions: [], taskId: '', conclusion: '',
        createdBy: 'quantri@example.test', createdAt: new Date().toISOString(),
      }],
      [`notifications/${encodeURIComponent(noteId)}`, {
        title, body: 'Mở mục Trao đổi & tài liệu để xem nội dung.', link: '#du-an',
        to: 'nhanvien@example.test', from: 'quantri@example.test',
        read: false, emailed: false, createdAt: new Date().toISOString(),
        ...(mode === 'structured' ? { kind: 'projectMention', projectId, postId: 'mention-post' } : {}),
      }],
    ];
    try {
      for (const [path, values] of fixtures) {
        expect((await request.patch(`${base}/${path}`, { headers, data: {
          fields: Object.fromEntries(Object.entries(values).map(([key, value]) => [key,
            Array.isArray(value) ? { arrayValue: { values: value.map(item => ({ stringValue: item })) } }
              : typeof value === 'boolean' ? { booleanValue: value } : { stringValue: value }])),
        } })).ok()).toBe(true);
      }
      await page.goto(process.env.MARCHIX_PREVIEW_URL ?? 'http://localhost:8081');
      await page.getByRole('button', { name: 'Đăng nhập Google (mô phỏng)', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Tổng quan', exact: true })).toBeVisible();
      await page.getByRole('button', { name: /^Thông báo(?:,|$)/ }).click();
      await page.getByRole('button', { name: 'Chưa đọc: ' + title, exact: true }).first().click();
      if (mode === 'legacy') {
        await expect(page.getByRole('alert')).toContainText('Thông báo cũ chưa có mã dự án.');
        await expect(page.getByRole('heading', { name: 'Tổng quan', exact: true })).toBeVisible();
      } else if (mode === 'missing-project') {
        await expect(page.getByRole('alert')).toContainText('Không tìm thấy dự án từ thông báo');
      } else {
        await expect(page.getByRole('heading', { name: targetName, exact: true })).toBeVisible();
        await expect(page.getByRole('region', { name: 'Trao đổi & tài liệu', exact: true })).toBeVisible();
        await expect(page.getByRole('heading', { name: postTitle, exact: true })).toBeVisible();
      }
      await expect(page.getByRole('heading', { name: firstName, exact: true })).toHaveCount(0);
      await expect.poll(async () => {
        const notification = await request.get(`${base}/notifications/${encodeURIComponent(noteId)}`, { headers });
        return (await notification.json()).fields.read.booleanValue;
      }).toBe(true);
    } finally {
      await Promise.all(fixtures.map(([path]) => request.delete(`${base}/${path}`, { headers })));
    }
  });
}
