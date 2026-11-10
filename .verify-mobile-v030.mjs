import assert from 'node:assert/strict';
import { chromium, devices, expect } from '@playwright/test';

const taskId = 'workflow-ui-qa-' + Date.now();
const title = 'Kiểm thử trên giao diện mobile ' + taskId;
const docs = 'http://127.0.0.1:8080/v1/projects/demo-marchix-mobile/databases/(default)/documents/tasks';
const headers = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const original = await fetch(docs + '/kiem-tra-checklist', { headers });
assert(original.ok, await original.clone().text());
const source = (await original.json()).fields;
const fixture = await fetch(docs + '?documentId=' + taskId, { method: 'POST', headers,
  body: JSON.stringify({ fields: {
    ...source, title: { stringValue: title }, status: { stringValue: 'Đang làm' },
    progress: { integerValue: '50' },
    checklist: { arrayValue: { values: ['Đã kiểm tra', 'Gửi kết quả'].map((text, i) => ({
      mapValue: { fields: { t: { stringValue: text }, done: { booleanValue: i === 0 } } },
    })) } },
  } }),
});
assert(fixture.ok, await fixture.text());

let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage(devices['Pixel 7']);
  await page.goto('http://127.0.0.1:8087', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.getByRole('button', { name: 'Đăng nhập Google (mô phỏng)' }).click({ timeout: 60000 });
  const card = page.getByRole('button', { name: 'Mở công việc: ' + title });
  await card.click();
  await expect(page.getByText('1/2 đã xong')).toBeVisible();
  const report = page.getByRole('button', { name: 'Báo hoàn thành' });
  await expect(report).toBeDisabled();
  const last = page.getByRole('checkbox', { name: 'Gửi kết quả' });
  await last.click();
  await expect(page.getByText('100% · Tự tính theo checklist.')).toBeVisible({ timeout: 16000 });
  await expect(last).toBeChecked();
  await last.click();
  await expect(report).toBeDisabled();
  await expect(page.getByText('50% · Tự tính theo checklist.')).toBeVisible();
  await last.click();
  const note = 'Đã đối chiếu đủ checklist.';
  await page.getByLabel('Kết quả thực hiện').fill(note);
  await report.click();
  await expect(page.getByText('Đã gửi công việc để duyệt.')).toBeVisible({ timeout: 16000 });
  await expect(page.getByText('Chờ duyệt · 100%')).toBeVisible();
  await expect(last).toBeDisabled();
  await expect(page.getByText(note)).toBeVisible();
  await page.getByRole('button', { name: 'Danh sách công việc' }).click();
  await page.getByRole('radio', { name: 'Chờ duyệt', exact: true }).click();
  await expect(card).toContainText('100%');
  await card.click();
  await expect(page.getByText('2/2 đã xong')).toBeVisible();
  const result = await fetch(docs + '/' + taskId, { headers });
  assert(result.ok, await result.clone().text());
  const { fields } = await result.json();
  assert.equal(fields.status.stringValue, 'Chờ duyệt');
  assert.equal(fields.progress.integerValue, '100');
  console.log('PASS: tick, bỏ tick, cập nhật phần trăm, gửi kết quả, bộ lọc Chờ duyệt và đọc lại từ Firestore.');
} finally {
  await browser?.close();
  const removed = await fetch(docs + '/' + taskId, { method: 'DELETE', headers });
  assert(removed.ok, await removed.text());
}
