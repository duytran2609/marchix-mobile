import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import {
  Bytes, collection, connectFirestoreEmulator, doc, getDocFromServer, getDocsFromServer,
  deleteDoc, deleteField, getFirestore, or, query, serverTimestamp, setDoc, terminate, updateDoc, where, writeBatch,
} from 'firebase/firestore';

const staff = 'nhanvien@example.test';
const colleague = 'dongnghiep@example.test';
const reviewer = 'nguoigiao@example.test';
const emulatorHost = process.env.EXPO_PUBLIC_EMULATOR_HOST || '127.0.0.1';
const apps = [];

async function connect(email, sub) {
  const app = initializeApp({
    projectId: 'demo-marchix-mobile', apiKey: 'marchix-emulator-key',
  }, sub);
  const auth = getAuth(app);
  const db = getFirestore(app);
  apps.push({ app, db });
  connectAuthEmulator(auth, `http://${emulatorHost}:${process.env.EXPO_PUBLIC_AUTH_EMULATOR_PORT || 9099}`, { disableWarnings: true });
  connectFirestoreEmulator(db, emulatorHost, Number(process.env.EXPO_PUBLIC_FIRESTORE_EMULATOR_PORT || 8080));
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
  const adminDb = await connect('quantri@example.test', 'marchix-mobile-demo-admin');
  const correspondence = collection(db, 'correspondence');
  const visibleRecords = await getDocsFromServer(query(correspondence,
    or(where('assigneeEmail', '==', staff), where('watchers', 'array-contains', staff))));
  assert(visibleRecords.docs.some(item => item.id === 'in-2025-1'));
  assert(visibleRecords.docs.some(item => item.id === 'recordDemoDecision01'));
  await denied(getDocFromServer(doc(db, 'correspondence', 'in-2025-2')));
  await denied(getDocsFromServer(correspondence));
  await denied(updateDoc(doc(db, 'correspondence', 'in-2025-1'), { status: 'processing' }));
  await denied(updateDoc(doc(adminDb, 'correspondence', 'recordDemoDecision01'), {
    status: 'issued', updatedAt: serverTimestamp(),
  }));
  await denied(setDoc(doc(adminDb, 'recordCounters', 'letter-2025'), {
    last: 1, recordId: 'recordDemoDecision01', updatedAt: serverTimestamp(),
  }));
  const personalPayroll = query(collection(db, 'payroll'), where('email', '==', staff), where('status', 'in', ['Đã chốt', 'Đã trả']));
  const ownPayslips = await getDocsFromServer(personalPayroll);
  assert(ownPayslips.docs.some(item => item.id === '2026-10_nhanvien-luong-demo'));
  assert(ownPayslips.docs.every(item => item.data().email === staff && item.data().status !== 'Nháp'));
  await denied(getDocsFromServer(query(collection(db, 'payroll'), where('email', '==', staff))));
  await denied(getDocFromServer(doc(db, 'payroll', '2026-09_nhanvien-luong-demo')));
  await denied(getDocFromServer(doc(db, 'payroll', '2026-08_dongnghiep-luong-demo')));
  await denied(getDocFromServer(doc(db, 'employees', 'nhanvien-luong-demo')));
  await denied(updateDoc(doc(db, 'payroll', '2026-10_nhanvien-luong-demo'), { net: 1 }));
  const confirmedAt = new Date().toISOString();
  const colleagueSlip = client => doc(client, 'payroll', '2026-08_dongnghiep-luong-demo');
  await denied(updateDoc(colleagueSlip(db), { employeeConfirmedAt: confirmedAt }));
  await denied(updateDoc(colleagueSlip(adminDb), { employeeConfirmedAt: confirmedAt }));
  await denied(updateDoc(doc(db, 'payroll', '2026-09_nhanvien-luong-demo'), { employeeConfirmedAt: confirmedAt }));
  await denied(updateDoc(colleagueSlip(otherDb), { employeeConfirmedAt: confirmedAt, net: 1 }));
  await updateDoc(colleagueSlip(otherDb), { employeeConfirmedAt: confirmedAt });
  assert.equal((await getDocFromServer(colleagueSlip(adminDb))).data().employeeConfirmedAt, confirmedAt);
  assert((await getDocFromServer(doc(adminDb, 'payroll', '2026-09_nhanvien-luong-demo'))).exists());
  assert((await getDocsFromServer(collection(adminDb, 'employees'))).docs.some(item => item.id === 'nhanvien-luong-demo'));
  const cashAdmin = 'quantri@example.test';
  const cashId = 'cash-rules-' + Date.now();
  const cashDoc = client => doc(client, 'cash', cashId);
  const cashNow = new Date().toISOString();
  const draft = { type: 'chi', date: '2026-11-11', dueDate: '', amount: 2500000, category: 'Chi khác',
    method: 'Chuyển khoản', projectId: '', note: 'Phí dịch vụ', partyType: 'Nhà cung cấp', partyName: 'Demo',
    invoiceRef: '', approverEmail: '', ref: '', status: 'Chờ duyệt',
    createdBy: staff, updatedBy: staff, createdAt: cashNow, updatedAt: cashNow };
  const ledger = client => collection(client, 'cash');
  const scopedCash = (client, email) => query(ledger(client), or(where('createdBy', '==', email), where('approverEmail', '==', email)));
  await denied(getDocsFromServer(ledger(anonymousDb)));
  await denied(setDoc(cashDoc(db), { ...draft, createdBy: cashAdmin }));
  await denied(setDoc(cashDoc(db), { ...draft, approverEmail: cashAdmin }));
  await denied(setDoc(cashDoc(db), { ...draft, method: 'Tiền mặt' }));
  await denied(setDoc(cashDoc(db), { ...draft, amount: -1 }));
  await denied(setDoc(cashDoc(db), { ...draft, status: 'Đã chi' }));
  await setDoc(cashDoc(db), draft);
  assert((await getDocsFromServer(scopedCash(db, staff))).docs.some(row => row.id === cashId));
  assert(!(await getDocsFromServer(scopedCash(otherDb, colleague))).docs.some(row => row.id === cashId));
  await denied(getDocsFromServer(ledger(db)));
  await denied(getDocFromServer(cashDoc(otherDb)));
  await denied(deleteDoc(cashDoc(db)));
  await denied(updateDoc(cashDoc(db), { createdAt: '2026-01-01T00:00:00.000Z' }));
  await denied(updateDoc(cashDoc(db), { note: deleteField() }));
  await denied(updateDoc(cashDoc(db), { note: 'x'.repeat(1001) }));
  await denied(updateDoc(cashDoc(db), { extra: true }));
  await updateDoc(cashDoc(db), { note: 'Phí dịch vụ tháng 11' });
  const proof = { id: cashId + '-proof', name: 'hoa-don.txt', type: 'text/plain', size: 3 };
  const fileRef = client => doc(client, 'files', proof.id);
  const chunkRef = client => doc(fileRef(client), 'chunks', '0');
  const proofData = Buffer.from('abc');
  const meta = { name: proof.name, type: proof.type, size: proof.size, chunks: 1, scopeId: cashId,
    scopeType: 'cash', parent: 'cash/' + cashId, by: staff, at: cashNow,
    sha256: createHash('sha256').update(proofData).digest('hex') };
  const chunk = { i: 0, data: Bytes.fromUint8Array(proofData) };
  await denied(setDoc(fileRef(db), meta));
  await denied(updateDoc(cashDoc(db), { files: [proof] }));
  const proofBatch = writeBatch(db);
  proofBatch.update(cashDoc(db), { files: [proof] });
  proofBatch.set(fileRef(db), meta);
  proofBatch.set(chunkRef(db), chunk);
  await proofBatch.commit();
  assert((await getDocFromServer(fileRef(db))).exists());
  assert((await getDocFromServer(chunkRef(db))).get('data').isEqual(chunk.data));
  await denied(getDocFromServer(fileRef(otherDb)));
  await denied(getDocFromServer(chunkRef(otherDb)));
  await denied(getDocsFromServer(collection(fileRef(anonymousDb), 'chunks')));
  await denied(getDocsFromServer(collection(adminDb, 'files')));
  await denied(updateDoc(cashDoc(db), { files: [] }));
  await denied(updateDoc(chunkRef(db), { i: 1 }));
  const cashAudit = { updatedBy: cashAdmin, updatedAt: cashNow };
  await denied(updateDoc(cashDoc(adminDb), { ...cashAudit, approverEmail: staff }));
  const reviewerProfile = doc(adminDb, 'members', reviewer);
  const colleagueProfile = doc(adminDb, 'members', colleague);
  const reviewerGrants = (await getDocFromServer(reviewerProfile)).data().grants || [];
  const colleagueGrants = (await getDocFromServer(colleagueProfile)).data().grants || [];
  const withGrant = (grants, ...extra) => [...new Set([...grants, ...extra])];
  await updateDoc(reviewerProfile, { enabled: true, grants: withGrant(reviewerGrants, 'cashReview') });
  await updateDoc(colleagueProfile, { enabled: true, grants: withGrant(colleagueGrants, 'cashRecord') });
  try {
    await updateDoc(cashDoc(adminDb), { ...cashAudit, approverEmail: reviewer });
    assert((await getDocsFromServer(collection(fileRef(reviewerDb), 'chunks'))).size === 1);
    assert((await getDocFromServer(fileRef(otherDb))).exists());
    assert((await getDocFromServer(fileRef(adminDb))).exists());
    await denied(updateDoc(cashDoc(reviewerDb), { updatedBy: reviewer, updatedAt: cashNow, files: [] }));
    assert((await getDocsFromServer(scopedCash(reviewerDb, reviewer))).docs.some(row => row.id === cashId));
    const decision = { updatedBy: reviewer, updatedAt: cashNow, approvedBy: reviewer, approvedAt: cashNow, approvalNote: '' };
    await denied(updateDoc(cashDoc(adminDb), { ...decision, updatedBy: cashAdmin, approvedBy: cashAdmin, status: 'Chờ chi' }));
    await denied(updateDoc(cashDoc(reviewerDb), { ...decision, status: 'Từ chối' }));
    await updateDoc(cashDoc(reviewerDb), { ...decision, status: 'Chờ chi' });
    await updateDoc(reviewerProfile, { grants: withGrant(reviewerGrants, 'cashReview', 'cashRecord') });
    const payment = { status: 'Đã chi', paidAt: cashNow, updatedAt: cashNow };
    await denied(updateDoc(cashDoc(reviewerDb), { ...payment, updatedBy: reviewer, paidBy: reviewer, ref: 'BANK-01' }));
    await denied(updateDoc(cashDoc(otherDb), { ...payment, updatedBy: colleague, paidBy: colleague, ref: '  ' }));
    await updateDoc(cashDoc(otherDb), { ...payment, updatedBy: colleague, paidBy: colleague, ref: 'BANK-01' });
    assert.equal((await getDocFromServer(cashDoc(db))).data().status, 'Đã chi');
    await denied(updateDoc(cashDoc(db), { amount: 1 }));
  } finally {
    await updateDoc(reviewerProfile, { grants: reviewerGrants });
    await updateDoc(colleagueProfile, { grants: colleagueGrants });
  }
  console.log('PASS: Thu chi chỉ đọc đúng phạm vi, không bỏ bước duyệt và xác nhận có tham chiếu.');
  const date = '2026-11-11';
  const attendance = client => doc(client, 'attendance', staff + '_' + date);
  const punch = { email: staff, name: 'Nhân viên demo', date, inTs: serverTimestamp(), inDist: null };
  await getDocFromServer(doc(db, 'settings', 'work'));
  await getDocsFromServer(query(collection(db, 'requests'), where('createdBy', '==', staff)));
  await denied(getDocsFromServer(collection(db, 'requests')));
  const requestId = 'rules-salary-advance-' + Date.now();
  const requestRef = client => doc(client, 'requests', requestId);
  const requestTime = new Date().toISOString();
  const requestData = {
    type: 'Tạm ứng lương', from: date, to: date, days: 0.5, amount: 750000, month: '2026-11',
    reason: 'Tạm ứng thử', status: 'Chờ duyệt', approverEmail: reviewer, createdBy: staff,
    updatedBy: staff, createdAt: requestTime, updatedAt: requestTime,
  };
  await denied(setDoc(requestRef(db), { ...requestData, createdBy: colleague }));
  await denied(setDoc(requestRef(db), { ...requestData, approverEmail: staff }));
  await denied(setDoc(requestRef(outsiderDb), requestData));
  const tripRef = doc(db, 'requests', requestId + '-trip');
  const trip = { ...requestData, type: 'Công tác', amount: 0, days: 1,
    trip: { destination: 'Hà Nội', host: 'Đối tác', estimatedCost: 1000000 } };
  await setDoc(tripRef, trip);
  await denied(updateDoc(tripRef, { 'trip.estimatedCost': -1 }));
  await deleteDoc(tripRef);
  const overtimeRef = doc(db, 'requests', requestId + '-overtime');
  const overtime = { ...requestData, type: 'Làm thêm giờ', amount: 0, days: 0,
    overtime: { hours: 2.5, taskId: 'kiem-tra-giao-dien', taskTitle: 'Kiểm tra giao diện' } };
  await setDoc(overtimeRef, overtime);
  await denied(updateDoc(overtimeRef, { 'overtime.hours': 25 }));
  const tasks = [{ id: 'kiem-tra-giao-dien', title: 'Kiểm tra giao diện' },
    { id: 'cap-nhat-huong-dan', title: 'Cập nhật hướng dẫn' }];
  await updateDoc(overtimeRef, { overtime: { hours: 2.5, tasks } });
  assert.deepEqual((await getDocFromServer(overtimeRef)).get('overtime.tasks'), tasks);
  await denied(updateDoc(overtimeRef, { overtime: { hours: 2.5, tasks: [tasks[0], { id: 5, title: 'Sai kiểu' }] } }));
  await deleteDoc(overtimeRef);
  await setDoc(requestRef(db), requestData);
  await denied(getDocFromServer(requestRef(otherDb)));
  await denied(getDocFromServer(requestRef(anonymousDb)));
  const assignedRequests = query(collection(reviewerDb, 'requests'), or(
    where('createdBy', '==', reviewer), where('approverEmail', '==', reviewer),
  ));
  assert.ok((await getDocsFromServer(assignedRequests)).docs.some(row => row.id === requestId));
  await denied(updateDoc(requestRef(db), { amount: -1 }));
  await denied(updateDoc(requestRef(db), { approverEmail: colleague }));
  await updateDoc(requestRef(db), { reason: 'Lý do đã cập nhật' });
  const decision = { status: 'Đã duyệt', decidedBy: reviewer, decidedAt: requestTime, reply: '',
    updatedBy: reviewer, updatedAt: requestTime };
  await denied(updateDoc(requestRef(reviewerDb), decision));
  await denied(updateDoc(requestRef(reviewerDb), { ...decision, status: 'Từ chối' }));
  await denied(updateDoc(requestRef(adminDb), { ...decision, decidedBy: 'quantri@example.test',
    updatedBy: 'quantri@example.test' }));
  const expenseRef = doc(reviewerDb, 'cash', 'tu_' + requestId);
  const expense = { type: 'chi', status: 'Chờ duyệt', requestId, date, amount: requestData.amount,
    category: 'Tạm ứng nhân viên', method: 'Chuyển khoản', projectId: '', note: 'Tạm ứng lương',
    partyType: 'Nhân viên', partyName: 'Nhân viên demo', createdBy: reviewer, updatedBy: reviewer,
    createdAt: requestTime, updatedAt: requestTime };
  await denied(setDoc(expenseRef, expense));
  const invalidBatch = writeBatch(reviewerDb);
  invalidBatch.update(requestRef(reviewerDb), decision);
  invalidBatch.set(expenseRef, { ...expense, amount: expense.amount + 1 });
  await denied(invalidBatch.commit());
  const approvalBatch = writeBatch(reviewerDb);
  approvalBatch.update(requestRef(reviewerDb), decision);
  approvalBatch.set(expenseRef, expense);
  await approvalBatch.commit();
  assert.equal((await getDocFromServer(requestRef(db))).get('status'), 'Đã duyệt');
  assert.equal((await getDocFromServer(expenseRef)).get('amount'), requestData.amount);
  await denied(updateDoc(requestRef(db), { reason: 'Sửa sau duyệt' }));
  await denied(deleteDoc(requestRef(db)));
  await deleteDoc(requestRef(adminDb));
  console.log('PASS: quyền đọc/ghi đơn từ, phân quyền duyệt và ghi đề nghị chi cùng giao dịch.');
  await denied(getDocsFromServer(collection(db, 'members')));
  await getDocsFromServer(collection(adminDb, 'members'));
  await getDocFromServer(doc(adminDb, 'settings', 'budget'));
  await getDocFromServer(doc(adminDb, 'settings', 'payroll'));
  await getDocsFromServer(collection(adminDb, 'recurring'));
  await denied(getDocFromServer(doc(db, 'settings', 'budget')));
  await denied(getDocFromServer(doc(db, 'settings', 'payroll')));
  await denied(getDocsFromServer(collection(db, 'recurring')));
  await denied(setDoc(doc(db, 'members', staff), { role: 'admin' }, { merge: true }));
  await denied(setDoc(doc(adminDb, 'members', 'quantri@example.test'), {
    name: 'Quản trị demo', email: 'quantri@example.test', role: 'admin', enabled: false, grants: [],
  }, { merge: true }));
  console.log('PASS: chỉ quản trị được truy cập nhóm cài đặt quản trị và không thể tự khóa.');
  await getDocsFromServer(collection(adminDb, 'tasks'));
  await getDocsFromServer(collection(adminDb, 'kpi'));
  await getDocsFromServer(query(collection(db, 'kpi'), where('email', '==', staff)));
  await denied(getDocsFromServer(collection(db, 'kpi')));
  await denied(getDocsFromServer(query(collection(db, 'kpi'), where('email', '==', colleague))));
  await denied(getDocsFromServer(query(collection(outsiderDb, 'kpi'), where('email', '==', 'outsider@example.test'))));
  await denied(setDoc(doc(adminDb, 'kpi', 'rules-test'), { email: staff, month: '2026-11', pct: 100 }));
  console.log('PASS: KPI cá nhân, KPI toàn công ty và chặn ghi từ ứng dụng.');
  const week = '2026-11-09';
  const plan = { email: staff, week, priorities: 'Kiểm thử bản thử', blockers: '', updatedAt: '2026-11-11T03:00:00.000Z' };
  const planRef = client => doc(client, 'weekPlans', staff + '_' + week);
  await setDoc(planRef(db), plan);
  await setDoc(planRef(db), { ...plan, blockers: 'Cần máy Android' });
  const ownPlans = query(collection(db, 'weekPlans'), where('week', '==', week), where('email', '==', staff));
  assert.equal((await getDocsFromServer(ownPlans)).docs[0].get('blockers'), 'Cần máy Android');
  assert.equal((await getDocsFromServer(query(collection(adminDb, 'weekPlans'), where('week', '==', week)))).size, 1);
  await denied(getDocsFromServer(collection(db, 'weekPlans')));
  await denied(getDocFromServer(planRef(otherDb)));
  await denied(getDocFromServer(planRef(outsiderDb)));
  await denied(getDocFromServer(planRef(anonymousDb)));
  await denied(setDoc(planRef(adminDb), plan));
  await denied(setDoc(planRef(db), { ...plan, priorities: 'x'.repeat(2001) }));
  await denied(deleteDoc(planRef(db)));
  console.log('PASS: kế hoạch tuần cá nhân và quyền đọc của quản trị.');
  const attendanceNote = client => doc(client, 'members', staff, 'attendanceNotes', date);
  const previousNote = await getDocFromServer(attendanceNote(db));
  await denied(setDoc(attendanceNote(otherDb), { text: 'Ghi chú' }));
  await denied(setDoc(attendanceNote(db), { text: '   ' }));
  await setDoc(attendanceNote(db), { text: 'Ghi chú cá nhân' });
  try {
    assert.equal((await getDocFromServer(attendanceNote(db))).get('text'), 'Ghi chú cá nhân');
    assert((await getDocsFromServer(collection(db, 'members', staff, 'attendanceNotes'))).docs.some(item => item.id === date));
    await denied(getDocFromServer(attendanceNote(otherDb)));
    await denied(getDocFromServer(attendanceNote(anonymousDb)));
    await denied(updateDoc(attendanceNote(db), { manualWork: 1 }));
    await denied(updateDoc(attendanceNote(db), { text: 'a'.repeat(1001) }));
    await updateDoc(attendanceNote(db), { text: 'Ghi chú đã sửa' });
    await deleteDoc(attendanceNote(db));
  } finally {
    if (previousNote.exists()) await setDoc(attendanceNote(db), previousNote.data());
    else await deleteDoc(attendanceNote(db));
  }
  await denied(setDoc(attendance(otherDb), punch));
  await setDoc(attendance(db), punch);
  await denied(setDoc(attendance(db), punch));
  await denied(getDocFromServer(attendance(otherDb)));
  await denied(getDocsFromServer(collection(db, 'attendance')));
  await denied(updateDoc(attendance(db), { manualWork: 1 }));
  await denied(deleteDoc(attendance(db)));
  await updateDoc(attendance(db), { outTs: serverTimestamp(), outDist: null });
  await updateDoc(attendance(db), { outTs: serverTimestamp(), outDist: 3 });
  const adjustment = { email: staff, name: 'Nhân viên demo', date, manualIn: '08:00', manualOut: '17:30',
    note: 'Xác nhận giờ làm', editedBy: 'quantri@example.test' };
  await setDoc(attendance(adminDb), { ...adjustment, manualWork: 1 }, { merge: true });
  assert.equal((await getDocFromServer(attendance(db))).get('manualWork'), 1);
  await setDoc(attendance(adminDb), { ...adjustment, manualWork: deleteField() }, { merge: true });
  assert.equal((await getDocFromServer(attendance(db))).get('manualWork'), undefined);
  assert((await getDocFromServer(attendance(db))).get('inTs'));
  await deleteDoc(attendance(adminDb));
  await setDoc(attendance(adminDb), { ...adjustment, manualWork: deleteField() }, { merge: true });
  await deleteDoc(attendance(adminDb));
  console.log('PASS: chấm công cá nhân, chấm ra lại, quyền quản trị và điều chỉnh giữ giờ máy.');
  const projects = client => collection(client, 'projects');
  const project = await getDocFromServer(doc(db, 'projects', 'marchix-mobile-demo'));
  assert(project.exists());
  assert((await getDocsFromServer(projects(db))).docs.some(row => row.id === project.id));
  await denied(getDocsFromServer(projects(outsiderDb)));
  await denied(getDocsFromServer(projects(anonymousDb)));
  await denied(updateDoc(project.ref, { name: 'Nhân viên sửa' }));
  await denied(setDoc(doc(projects(db)), project.data()));
  const newProject = doc(projects(adminDb), 'rules-test-project');
  await setDoc(newProject, project.data());
  await updateDoc(newProject, { name: 'Dự án đã sửa', status: 'Tạm dừng' });
  assert.equal((await getDocFromServer(newProject)).get('status'), 'Tạm dừng');
  await denied(updateDoc(newProject, { budget: -1 }));
  await denied(updateDoc(newProject, { phase: 'x'.repeat(321) }));
  await denied(updateDoc(newProject, { extra: true }));
  await denied(deleteDoc(newProject));
  console.log('PASS: thành viên xem dự án, quản trị tạo và sửa hồ sơ hợp lệ.');
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
