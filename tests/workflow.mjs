import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
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
const emulatorHost = '127.0.0.1';
const authPort = Number(process.env.EXPO_PUBLIC_AUTH_EMULATOR_PORT || 9099);
const firestorePort = Number(process.env.EXPO_PUBLIC_FIRESTORE_EMULATOR_PORT || 8080);
const functionsPort = Number(process.env.EXPO_PUBLIC_FUNCTIONS_EMULATOR_PORT || 5001);
const requireFunction = createRequire(new URL('../functions/index.js', import.meta.url));
const { initializeApp: initAdmin, deleteApp: deleteAdmin } = requireFunction('firebase-admin/app');
const { getFirestore: getAdminFirestore } = requireFunction('firebase-admin/firestore');
const { createScheduledTasks } = requireFunction('./recurringTasks');
const adminApp = initAdmin({ projectId });
const adminDb = getAdminFirestore(adminApp);
adminDb.settings({ host: `${emulatorHost}:${firestorePort}`, ssl: false });
connectAuthEmulator(auth, `http://${emulatorHost}:${authPort}`, { disableWarnings: true });
connectFirestoreEmulator(db, emulatorHost, firestorePort);
connectFunctionsEmulator(functions, emulatorHost, functionsPort);
const tick = httpsCallable(functions, 'setTaskChecklistItem', { timeout: 35000 });
const report = httpsCallable(functions, 'reportTaskCompletion', { timeout: 35000 });
const review = httpsCallable(functions, 'reviewTaskCompletion', { timeout: 35000 });
const remind = httpsCallable(functions, 'remindMobileTask', { timeout: 35000 });
const listAssignees = httpsCallable(functions, 'listMobileTaskAssignees', { timeout: 35000 });
const editAssignment = httpsCallable(functions, 'updateMobileTask', { timeout: 35000 });
const deleteAssignment = httpsCallable(functions, 'deleteMobileTask', { timeout: 35000 });
const addAttachments = httpsCallable(functions, 'addMobileTaskAttachments', { timeout: 35000 });
const downloadAttachment = httpsCallable(functions, 'downloadMobileTaskAttachment', { timeout: 35000 });
const login = (email, sub) => signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({
  sub, email, email_verified: true,
})));

