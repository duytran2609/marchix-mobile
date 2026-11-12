import assert from 'node:assert/strict';
import { deleteApp, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import {
  collection, connectFirestoreEmulator, doc, getDocFromServer, getDocsFromServer, getFirestore,
  query, terminate, updateDoc, where,
} from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

const staff = 'nhanvien@example.test';
const reviewer = 'nguoigiao@example.test';
const projectId = 'demo-marchix-mobile';
const app = initializeApp({ projectId, apiKey: 'marchix-emulator-key' });
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
connectFirestoreEmulator(db, '127.0.0.1', 8080);
connectFunctionsEmulator(functions, '127.0.0.1', 5001);
const tick = httpsCallable(functions, 'setTaskChecklistItem', { timeout: 35000 });
const report = httpsCallable(functions, 'reportTaskCompletion', { timeout: 35000 });
const review = httpsCallable(functions, 'reviewTaskCompletion', { timeout: 35000 });
const editAssignment = httpsCallable(functions, 'updateMobileTask', { timeout: 35000 });
const login = (email, sub) => signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({
  sub, email, email_verified: true,
})));

const taskId = `workflow-qa-${Date.now()}`;
const ref = doc(db, 'tasks', taskId);
const nextId = `repeat_${taskId}_2026-11-23`;
const designatedId = `${taskId}-designated`;
const designatedEmail = `${taskId}@example.test`;
const documents = `http://127.0.0.1:8080/v1/projects/${projectId}/databases/(default)/documents`;
const docs = `${documents}/tasks`;
const headers = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
async function setFixture(path, fields) {
  const saved = await fetch(`${documents}/${path}`, { method: 'PATCH', headers, body: JSON.stringify({ fields }) });
  assert(saved.ok, await saved.text());
}
const checklist = [{ t: 'Mục bản web', done: true }, { text: 'Mục bản demo cũ', done: false }, { t: 'Mục cuối', done: false }];
const response = await fetch(`${docs}?documentId=${taskId}`, {
  method: 'POST', headers, body: JSON.stringify({ fields: {
    title: { stringValue: 'Kiểm thử checklist và gửi duyệt' },
    assigneeEmail: { stringValue: staff },
    assignedBy: { stringValue: reviewer },
    startDate: { stringValue: '2026-11-10' },
    due: { stringValue: '2026-11-16' },
    repeat: { stringValue: 'Hằng tuần' },
    status: { stringValue: 'Đang làm' },
    progress: { integerValue: '33' },
    checklist: { arrayValue: { values: checklist.map(({ done, ...labels }) => ({
      mapValue: { fields: {
        ...Object.fromEntries(Object.entries(labels).map(([key, label]) => [key, { stringValue: label }])),
        done: { booleanValue: done },
      } },
    })) } },
  } }),
});
assert(response.ok, await response.text());

