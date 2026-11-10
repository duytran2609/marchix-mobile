import assert from 'node:assert/strict';
import { chromium, devices, expect } from '@playwright/test';

const taskId = 'review-ui-qa-' + Date.now();
const title = 'Kiểm thử duyệt công việc ' + taskId;
const docs = 'http://127.0.0.1:8080/v1/projects/demo-marchix-mobile/databases/(default)/documents/tasks';
const headers = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const source = await fetch(docs + '/cho-duyet-demo', { headers });
assert(source.ok, await source.clone().text());
const { fields } = await source.json();
const fixture = await fetch(docs + '?documentId=' + taskId, { method: 'POST', headers,
  body: JSON.stringify({ fields: { ...fields, title: { stringValue: title } } }),
});
assert(fixture.ok, await fixture.text());

let browser;
try {
  browser = await chromium.launch();
  const sender = await browser.newPage(devices['Pixel 7']);
  const reviewer = await browser.newPage(devices['Pixel 7']);
  const open = page => page.goto('http://127.0.0.1:8087', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await Promise.all([open(sender), open(reviewer)]);
  await sender.getByRole('button', { name: 'Đăng nhập Google (mô phỏng)' }).click({ timeout: 60000 });
  await reviewer.getByRole('button', { name: 'Đăng nhập người giao việc (mô phỏng)' }).click({ timeout: 60000 });
  await reviewer.getByRole('button', { name: 'Việc chờ duyệt', exact: true }).click();
  await expect(reviewer.getByRole('heading', { name: 'Việc chờ duyệt' })).toBeVisible();
  const row = reviewer.getByRole('button', { name: 'Duyệt công việc: ' + title });
  await row.click();
  await expect(reviewer.getByText('Đã rà soát nội dung hướng dẫn.')).toBeVisible();
  await expect(reviewer.getByRole('button', { name: 'Duyệt', exact: true })).toBeDisabled();
  const rework = reviewer.getByRole('button', { name: 'Yêu cầu làm lại' });
  await expect(rework).toBeDisabled();
  const feedback = 'Bổ sung bước xác nhận trên Android.';
  await reviewer.getByLabel('Nhận xét của người giao').fill(feedback);
  await rework.click();
  await expect(reviewer.getByText('Đã gửi yêu cầu làm lại.')).toBeVisible({ timeout: 16000 });
  await expect(row).toHaveCount(0);

  const card = sender.getByRole('button', { name: 'Mở công việc: ' + title });
  await expect(card).toContainText('Đang làm');
  await card.click();
  await expect(sender.getByText(feedback)).toBeVisible();
  await sender.getByLabel('Kết quả thực hiện').fill('Đã bổ sung xác nhận trên Android.');
  await sender.getByRole('button', { name: 'Báo hoàn thành' }).click();
  await expect(sender.getByText('Chờ duyệt · 100%')).toBeVisible({ timeout: 16000 });
  await row.click();
  await expect(reviewer.getByText('Đã bổ sung xác nhận trên Android.')).toBeVisible();
  await reviewer.getByRole('radio', { name: 'Tốt', exact: true }).click();
  const approval = 'Nội dung đã đủ để bàn giao.';
  await reviewer.getByLabel('Nhận xét của người giao').fill(approval);
  await reviewer.getByRole('button', { name: 'Duyệt', exact: true }).click();
  await expect(reviewer.getByText('Đã duyệt công việc.')).toBeVisible({ timeout: 16000 });
  await expect(row).toHaveCount(0);
  await expect(sender.getByText('Xong · 100%')).toBeVisible();
  await expect(sender.getByText(approval)).toBeVisible();
  const final = await fetch(docs + '/' + taskId, { headers });
  assert(final.ok, await final.clone().text());
  const saved = (await final.json()).fields;
  assert.equal(saved.status.stringValue, 'Xong');
  assert.equal(saved.reviewedBy.stringValue, 'nguoigiao@example.test');
  assert.equal(saved.rating.stringValue, 'Tốt');
  console.log('PASS: hai phiên mobile, danh sách Chờ duyệt, yêu cầu làm lại, gửi lại và duyệt Xong.');
} finally {
  await browser?.close();
  const removed = await fetch(docs + '/' + taskId, { method: 'DELETE', headers });
  assert(removed.ok, await removed.text());
}