const taskId = `workflow-qa-${Date.now()}`;
const ref = doc(db, 'tasks', taskId);
const reminderNotes = [];
const occurrenceId = (id, date) => `repeat_${createHash('sha256').update(id).digest('hex')}_${date}`;
const nextId = occurrenceId(taskId, '2026-11-23');
const monthlyId = taskId + '-monthly';
const februaryId = occurrenceId(monthlyId, '2027-02-28');
const marchId = occurrenceId(monthlyId, '2027-03-31');
const designatedId = `${taskId}-designated`;
const manualProgressId = `${taskId}-manual`;
const reportOnlyId = `${taskId}-report-only`;
const roleChangesId = `${taskId}-role-changes`;
const deletionId = `${taskId}-deletion`;
const designatedEmail = `${taskId}@example.test`;
const reviewerProfile = adminDb.doc(`members/${reviewer}`);
const previousReviewerProfile = (await reviewerProfile.get()).data();
const documents = `http://${emulatorHost}:${firestorePort}/v1/projects/${projectId}/databases/(default)/documents`;
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
    approverEmail: { stringValue: reviewer },
    startDate: { stringValue: '2026-11-10' },
    due: { stringValue: '2026-11-16' },
    createdAt: { stringValue: '2026-11-15T18:00:00.000Z' },
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
  await reviewerProfile.update({ grants: [...new Set([...(previousReviewerProfile.grants ?? []), 'taskReview'])] });
  const item = { taskId, index: 1, label: 'Mục bản demo cũ', done: true };
  const result = { taskId, note: 'Đã chạy kiểm thử trên điện thoại.' };
  const reminder = { taskId, assigneeEmail: staff, previousReminder: null };
  const attachment = { name: 'trao-doi.txt', type: 'text/plain', base64: Buffer.from('Tệp trao đổi').toString('base64') };
  const upload = { taskId, attachments: [attachment] };
  const readTask = async () => (await getDocFromServer(ref)).data();
  await assert.rejects(tick(item), { code: 'functions/unauthenticated' });
  await assert.rejects(listAssignees(), { code: 'functions/unauthenticated' });
  await login('dongnghiep@example.test', 'marchix-mobile-demo-colleague');
  await assert.rejects(tick(item), { code: 'functions/permission-denied' });
  await assert.rejects(report(result), { code: 'functions/permission-denied' });
  await assert.rejects(addAttachments(upload), { code: 'functions/permission-denied' });
  await login(staff, 'marchix-mobile-demo-staff');
  await assert.rejects(getDocsFromServer(collection(db, 'members')), { code: 'permission-denied' });
  const { data: directory } = await listAssignees();
  assert(directory.members.some(member => member.email === staff && member.canReview === false));
  assert(directory.members.some(member => member.email === reviewer && member.canReview === true));
  assert(Array.isArray(directory.projects));
  await assert.rejects(remind(reminder), { code: 'functions/permission-denied' });
  await assert.rejects(updateDoc(ref, { checklist: [], progress: 100 }), { code: 'permission-denied' });
  await assert.rejects(updateDoc(ref, { status: 'Chờ duyệt', progress: 100 }), { code: 'permission-denied' });
  await assert.rejects(report(result), { code: 'functions/failed-precondition' });
  await assert.rejects(tick({ ...item, label: 'Mục khác' }), { code: 'functions/failed-precondition' });
  await tick(item);
  let task = await readTask();
  assert.equal(task.progress, 67);
  assert.deepEqual(task.checklist[1], { text: item.label, done: true });
  await tick({ ...item, done: false });
  task = await readTask();
  assert.equal(task.progress, 33);
  await login(reviewer, 'marchix-mobile-demo-reviewer');
  await Promise.all([remind(reminder), remind(reminder)]);
  const reminded = await readTask();
  assert.equal(reminded.remindedBy, reviewer);
  assert(reminded.remindedAt);
  assert.equal(reminded.updatedAt, task.updatedAt);
  await login(staff, 'marchix-mobile-demo-staff');
  const notifications = await getDocsFromServer(query(collection(db, 'notifications'), where('to', '==', staff)));
  const queued = notifications.docs.filter(row => row.get('taskId') === taskId);
  reminderNotes.push(...queued.map(row => `notifications/${row.id}`));
  assert.equal(queued.length, 1);
  assert.equal(queued[0].get('emailed'), false);
  assert.equal(queued[0].get('link'), '#cong-viec');
  assert.equal(queued[0].get('title'), 'Nhắc việc: ' + task.title);
  await login(reviewer, 'marchix-mobile-demo-reviewer');
  const weightedEdit = {
    taskId, title: task.title, assigneeEmails: [staff], due: task.due, startDate: task.startDate,
    revision: task.updatedAt, repeat: task.repeat, status: task.status,
    checklist: [
      { t: 'Mục bản web', weight: 2 }, { t: item.label, weight: 1 }, { t: 'Mục cuối', weight: 1 },
    ],
  };
  await assert.rejects(editAssignment({
    ...weightedEdit, checklist: [{ t: 'Mục bản web', weight: 0 }],
  }), { code: 'functions/invalid-argument' });
  await editAssignment({ ...weightedEdit, requireReview: true });
  task = await readTask();
  assert.equal(task.requireReview, true);
  assert.equal(task.progress, 50);
  assert.deepEqual(task.checklist[0], { t: 'Mục bản web', done: true, weight: 2 });
  await editAssignment({
    ...weightedEdit, revision: task.updatedAt,
    checklist: [
      { t: 'Mục bản web đã đổi tên', weight: 2, sourceIndex: 0 },
      { t: item.label, weight: 1, sourceIndex: 1 },
      { t: 'Mục cuối', weight: 1, sourceIndex: null },
    ],
  });
  task = await readTask();
  assert.equal(task.progress, 50);
  assert.deepEqual(task.checklist[0], { t: 'Mục bản web đã đổi tên', done: true, weight: 2 });
  await login(staff, 'marchix-mobile-demo-staff');
  await tick(item);
  assert.equal((await readTask()).progress, 75);
  await tick({ ...item, done: false });
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
  await reviewerProfile.update({ grants: previousReviewerProfile.grants ?? [] });
  await assert.rejects(review(approve), { code: 'functions/permission-denied' });
  await reviewerProfile.update({ grants: [...new Set([...(previousReviewerProfile.grants ?? []), 'taskReview'])] });
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
  const priorComments = task.comments;
  await addAttachments(upload);
  await addAttachments(upload);
  const withFiles = (await readTask()).comments;
  assert.deepEqual(withFiles.slice(0, -2), priorComments);
  const [firstFilePost, secondFilePost] = withFiles.slice(-2);
  for (const post of [firstFilePost, secondFilePost]) {
    assert.equal(post.by, staff);
    assert.equal(post.text, '');
    assert.equal(post.files.length, 1);
    assert.equal(post.files[0].name, attachment.name);
  }
  assert.notEqual(firstFilePost.files[0].id, secondFilePost.files[0].id);
  const downloaded = await downloadAttachment({ taskId, fileId: firstFilePost.files[0].id });
  assert.equal(downloaded.data.base64, attachment.base64);
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
  await assert.rejects(addAttachments(upload), { code: 'functions/failed-precondition' });
  await assert.rejects(updateDoc(ref, { comments: [...(approved.comments ?? []), {
    by: staff, at: new Date().toISOString(), text: 'Trao đổi sau khi xong', files: [],
  }] }), { code: 'permission-denied' });
  await login(reviewer, 'marchix-mobile-demo-reviewer');
  await assert.rejects(editAssignment({
    taskId, title: 'Đổi tên sau khi xong', assigneeEmails: [staff], due: approved.due, revision: approved.updatedAt,
  }), { code: 'functions/failed-precondition', message: /đã xong/ });
  await login(staff, 'marchix-mobile-demo-staff');
  assert.deepEqual(await readTask(), approved);
  assert(!(await adminDb.doc(`tasks/${nextId}`).get()).exists);
  await adminDb.doc(`tasks/${taskId}`).update({ status: 'Chờ duyệt' });
  await createScheduledTasks(adminDb, new Date('2026-11-22T16:59:00Z'));
  assert(!(await adminDb.doc(`tasks/${nextId}`).get()).exists);
  const scheduledDay = new Date('2026-11-22T17:05:00Z');
  await Promise.all([createScheduledTasks(adminDb, scheduledDay), createScheduledTasks(adminDb, scheduledDay)]);
  const next = (await getDocFromServer(doc(db, 'tasks', nextId))).data();
  assert.equal((await readTask()).status, 'Chờ duyệt');
  assert.equal((await adminDb.collection('tasks').where('seriesId', '==', taskId).get()).size, 1);
  assert.equal(next.status, 'Chưa làm');
  assert.equal(next.startDate, '2026-11-17');
  assert.equal(next.due, '2026-11-23');
  assert.equal(next.progress, 0);
  assert.equal(next.assigneeEmail, staff);
  assert.equal(next.requireReview, true);
  assert(next.checklist.every(item => item.done === false));
  assert.deepEqual(next.checklist.map(item => item.weight), [2, 1, 1]);

  await adminDb.doc(`tasks/${taskId}`).update({ repeat: 'Không lặp' });
  await adminDb.doc(`tasks/${monthlyId}`).set({
    title: 'Việc lặp cuối tháng', assignedBy: reviewer, assigneeEmail: staff,
    createdAt: '2027-01-31T02:00:00.000Z', startDate: '2027-01-31', due: '2027-01-31',
    status: 'Đang làm', repeat: 'Hằng tháng', repeatSchedule: { cadence: 'Hằng tháng', period: 0, checkLegacy: false },
  });
  await createScheduledTasks(adminDb, new Date('2027-02-28T02:00:00Z'));
  assert.equal((await adminDb.doc(`tasks/${februaryId}`).get()).get('due'), '2027-02-28');
  await createScheduledTasks(adminDb, new Date('2027-03-30T02:00:00Z'));
  assert(!(await adminDb.doc(`tasks/${marchId}`).get()).exists);
  await createScheduledTasks(adminDb, new Date('2027-03-31T02:00:00Z'));
  assert.equal((await adminDb.doc(`tasks/${marchId}`).get()).get('due'), '2027-03-31');
  assert.equal((await adminDb.doc(`tasks/${monthlyId}`).get()).get('status'), 'Đang làm');
  await adminDb.doc(`tasks/${marchId}`).update({ repeat: 'Không lặp' });
  await createScheduledTasks(adminDb, new Date('2027-04-30T02:00:00Z'));
  assert.equal((await adminDb.collection('tasks').where('seriesId', '==', monthlyId).get()).size, 2);

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

  await setFixture(`tasks/${manualProgressId}`, {
    title: { stringValue: 'Công việc không có việc con' },
    assigneeEmail: { stringValue: staff },
    assignedBy: { stringValue: reviewer },
    status: { stringValue: 'Đang làm' },
    progress: { integerValue: '99' },
  });
  const manualRef = doc(db, 'tasks', manualProgressId);
  const manualReport = { ...result, taskId: manualProgressId };
  await assert.rejects(report(manualReport), { code: 'functions/failed-precondition', message: /100%/ });
  assert.equal((await getDocFromServer(manualRef)).data().status, 'Đang làm');
  await updateDoc(manualRef, { progress: 100, updatedBy: staff, updatedAt: new Date().toISOString() });
  await report(manualReport);
  assert.equal((await getDocFromServer(manualRef)).data().status, 'Chờ duyệt');

  const reportOnlyRef = adminDb.doc(`tasks/${reportOnlyId}`);
  await reportOnlyRef.set({
    title: 'Công việc chỉ báo cáo kết quả', assignedBy: reviewer, assigneeEmail: staff,
    status: 'Đang làm', progress: 100, requireReview: false,
  });
  await report({ taskId: reportOnlyId, note: result.note });
  const reportOnly = (await reportOnlyRef.get()).data();
  assert.equal(reportOnly.status, 'Xong');
  assert.equal(reportOnly.comments[0].text, result.note);
  assert.equal(reportOnly.reviewedAt, undefined);

  const admin = 'quantri@example.test';
  const colleague = 'dongnghiep@example.test';
  const rolesRef = adminDb.doc(`tasks/${roleChangesId}`);
  const originalTitle = 'Công việc trước khi đổi vai trò';
  const updatedTitle = 'Công việc sau khi đổi vai trò';
  await rolesRef.set({
    title: originalTitle, assignedBy: reviewer, assigneeEmail: staff, approverEmail: reviewer,
    watchers: [staff, colleague], status: 'Đang làm', updatedAt: '2026-11-01T00:00:00.000Z',
  });
  const roleEdit = {
    taskId: roleChangesId, title: updatedTitle, assigneeEmails: [colleague], approverEmail: admin,
    watchers: [reviewer, colleague], status: 'Đang làm', due: '', revision: '2026-11-01T00:00:00.000Z',
  };
  await login(reviewer, 'marchix-mobile-demo-reviewer');
  await editAssignment(roleEdit);
  await assert.rejects(editAssignment(roleEdit), { code: 'functions/failed-precondition' });
  const newRevision = (await rolesRef.get()).get('updatedAt');
  await editAssignment({ ...roleEdit, watchers: [...roleEdit.watchers].reverse(), revision: newRevision });
  const notes = await adminDb.collection('notifications').where('taskId', '==', roleChangesId).get();
  reminderNotes.push(...notes.docs.map(row => row.ref.path));
  assert(notes.docs.every(row => row.get('from') === reviewer && row.get('read') === false &&
    row.get('link') === '#cong-viec' && row.get('createdAt') === newRevision));
  assert.deepEqual(notes.docs.map(row => [row.get('to'), row.get('title'), row.get('body')]).sort(), [
    [colleague, 'Bạn được giao việc mới', updatedTitle],
    [staff, 'Bạn không còn phụ trách thực hiện công việc', originalTitle],
    [reviewer, 'Bạn được thêm làm người theo dõi công việc', updatedTitle],
    [staff, 'Bạn không còn theo dõi công việc', originalTitle],
    [admin, 'Bạn được chỉ định duyệt công việc', updatedTitle],
    [reviewer, 'Bạn không còn là người duyệt công việc', originalTitle],
  ].sort());
  console.log('PASS: đổi người thực hiện, người theo dõi và người duyệt gửi đúng thông báo cho các bên.');

  const deletionRef = adminDb.doc(`tasks/${deletionId}`);
  const deletionTitle = `Công việc cần xóa ${deletionId}`;
  const deletion = { taskId: deletionId };
  const deletionNotices = () => adminDb.collection('notifications').where('body', '==', deletionTitle).get();
  await deletionRef.set({
    title: deletionTitle, assignedBy: reviewer, assigneeEmail: staff, approverEmail: admin,
    watchers: [staff, colleague, reviewer], status: 'Đang làm',
  });
  await login(staff, 'marchix-mobile-demo-staff');
  await assert.rejects(deleteAssignment(deletion), { code: 'functions/permission-denied' });
  await login(admin, 'marchix-mobile-demo-admin');
  await assert.rejects(deleteAssignment(deletion), { code: 'functions/permission-denied' });
  assert((await deletionRef.get()).exists);
  assert((await deletionNotices()).empty);

  await login(reviewer, 'marchix-mobile-demo-reviewer');
  await Promise.all([deleteAssignment(deletion), deleteAssignment(deletion)]);
  assert.equal((await deletionRef.get()).exists, false);
  const deletedNotes = await deletionNotices();
  reminderNotes.push(...deletedNotes.docs.map(row => row.ref.path));
  assert.deepEqual(deletedNotes.docs.map(row => row.get('to')).sort(), [admin, colleague, staff].sort());
  assert(deletedNotes.docs.every(row => row.get('title') === 'Công việc đã được xóa' &&
    row.get('from') === reviewer && row.get('read') === false && row.get('link') === '#cong-viec' &&
    row.get('taskId') === undefined));
  console.log('PASS: chỉ người giao được xóa và mỗi người liên quan nhận đúng một thông báo.');
  console.log('PASS: gửi duyệt, trao đổi có tệp, kỳ lặp, phân quyền và yêu cầu lưu tiến độ 100%.');
} finally {
  await reviewerProfile.set(previousReviewerProfile);
  await terminate(db);
  await deleteApp(app);
  await deleteAdmin(adminApp);
  const taskPaths = [taskId, nextId, monthlyId, februaryId, marchId, designatedId, manualProgressId, reportOnlyId, roleChangesId, deletionId]
    .map(id => `tasks/${id}`);
  for (const path of [...reminderNotes, ...taskPaths, `members/${designatedEmail}`]) {
    const deleted = await fetch(`${documents}/${path}`, { method: 'DELETE', headers });
    assert(deleted.ok, await deleted.text());
  }
}
