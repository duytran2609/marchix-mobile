import assert from 'node:assert/strict';
import { deleteApp, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import {
  collection, connectFirestoreEmulator, doc, getDocFromServer, getDocsFromServer,
  getFirestore, query, setDoc, terminate, updateDoc, where,
} from 'firebase/firestore';

const staff = 'nhanvien@example.test';
const colleague = 'dongnghiep@example.test';
const reviewer = 'nguoigiao@example.test';
const apps = [];

async function connect(email, sub) {
  const app = initializeApp({
    projectId: 'demo-marchix-mobile', apiKey: 'marchix-emulator-key',
  }, sub);
  const auth = getAuth(app);
  const db = getFirestore(app);
  apps.push({ app, db });
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  if (email) {
    await signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({
      sub, email, email_verified: true,
    })));
  }
  return db;
}

function denied(operation) {
  return assert.rejects(operation, { code: 'permission-denied' });
}

try {
  const db = await connect(staff, 'marchix-mobile-demo-staff');
  const otherDb = await connect(colleague, 'marchix-mobile-demo-colleague');
  const reviewerDb = await connect(reviewer, 'marchix-mobile-demo-reviewer');
  const outsiderDb = await connect('outsider@example.test', 'marchix-mobile-outsider');
  const anonymousDb = await connect(null, 'marchix-mobile-anonymous');
  const staffInbox = client => query(collection(client, 'notifications'), where('to', '==', staff));
  const note = doc(db, 'notifications', 'demo-viec-moi');
  const staffNotes = await getDocsFromServer(staffInbox(db));
  assert(staffNotes.docs.some(row => row.id === note.id && row.data().read === false));
  assert(staffNotes.docs.every(row => row.data().to === staff));
  await denied(getDocsFromServer(collection(db, 'notifications')));
  await denied(getDocsFromServer(staffInbox(reviewerDb)));
  await denied(getDocsFromServer(staffInbox(anonymousDb)));
  await denied(getDocsFromServer(query(collection(outsiderDb, 'notifications'), where('to', '==', 'outsider@example.test'))));
  await denied(getDocFromServer(doc(otherDb, 'notifications', note.id)));
  await denied(updateDoc(doc(reviewerDb, 'notifications', note.id), { read: true }));
  await denied(updateDoc(note, { read: true, title: 'Thay đổi nội dung' }));
  await denied(updateDoc(note, { read: 'true' }));
  await denied(setDoc(doc(db, 'notifications', 'client-create'), { to: staff, read: false }));
  await updateDoc(note, { read: true });
  assert.equal((await getDocFromServer(note)).data().read, true);
  await denied(updateDoc(note, { read: false }));
  console.log('PASS: chỉ người nhận được đọc và đánh dấu thông báo đã đọc.');

  const myTask = doc(db, 'tasks', 'kiem-tra-giao-dien');
  const patch = { status: 'Đang làm', progress: 60, updatedBy: staff, updatedAt: new Date().toISOString() };
  const assigned = client => query(collection(client, 'tasks'), where('assigneeEmail', '==', staff));
  const rows = await getDocsFromServer(assigned(db));
  assert.equal(rows.size, 5);
  assert(rows.docs.every(row => row.data().assigneeEmail === staff));
  await denied(getDocsFromServer(collection(db, 'tasks')));
  await denied(getDocsFromServer(assigned(outsiderDb)));
  await denied(getDocsFromServer(assigned(anonymousDb)));
  await denied(getDocFromServer(doc(db, 'tasks', 'viec-nguoi-khac')));
  const sent = (client, email) => query(collection(client, 'tasks'), where('assignedBy', '==', email));
  const sentRows = await getDocsFromServer(sent(reviewerDb, reviewer));
  assert(sentRows.docs.some(row => row.id === myTask.id && row.data().status === 'Đang làm'));
  assert(sentRows.docs.every(row => row.data().assignedBy === reviewer));
  assert((await getDocFromServer(doc(reviewerDb, 'tasks', myTask.id))).exists());
  await denied(getDocsFromServer(sent(otherDb, reviewer)));
  await denied(getDocsFromServer(sent(outsiderDb, 'outsider@example.test')));
  await denied(getDocsFromServer(sent(anonymousDb, reviewer)));
  await denied(updateDoc(doc(reviewerDb, 'tasks', myTask.id), { ...patch, updatedBy: reviewer }));
  await denied(updateDoc(myTask, { ...patch, assignedBy: staff }));
  await denied(updateDoc(doc(db, 'tasks', 'viec-nguoi-khac'), patch));
  await denied(updateDoc(doc(otherDb, 'tasks', myTask.id), { ...patch, updatedBy: colleague }));
  await denied(updateDoc(myTask, { ...patch, assigneeEmail: colleague }));
  await denied(updateDoc(myTask, { ...patch, updatedBy: colleague }));
  await denied(updateDoc(myTask, { ...patch, status: 'Xong' }));
  await denied(updateDoc(myTask, { ...patch, progress: 110 }));
  await denied(updateDoc(myTask, { ...patch, progress: 1.5 }));
  await denied(updateDoc(doc(db, 'tasks', 'da-duyet'), patch));
  await denied(updateDoc(doc(db, 'tasks', 'kiem-tra-checklist'), patch));
  await updateDoc(myTask, patch);
  assert.equal((await getDocFromServer(myTask)).data().progress, 60);

  const first = { by: staff, at: patch.updatedAt, text: 'Đã kiểm tra trên điện thoại.', files: [] };
  const second = { ...first, text: 'Đang kiểm tra lần hai.' };
  await denied(updateDoc(myTask, { comments: [{ ...first, by: colleague }] }));
  await denied(updateDoc(myTask, { comments: [{ ...first, files: ['file-id'] }] }));
  await denied(updateDoc(myTask, { comments: [first], progress: 70 }));
  await updateDoc(myTask, { comments: [first] });
  await denied(updateDoc(myTask, { comments: [second] }));
  await denied(updateDoc(myTask, { comments: [second, first] }));
  await denied(updateDoc(doc(otherDb, 'tasks', myTask.id), { comments: [first, { ...second, by: colleague }] }));
  await updateDoc(myTask, { comments: [first, second] });
  const updated = (await getDocFromServer(myTask)).data();
  assert.deepEqual(updated.comments, [first, second]);
  assert.equal(updated.progress, 60);
  console.log('PASS: quyền đọc và ghi việc, cập nhật tiến độ và chỉ thêm trao đổi của chính mình.');
} finally {
  await Promise.all(apps.map(async ({ app, db }) => {
    await terminate(db);
    await deleteApp(app);
  }));
}
