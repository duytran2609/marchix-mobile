import assert from 'node:assert/strict';
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { connectFirestoreEmulator, doc, getDocFromServer, getFirestore, terminate, updateDoc } from 'firebase/firestore';
import { chromium, devices, expect } from '@playwright/test';

const staff = 'nhanvien@example.test';
const colleague = 'dongnghiep@example.test';
const projectId = 'demo-marchix-mobile';
const db = getFirestore(initializeApp({ projectId, apiKey: 'marchix-emulator-key' }));
const auth = getAuth();
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
connectFirestoreEmulator(db, '127.0.0.1', 8080);
const login = (email, sub) => signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({
  sub, email, email_verified: true,
})));

const testId = 'mobile-qa-' + Date.now();
const title = 'Kiểm thử trao đổi ' + testId;
const docs = `http://127.0.0.1:8080/v1/projects/${projectId}/databases/(default)/documents/tasks`;
const api = (method, url, body) => fetch(url, {
  method, headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
  body: body ? JSON.stringify(body) : undefined,
});
const encode = value => typeof value === 'string' ? { stringValue: value }
  : typeof value === 'number' ? { integerValue: String(value) }
  : typeof value === 'boolean' ? { booleanValue: value }
  : Array.isArray(value) ? { arrayValue: { values: value.map(encode) } }
  : { mapValue: { fields: fields(value) } };
const fields = value => Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encode(v)]));
const fixture = await api('POST', `${docs}?documentId=${testId}`, { fields: fields({
  title, assigneeEmail: staff, status: 'Đang làm', progress: 50,
  checklist: [{ t: 'Checklist bản web', done: true }, { text: 'Checklist dữ liệu demo cũ', done: false }],
  rating: 'Tốt', reviewNote: 'Đã xem kết quả.',
}) });
assert(fixture.ok, await fixture.text());
let browser;
try {
  const ref = doc(db, 'tasks', testId);
  const first = { by: staff, at: new Date().toISOString(), text: 'Trao đổi đầu tiên', files: [] };
  const next = { ...first, text: 'Trao đổi tiếp theo' };
  const denied = promise => assert.rejects(promise, { code: 'permission-denied' });
  await login(staff, 'marchix-mobile-demo-staff');
  await denied(updateDoc(ref, { comments: [{ ...first, by: colleague }] }));
  await denied(updateDoc(ref, { comments: [{ ...first, text: ' \t\n ' }] }));
  await denied(updateDoc(ref, { comments: [{ ...first, text: 'x'.repeat(1001) }] }));
  await denied(updateDoc(ref, { comments: [{ ...first, files: ['private-id'] }] }));
  await denied(updateDoc(ref, { comments: [first], progress: 100 }));
  await updateDoc(ref, { comments: [first] });
  await denied(updateDoc(ref, { comments: [] }));
  await denied(updateDoc(ref, { comments: [next, first] }));
  await denied(updateDoc(ref, { comments: [first, next, next] }));
  await login(colleague, 'marchix-mobile-demo-colleague');
  await denied(updateDoc(ref, { comments: [first, { ...next, by: colleague }] }));
  await login(staff, 'marchix-mobile-demo-staff');
  console.log('PASS Firestore rules: author, ownership, append-only, size, attachments and progress constraints.');

  browser = await chromium.launch();
  const page = await browser.newPage(devices['iPhone 13']);
  const observer = await browser.newPage(devices['iPhone 13']);
  for (const client of [page, observer]) {
    await client.goto('http://127.0.0.1:8087', { waitUntil: 'domcontentloaded', timeout: 90000 });
    await client.getByRole('button', { name: 'Đăng nhập Google (mô phỏng)' }).click({ timeout: 60000 });
    await expect(client.getByRole('heading', { name: 'Việc của tôi' })).toBeVisible({ timeout: 15000 });
    await client.getByLabel('Tìm tên công việc').fill('kiem thu trao doi');
    const taskButton = client.getByRole('button', { name: `Mở công việc: ${title}` });
    await expect(taskButton).toBeVisible();
    await client.getByRole('radio', { name: 'Xong', exact: true }).click();
    await expect(client.getByText('Không tìm thấy công việc phù hợp.')).toBeVisible();
    await client.getByRole('radio', { name: 'Đang làm', exact: true }).click();
    await taskButton.click();
    await expect(client.getByText('Checklist bản web')).toBeVisible();
    await expect(client.getByText('Checklist dữ liệu demo cũ')).toBeVisible();
    await expect(client.getByText('1/2 đã xong')).toBeVisible();
    await expect(client.getByText('Đã xem kết quả.')).toBeVisible();
    await expect(client.getByText(first.text)).toBeVisible();
  }
  await page.getByLabel('Nội dung trao đổi').fill(next.text);
  await page.getByRole('button', { name: 'Gửi trao đổi' }).click();
  await expect(page.getByText(next.text)).toBeVisible({ timeout: 15000 });
  await expect(observer.getByText(next.text)).toBeVisible({ timeout: 15000 });
  const latest = (await getDocFromServer(ref)).data();
  assert.deepEqual(latest.comments.map(item => item.text), [first.text, next.text]);
  assert.equal(latest.progress, 50);
  console.log('PASS mobile web: accent-insensitive search, combined filter, both checklist formats, review and live comment sync.');
} finally {
  await browser?.close();
  await terminate(db);
  const deleted = await api('DELETE', `${docs}/${testId}`);
  assert(deleted.ok, await deleted.text());
}