try {
  const item = { taskId, index: 1, label: 'Mục bản demo cũ', done: true };
  const result = { taskId, note: 'Đã chạy kiểm thử trên điện thoại.' };
  const readTask = async () => (await getDocFromServer(ref)).data();
  await assert.rejects(tick(item), { code: 'functions/unauthenticated' });
  await login('dongnghiep@example.test', 'marchix-mobile-demo-colleague');
  await assert.rejects(tick(item), { code: 'functions/permission-denied' });
  await assert.rejects(report(result), { code: 'functions/permission-denied' });
  await login(staff, 'marchix-mobile-demo-staff');
  await assert.rejects(updateDoc(ref, { checklist: [], progress: 100 }), { code: 'permission-denied' });
  await assert.rejects(updateDoc(ref, { status: 'Chờ duyệt', progress: 100 }), { code: 'permission-denied' });
  await assert.rejects(report(result), { code: 'functions/failed-precondition' });
  await assert.rejects(tick({ ...item, label: 'Mục khác' }), { code: 'functions/failed-precondition' });
  await tick(item);
  let task = await readTask();
  assert.equal(task.progress, 67);
  assert.deepEqual(task.checklist[1], { text: item.label, done: true });
  await tick({ ...item, done: false });
  assert.equal((await readTask()).progress, 33);
  await Promise.all([tick(item), tick({ taskId, index: 2, label: 'Mục cuối', done: true })]);
  assert.equal((await readTask()).progress, 100);

  await report(result);
  task = await readTask();
  assert.equal(task.status, 'Chờ duyệt');
  assert.equal(task.progress, 100);
  assert.equal(task.doneAt, task.updatedAt);
  assert.equal(task.updatedBy, staff);
  assert.deepEqual(task.comments, [{ by: staff, at: task.doneAt, text: result.note, files: [] }]);
  await report(result);
  assert.equal((await readTask()).comments.length, 1);
  await assert.rejects(tick({ ...item, done: false }), { code: 'functions/failed-precondition' });

  const firstSubmission = task.doneAt;
  const approve = { taskId, submission: firstSubmission, decision: 'approve', rating: 'Tốt', note: 'Đã kiểm tra.' };
  const rework = { ...approve, decision: 'rework', note: 'Kiểm tra lại nội dung mục cuối.' };
  await assert.rejects(review(approve), { code: 'functions/permission-denied' });
  await login('dongnghiep@example.test', 'marchix-mobile-demo-colleague');
  await assert.rejects(review(approve), { code: 'functions/permission-denied' });
  await assert.rejects(getDocFromServer(ref), { code: 'permission-denied' });
  await login(reviewer, 'marchix-mobile-demo-reviewer');
  const pending = query(collection(db, 'tasks'), where('assignedBy', '==', reviewer), where('status', '==', 'Chờ duyệt'));
  const pendingIds = async () => (await getDocsFromServer(pending)).docs.map(row => row.id);
  assert((await pendingIds()).includes(taskId));
  await assert.rejects(updateDoc(ref, { status: 'Xong' }), { code: 'permission-denied' });
  await assert.rejects(review({ ...approve, rating: '' }), { code: 'functions/invalid-argument' });
  await assert.rejects(review({ ...rework, note: ' ' }), { code: 'functions/invalid-argument' });
  await review(rework);
  assert(!(await pendingIds()).includes(taskId));
  assert.equal((await getDocFromServer(ref)).data().status, 'Đang làm');

  await login(staff, 'marchix-mobile-demo-staff');
  task = await readTask();
  assert.equal(task.status, 'Đang làm');
  assert.equal(task.doneAt, '');
  assert.equal(task.reviewNote, rework.note);
  await report({ ...result, note: 'Đã cập nhật kết quả.' });
  task = await readTask();
  assert.notEqual(task.doneAt, firstSubmission);
  await login(reviewer, 'marchix-mobile-demo-reviewer');
  await assert.rejects(review(approve), { code: 'functions/failed-precondition' });
  const decision = { ...approve, submission: task.doneAt };
  const attempts = await Promise.allSettled([review(decision), review(decision)]);
  assert.equal(attempts.filter(attempt => attempt.status === 'fulfilled').length, 1);
  assert(!(await pendingIds()).includes(taskId));

  await login(staff, 'marchix-mobile-demo-staff');
  const approved = await readTask();
  assert.equal(approved.status, 'Xong');
  assert.equal(approved.progress, 100);
  assert.equal(approved.doneAt, decision.submission);
  assert.equal(approved.reviewedBy, reviewer);
  assert.equal(approved.reviewedAt, approved.updatedAt);
  assert.equal(approved.rating, approve.rating);
  assert.equal(approved.reviewNote, approve.note);
  await assert.rejects(updateDoc(ref, { comments: [...(approved.comments ?? []), {
    by: staff, at: new Date().toISOString(), text: 'Trao đổi sau khi xong', files: [],
  }] }), { code: 'permission-denied' });
  await login(reviewer, 'marchix-mobile-demo-reviewer');
  await assert.rejects(editAssignment({
    taskId, title: 'Đổi tên sau khi xong', assigneeEmails: [staff], due: approved.due, revision: approved.updatedAt,
  }), { code: 'functions/failed-precondition', message: /đã xong/ });
  await login(staff, 'marchix-mobile-demo-staff');
  assert.deepEqual(await readTask(), approved);
  const next = (await getDocFromServer(doc(db, 'tasks', nextId))).data();
  assert.equal(approved.spawned, true);
  assert.equal(next.status, 'Chưa làm');
  assert.equal(next.startDate, '2026-11-17');
  assert.equal(next.due, '2026-11-23');
  assert.equal(next.progress, 0);
  assert.equal(next.assigneeEmail, staff);
  assert(next.checklist.every(item => item.done === false));

  const designatedProfile = { enabled: { booleanValue: true } };
  const grant = { arrayValue: { values: [{ stringValue: 'taskReview' }] } };
  await setFixture(`members/${designatedEmail}`, designatedProfile);
  await setFixture(`tasks/${designatedId}`, {
    title: { stringValue: 'Việc có người duyệt chỉ định' },
    assigneeEmail: { stringValue: staff },
    assignedBy: { stringValue: reviewer },
    approverEmail: { stringValue: designatedEmail },
    status: { stringValue: 'Chờ duyệt' },
    doneAt: { stringValue: firstSubmission },
  });
  const designatedRef = doc(db, 'tasks', designatedId);
  const designatedQueue = query(collection(db, 'tasks'),
    where('approverEmail', '==', designatedEmail), where('status', '==', 'Chờ duyệt'));
  const designatedDecision = { ...approve, taskId: designatedId };

  await login(reviewer, 'marchix-mobile-demo-reviewer');
  await assert.rejects(review(designatedDecision), { code: 'functions/permission-denied' });
  await login(designatedEmail, taskId);
  await assert.rejects(getDocsFromServer(designatedQueue), { code: 'permission-denied' });
  await assert.rejects(review(designatedDecision), { code: 'functions/permission-denied' });
  await setFixture(`members/${designatedEmail}`, { ...designatedProfile, grants: grant });
  assert((await getDocsFromServer(designatedQueue)).docs.some(row => row.id === designatedId));
  await assert.rejects(getDocsFromServer(query(collection(db, 'tasks'),
    where('approverEmail', '==', designatedEmail))), { code: 'permission-denied' });
  await assert.rejects(updateDoc(designatedRef, { status: 'Xong' }), { code: 'permission-denied' });
  await setFixture(`members/${designatedEmail}`, { enabled: { booleanValue: false }, grants: grant });
  await assert.rejects(getDocsFromServer(designatedQueue), { code: 'permission-denied' });
  await assert.rejects(review(designatedDecision), { code: 'functions/permission-denied' });
  await setFixture(`members/${designatedEmail}`, { ...designatedProfile, grants: grant });
  await review(designatedDecision);
  assert((await getDocsFromServer(designatedQueue)).empty);
  await assert.rejects(getDocFromServer(designatedRef), { code: 'permission-denied' });
  await login(staff, 'marchix-mobile-demo-staff');
  assert.equal((await getDocFromServer(designatedRef)).data().reviewedBy, designatedEmail);
  console.log('PASS: gửi duyệt, trả lại, duyệt đúng lượt, kỳ lặp và phân quyền người duyệt chỉ định.');
} finally {
  await terminate(db);
  await deleteApp(app);
  for (const path of [`tasks/${taskId}`, `tasks/${nextId}`, `tasks/${designatedId}`, `members/${designatedEmail}`]) {
    const deleted = await fetch(`${documents}/${path}`, { method: 'DELETE', headers });
    assert(deleted.ok, await deleted.text());
  }
}
