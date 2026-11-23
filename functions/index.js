const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const { HttpsError, onCall } = require('firebase-functions/v2/https');
const { onDocumentCreated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { createHash, randomUUID } = require('node:crypto');
const { publishWorkflowNotifications, writeTaskNotification } = require('./workflowNotifications');
const { taskRoleNotices } = require('./taskRoleNotices');
const { cadences, createScheduledTasks, timeZone } = require('./recurringTasks');

const projectId = 'demo-marchix-mobile';
const openStatuses = ['Chưa làm', 'Đang làm', 'Vướng'];
const taskPriorities = ['Cao', 'Trung bình', 'Thấp'];
const taskRepeatOptions = ['Không lặp', ...cadences];
const reviewRatings = ['Xuất sắc', 'Tốt', 'Khá', 'Trung bình', 'Kém'];
const emulator = process.env.FUNCTIONS_EMULATOR === 'true';
const app = initializeApp(emulator ? { projectId } : undefined);
const workDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
const maxFileBytes = 5 * 1024 * 1024;
const maxCopiedBytes = 8 * 1024 * 1024;
const fileChunkBytes = 900 * 1024;

exports.scheduleRecurringTasks = onSchedule({
  schedule: '5 0 * * *', timeZone, region: 'asia-southeast1', retryCount: 3, timeoutSeconds: 540,
}, () => createScheduledTasks(getFirestore(app)));

for (const [name, collection] of Object.entries({
  notifyRequestWorkflow: 'requests',
  notifyCashWorkflow: 'cash',
  notifyPayrollWorkflow: 'payroll',
})) {
  exports[name] = onDocumentWritten({ document: collection + '/{id}', region: 'asia-southeast1', retry: true },
    event => publishWorkflowNotifications(getFirestore(app), collection, event));
}

function isMemberEmail(value) {
  return typeof value === 'string' && value.length <= 254 && /^[^\s/@]+@[^\s/@]+$/.test(value);
}

function verifiedEmail(request, expectedProject) {
  const { email, email_verified: verified, aud } = request.auth?.token ?? {};
  if (verified !== true || !expectedProject || aud !== expectedProject || !isMemberEmail(email)) {
    throw new HttpsError('unauthenticated', 'Vui lòng đăng nhập bằng tài khoản đã xác minh.');
  }
  return email;
}

function activeMember(snapshot) {
  return snapshot.exists && snapshot.get('enabled') !== false;
}

const pushEnabled = () => !emulator && process.env.MARCHIX_WORKSPACE_PUSH_ENABLED === 'true';
const validPushToken = token => typeof token === 'string' &&
  /^(?:Expo|Exponent)PushToken\[[A-Za-z0-9_-]{1,200}\]$/.test(token);
const pushRegistrationDays = 60;

exports.setWorkspacePushDevice = onCall(async request => {
  if (!pushEnabled()) throw new HttpsError('failed-precondition', 'Thông báo đẩy chưa được bật.');
  const email = verifiedEmail(request, process.env.GCLOUD_PROJECT || app.options.projectId);
  const { token, previousToken } = request.data ?? {};
  if (!(token === null || validPushToken(token)) ||
      !(previousToken === null || validPushToken(previousToken))) {
    throw new HttpsError('invalid-argument', 'Mã đăng ký thiết bị không hợp lệ.');
  }
  const db = getFirestore(app);
  if (token && !activeMember(await db.collection('members').doc(email).get())) {
    throw new HttpsError('permission-denied', 'Tài khoản chưa được cấp quyền.');
  }
  // Use the token digest as the document ID so a device is assigned to one account at a time.
  const device = value => db.collection('workspacePushDevices').doc(createHash('sha256').update(value).digest('hex'));
  await db.runTransaction(async transaction => {
    if (previousToken && previousToken !== token) {
      const previous = await transaction.get(device(previousToken));
      if (previous.get('uid') === request.auth.uid) transaction.delete(previous.ref);
    }
    if (token) transaction.set(device(token), {
      token, email, uid: request.auth.uid,
      expiresAt: new Date(Date.now() + pushRegistrationDays * 86_400_000),
    });
  });
});

exports.sendWorkspacePush = onDocumentCreated('notifications/{notificationId}', async event => {
  if (!pushEnabled()) return;
  const note = event.data;
  const email = note?.get('to');
  if (!note || !isMemberEmail(email) || note.get('read') === true) return;
  const db = getFirestore(app);
  const [member, devices] = await Promise.all([
    db.collection('members').doc(email).get(),
    db.collection('workspacePushDevices').where('email', '==', email).get(),
  ]);
  if (!activeMember(member)) return;
  const now = Date.now();
  const targets = devices.docs.filter(device =>
    device.get('expiresAt')?.toMillis() > now && validPushToken(device.get('token')));
  if (!targets.length) return;

  try {
    await db.collection('workspacePushDispatches').doc(event.params.notificationId).create({
      expiresAt: new Date(now + 7 * 86_400_000),
    });
  } catch (error) {
    if (error?.code === 6) return;
    throw error;
  }

  for (let start = 0; start < targets.length; start += 100) {
    const batch = targets.slice(start, start + 100);
    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify(batch.map(device => ({
          to: device.get('token'), title: 'Quản lý Marchix', body: 'Bạn có thông báo mới.',
          channelId: 'workspace', sound: 'default', ttl: 3600,
          data: { workspaceNotificationId: event.params.notificationId },
        }))),
      });
      if (!response.ok) throw new Error(`Expo Push HTTP ${response.status}`);
      const { data } = await response.json();
      if (!Array.isArray(data) || data.length !== batch.length) throw new Error('Invalid Expo push tickets');
      await Promise.all(data.map(async (ticket, index) => {
        if (ticket.status === 'ok') return;
        if (ticket.details?.error === 'DeviceNotRegistered') {
          const device = batch[index];
          await device.ref.delete({ lastUpdateTime: device.updateTime });
        } else {
          console.warn('Expo rejected a Marchix push.', ticket.details?.error ?? 'unknown');
        }
      }));
    } catch (error) {
      console.warn('Marchix push batch failed.', error?.message);
    }
  }
});

function memberName(snapshot) {
  const name = snapshot.get('name');
  return typeof name === 'string' && name.trim() ? name.trim() : snapshot.id;
}

function photoUrl(...values) {
  return values.find(value => typeof value === 'string' && value.length <= 2048 && /^https:\/\/[^\s]+$/i.test(value)) ?? null;
}

async function directoryProfiles(directory) {
  const profiles = new Map();
  for (let index = 0; index < directory.length; index += 100) {
    const identifiers = directory.slice(index, index + 100).map(member => ({ email: member.email }));
    try {
      const { users } = await getAuth(app).getUsers(identifiers);
      users.filter(user => user.emailVerified && !user.disabled).forEach(user => profiles.set(user.email, user));
    } catch (error) {
      console.warn('Could not load Firebase Auth profile photos.', error?.code);
      break;
    }
  }
  return profiles;
}

function canReviewTasks(snapshot) {
  const grants = snapshot.get('grants');
  return snapshot.get('role') === 'admin' || (Array.isArray(grants) && grants.includes('taskReview'));
}

function assignmentContext(request, feature = 'giao việc') {
  const runtimeProject = app.options.projectId || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  const email = verifiedEmail(request, runtimeProject);
  if (emulator ? !process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST
    : process.env.MARCHIX_TASK_ASSIGNMENT_ENABLED !== 'true') {
    throw new HttpsError('failed-precondition', `Tính năng ${feature} chưa được bật trong môi trường này.`);
  }
  return { email, db: getFirestore(app) };
}

exports.listMobileTaskAssignees = onCall(async request => {
  const { email, db } = assignmentContext(request);
  const members = db.collection('members');
  if (!activeMember(await members.doc(email).get())) {
    throw new HttpsError('permission-denied', 'Tài khoản chưa được cấp quyền giao việc.');
  }
  const [directory, projects] = await Promise.all([
    members.select('name', 'enabled', 'role', 'grants', 'photoURL', 'avatarUrl', 'avatarURL').get(),
    db.collection('projects').select('name').get(),
  ]);
  const rows = directory.docs.filter(row => isMemberEmail(row.id) && activeMember(row)).map(row => ({
    email: row.id, name: memberName(row), canReview: canReviewTasks(row),
    photoURL: photoUrl(row.get('photoURL'), row.get('avatarUrl'), row.get('avatarURL')),
  }));
  const profiles = await directoryProfiles(rows.filter(member => !member.photoURL || member.name === member.email));
  return {
    members: rows.map(member => {
      const profile = profiles.get(member.email);
      const name = member.name === member.email ? profile?.displayName?.trim() || 'Thành viên Marchix' : member.name;
      return { ...member, name: isMemberEmail(name) ? 'Thành viên Marchix' : name,
        photoURL: member.photoURL || photoUrl(profile?.photoURL, ...profile?.providerData.map(provider => provider.photoURL) ?? []) };
    }),
    projects: projects.docs.filter(row => typeof row.get('name') === 'string' && row.get('name').trim())
      .map(row => ({ id: row.id, name: row.get('name') })),
  };
});

exports.listMobileRequestMembers = onCall(async request => {
  const runtimeProject = app.options.projectId || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  const email = verifiedEmail(request, runtimeProject);
  const members = getFirestore(app).collection('members');
  if (!activeMember(await members.doc(email).get())) {
    throw new HttpsError('permission-denied', 'Tài khoản chưa được cấp quyền truy cập đơn từ.');
  }
  const directory = await members.select('name', 'enabled', 'role', 'grants').get();
  return directory.docs.filter(row => isMemberEmail(row.id) && activeMember(row)).map(row => {
    const grants = row.get('grants');
    return { email: row.id, name: memberName(row), canReview: row.get('role') === 'admin' ||
      (Array.isArray(grants) && grants.includes('requestReview')) };
  });
});

function validDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const day = new Date(value + 'T00:00:00Z');
  return Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === value;
}

function parseAssignment(data, editing = false) {
  const {
    taskId, title, assigneeEmail, assigneeEmails = [assigneeEmail], due, startDate = '',
    priority = 'Trung bình', status = 'Chưa làm', progress = 0, repeat = 'Không lặp', projectId = '',
    note = '', message = '', checklist = [], watchers = [], milestone = false, approverEmail, category, requireReview,
  } = data;
  if ((!editing && (typeof taskId !== 'string' || !/^[a-zA-Z0-9]{20}$/.test(taskId))) ||
      typeof title !== 'string' || !title.trim() || title.trim().length > 160 ||
      !Array.isArray(assigneeEmails) || assigneeEmails.length < 1 || assigneeEmails.length > (editing ? 1 : 30) ||
      !assigneeEmails.every(isMemberEmail) || new Set(assigneeEmails).size !== assigneeEmails.length) {
    throw new HttpsError('invalid-argument', 'Nhập tên và chọn từ 1 đến 30 người thực hiện.');
  }
  if ((!validDay(due) && !(editing && due === '')) ||
      (startDate !== '' && (!validDay(startDate) || (due && startDate > due)))) {
    throw new HttpsError('invalid-argument', 'Hạn chót và ngày bắt đầu phải hợp lệ.');
  }
  if (category !== undefined && (typeof category !== 'string' || category.trim().length > 160)) {
    throw new HttpsError('invalid-argument', 'Hạng mục công việc chỉ được tối đa 160 ký tự.');
  }
  if (!taskPriorities.includes(priority) || !openStatuses.includes(status) || !taskRepeatOptions.includes(repeat) ||
      !Number.isInteger(progress) || progress < 0 || progress > 100 || typeof milestone !== 'boolean' ||
      (requireReview !== undefined && typeof requireReview !== 'boolean') ||
      typeof projectId !== 'string' || (projectId && (projectId.includes('/') || Buffer.byteLength(projectId) > 1500)) ||
      typeof note !== 'string' || note.length > 2000 || typeof message !== 'string' || message.length > 1000 ||
      !Array.isArray(checklist) || checklist.length > 30 ||
      !checklist.every(item => {
        const label = typeof item === 'string' ? item : item?.t;
        return typeof label === 'string' && label.trim() && label.trim().length <= 160 &&
          (typeof item === 'string' || (validChecklistWeight(item.weight) &&
            (!editing || item.sourceIndex == null || (Number.isSafeInteger(item.sourceIndex) && item.sourceIndex >= 0))));
      }) ||
      !Array.isArray(watchers) || watchers.length > 30 || !watchers.every(isMemberEmail) ||
      (approverEmail != null && approverEmail !== '' && !isMemberEmail(approverEmail))) {
    throw new HttpsError('invalid-argument', 'Thông tin công việc không hợp lệ.');
  }
  if (approverEmail && assigneeEmails.includes(approverEmail)) {
    throw new HttpsError('invalid-argument', 'Người duyệt phải khác người thực hiện.');
  }
  return {
    taskId, title: title.trim(), assigneeEmails: [...assigneeEmails].sort(), due, startDate, priority, status,
    ...(category === undefined || (!editing && !category.trim()) ? {} : { category: category.trim() }),
    progress: checklist.length ? 0 : progress, repeat, projectId, note: note.trim(), message: message.trim(),
    checklist: checklist.map(item => typeof item === 'string' ? { t: item.trim() }
      : { t: item.t.trim(), weight: item.weight,
        ...(editing && item.sourceIndex !== undefined ? { sourceIndex: item.sourceIndex } : {}) }),
    watchers: [...new Set(watchers)].sort(), milestone,
    approverEmail: approverEmail ?? null,
    ...(requireReview !== undefined && { requireReview }),
  };
}

function parseAttachments(items, copies) {
  if (!Array.isArray(items) || items.length > 5) {
    throw new HttpsError('invalid-argument', 'Chọn tối đa 5 tệp đính kèm.');
  }
  let total = 0;
  return items.map(item => {
    const { name, type, base64 } = item ?? {};
    if (typeof name !== 'string' || !name.trim() || name.length > 255 || /[\/\\\x00-\x1f]/.test(name) ||
        typeof type !== 'string' || !/^[\w.+-]+\/[\w.+-]+$/.test(type) || type.length > 127 ||
        typeof base64 !== 'string' || base64.length > Math.ceil(maxFileBytes / 3) * 4) {
      throw new HttpsError('invalid-argument', 'Tệp đính kèm không hợp lệ hoặc vượt quá 5 MB.');
    }
    const bytes = Buffer.from(base64, 'base64');
    if (bytes.length > maxFileBytes || bytes.toString('base64') !== base64) {
      throw new HttpsError('invalid-argument', 'Tệp đính kèm không hợp lệ hoặc vượt quá 5 MB.');
    }
    total += bytes.length * copies;
    if (total > maxCopiedBytes) {
      throw new HttpsError('invalid-argument', 'Tổng dung lượng tệp vượt quá 8 MB sau khi tính số người thực hiện.');
    }
    return { name, type, bytes, digest: createHash('sha256').update(bytes).digest('hex') };
  });
}

function writeAttachments(transaction, task, items, by, at, scope = task.id) {
  return items.map(({ name, type, bytes }, index) => {
    const id = 'mobile_' + createHash('sha256').update(`${scope}:${index}`).digest('hex');
    const file = task.firestore.collection('files').doc(id);
    const size = bytes.length;
    const chunks = Math.max(1, Math.ceil(size / fileChunkBytes));
    transaction.create(file, { name, type, size, chunks, parent: task.path, scopeType: 'tasks', scopeId: task.id, by, at });
    for (let i = 0; i < chunks; i++) {
      transaction.create(file.collection('chunks').doc(String(i)), {
        i, data: bytes.subarray(i * fileChunkBytes, (i + 1) * fileChunkBytes),
      });
    }
    return { id, name, size, type };
  });
}

exports.createMobileTask = onCall(async request => {
  const { email, db } = assignmentContext(request);
  const { taskId, assigneeEmails, checklist, message, approverEmail, ...fields } = parseAssignment(request.data ?? {});
  const attachments = parseAttachments(request.data?.attachments ?? [], assigneeEmails.length);
  const fingerprintData = { assigneeEmails, checklist: checklist.map(item => (item.weight ?? 1) === 1 ? item.t : item),
    message, approverEmail, fields,
    ...(attachments.length ? { attachments: attachments.map(({ name, type, digest }) => ({ name, type, digest })) } : {}) };
  const fingerprint = createHash('sha256').update(JSON.stringify(fingerprintData)).digest('hex');
  const members = db.collection('members');
  const tasks = db.collection('tasks');
  const taskRefs = assigneeEmails.map((_, index) => tasks.doc(index === 0 ? taskId : `${taskId}_${index}`));
  const receipt = db.collection('mobileTaskAssignments').doc(taskId);
  const memberEmails = [...new Set([email, ...assigneeEmails, ...fields.watchers, ...(approverEmail ? [approverEmail] : [])])];
  return db.runTransaction(async transaction => {
    const [saved, existing, assigner] = await transaction.getAll(receipt, taskRefs[0], members.doc(email));
    if (!activeMember(assigner)) {
      throw new HttpsError('permission-denied', 'Tài khoản chưa được cấp quyền giao việc.');
    }
    if (saved.exists && saved.get('by') === email && saved.get('fingerprint') === fingerprint) {
      return saved.get('result');
    }
    if (saved.exists) {
      throw new HttpsError('already-exists', 'Lần giao này đã được lưu. Hãy mở form mới để giao việc khác.');
    }
    if (existing.exists) {
      const previous = existing.data();
      if (!attachments.length && request.data?.assigneeEmails === undefined && previous.assignedBy === email &&
          previous.assigneeEmail === assigneeEmails[0] && previous.title === fields.title && previous.due === fields.due) {
        const task = { id: taskId, assignee: previous.assignee };
        return { ...task, assignments: [task] };
      }
      throw new HttpsError('already-exists', 'Mã công việc này đã được sử dụng. Hãy kiểm tra việc đã giao.');
    }
    const now = new Date();
    const createdAt = now.toISOString();
    const today = workDate.format(now);
    const startDate = fields.startDate || today;
    if (fields.due < today || fields.due < startDate) {
      throw new HttpsError('invalid-argument', 'Hạn chót phải từ hôm nay trở đi và không sớm hơn ngày bắt đầu.');
    }
    const directory = await transaction.getAll(...memberEmails.map(member => members.doc(member)));
    if (directory.some(row => !activeMember(row))) {
      throw new HttpsError('failed-precondition', 'Có thành viên không còn hoạt động. Hãy mở lại form và chọn lại.');
    }
    const byEmail = new Map(directory.map(row => [row.id, row]));
    if (approverEmail && !canReviewTasks(byEmail.get(approverEmail))) {
      throw new HttpsError('failed-precondition', 'Thành viên này chưa được cấp quyền duyệt công việc.');
    }
    if (fields.projectId && !(await transaction.get(db.collection('projects').doc(fields.projectId))).exists) {
      throw new HttpsError('failed-precondition', 'Dự án không còn tồn tại. Hãy mở lại form và chọn lại.');
    }
    const assignments = assigneeEmails.map((assigneeEmail, index) => {
      const ref = taskRefs[index];
      const assignee = memberName(byEmail.get(assigneeEmail));
      const files = writeAttachments(transaction, ref, attachments, email, createdAt);
      transaction.create(ref, {
        ...fields, startDate, assignee, assigneeEmail, assignedBy: email,
        approverEmail: approverEmail ?? (fields.requireReview !== false && assigneeEmail !== email && canReviewTasks(assigner) ? email : ''),
        checklist: checklist.map(({ t, weight = 1 }) => ({ t, weight, done: false })),
        comments: message || files.length ? [{ by: email, at: createdAt, text: message, files }] : [],
        spawned: cadences.includes(fields.repeat), doneAt: '', createdAt, updatedAt: createdAt, updatedBy: email,
        ...(cadences.includes(fields.repeat) && { repeatSchedule: { cadence: fields.repeat, period: 0, checkLegacy: false } }),
      });
      writeTaskNotification(transaction, db, { from: email, to: assigneeEmail, taskId: ref.id,
        title: 'Bạn được giao việc mới', body: fields.title, createdAt });
      return { id: ref.id, assignee };
    });
    const result = { ...assignments[0], assignments };
    transaction.create(receipt, { by: email, fingerprint, result, createdAt });
    return result;
  });
});

exports.updateMobileTask = onCall(async request => {
  const { email, db } = assignmentContext(request);
  const data = request.data ?? {};
  const { assigneeEmails: [assigneeEmail], checklist, message, approverEmail, status, progress, ...fields } =
    parseAssignment(data, true);
  const { taskId, requireReview, ...details } = fields;
  const { revision, retainedFileIds = [] } = data;
  const ref = db.collection('tasks').doc(getTaskId(taskId));
  if (typeof revision !== 'string' || !Array.isArray(retainedFileIds) || retainedFileIds.length > 5 ||
      retainedFileIds.some(id => typeof id !== 'string') || new Set(retainedFileIds).size !== retainedFileIds.length) {
    throw new HttpsError('invalid-argument', 'Thông tin chỉnh sửa không hợp lệ.');
  }
  const attachments = parseAttachments(data.attachments ?? [], 1);
  const members = db.collection('members');
  return db.runTransaction(async transaction => {
    const [member, snapshot] = await transaction.getAll(members.doc(email), ref);
    const task = snapshot.data();
    if (!activeMember(member) || task?.assignedBy !== email) {
      throw new HttpsError('permission-denied', 'Chỉ người giao việc mới được chỉnh sửa công việc này.');
    }
    if (task.status === 'Xong') {
      throw new HttpsError('failed-precondition', 'Công việc đã xong và chỉ có thể xem chi tiết.');
    }
    if ((task.updatedAt || '') !== revision) {
      throw new HttpsError('failed-precondition', 'Công việc vừa thay đổi. Hãy đóng form và mở lại để chỉnh sửa.');
    }

    const open = openStatuses.includes(task.status);
    const nextApprover = approverEmail ?? task.approverEmail ?? '';
    const newMembers = [...new Set([
      ...(open && assigneeEmail !== task.assigneeEmail ? [assigneeEmail] : []),
      ...(open && nextApprover && nextApprover !== task.approverEmail ? [nextApprover] : []),
      ...details.watchers.filter(watcher => !task.watchers?.includes(watcher)),
    ])];
    const directory = newMembers.length ? await transaction.getAll(...newMembers.map(id => members.doc(id))) : [];
    if (directory.some(row => !activeMember(row))) {
      throw new HttpsError('failed-precondition', 'Có thành viên không còn hoạt động. Hãy chọn lại.');
    }
    const byEmail = new Map(directory.map(row => [row.id, row]));
    if (open && (nextApprover === assigneeEmail || (byEmail.has(nextApprover) &&
        nextApprover !== task.approverEmail && !canReviewTasks(byEmail.get(nextApprover))))) {
      throw new HttpsError('failed-precondition', 'Người duyệt phải có quyền duyệt và khác người thực hiện.');
    }
    if (details.projectId && details.projectId !== task.projectId &&
        !(await transaction.get(db.collection('projects').doc(details.projectId))).exists) {
      throw new HttpsError('failed-precondition', 'Dự án không còn tồn tại. Hãy chọn lại.');
    }

    const comments = Array.isArray(task.comments) ? [...task.comments] : [];
    const assignmentIndex = comments.findIndex(comment => comment?.by === email &&
      (comment.kind === 'assignment' || (task.createdAt && comment.at === task.createdAt)));
    const original = comments[assignmentIndex];
    const existingFiles = Array.isArray(original?.files) ? original.files : [];
    const retained = retainedFileIds.map(id => existingFiles.find(file => file?.id === id));
    if (retained.some(file => !file || !Number.isSafeInteger(file.size) || file.size < 0) ||
        retained.length + attachments.length > 5 ||
        retained.reduce((sum, file) => sum + file.size, 0) + attachments.reduce((sum, file) => sum + file.bytes.length, 0) >
          maxCopiedBytes) {
      throw new HttpsError('invalid-argument', 'Chọn tối đa 5 tệp đính kèm với tổng dung lượng không quá 8 MB.');
    }

    const now = new Date();
    if (now.toISOString() === revision) now.setTime(now.getTime() + 1);
    const updatedAt = now.toISOString();
    const files = [...retained, ...writeAttachments(transaction, ref, attachments, email, updatedAt,
      JSON.stringify([ref.id, updatedAt]))];
    if (message || files.length) {
      const assignment = { ...original, by: email, at: original?.at || updatedAt, kind: 'assignment', text: message, files };
      if (assignmentIndex < 0) comments.unshift(assignment);
      else comments[assignmentIndex] = assignment;
    } else if (assignmentIndex >= 0) {
      comments.splice(assignmentIndex, 1);
    }
    const change = { ...details, comments, updatedAt, updatedBy: email,
      ...(cadences.includes(details.repeat) && { spawned: true }) };
    if (open) {
      const original = Array.isArray(task.checklist) ? task.checklist : [];
      const indices = checklist.flatMap(({ sourceIndex }) => sourceIndex == null ? [] : [sourceIndex]);
      const reserved = new Set(indices);
      if (reserved.size !== indices.length || indices.some(index => !original[index])) {
        throw new HttpsError('invalid-argument', 'Việc con không hợp lệ.');
      }
      const remaining = original.filter((_, index) => !reserved.has(index));
      const items = checklist.map(({ t, weight, sourceIndex }) => {
        if (sourceIndex === null) return { t, weight, done: false };
        if (sourceIndex !== undefined) return { t, weight, done: original[sourceIndex].done === true };
        const index = remaining.findIndex(item => (item?.t || item?.text) === t);
        if (index < 0) return { t, weight: weight ?? 1, done: false };
        const existing = remaining.splice(index, 1)[0];
        return weight === undefined ? existing : { ...existing, weight };
      });
      Object.assign(change, { assigneeEmail, approverEmail: nextApprover, status, checklist: items,
        progress: items.length ? checklistProgress(items) : progress });
      if (requireReview !== undefined) change.requireReview = requireReview;
      if (assigneeEmail !== task.assigneeEmail) {
        change.assignee = memberName(byEmail.get(assigneeEmail));
      }
    }
    for (const notice of taskRoleNotices(task, { ...task, ...change })) {
      writeTaskNotification(transaction, db, {
        ...notice, from: email, taskId: ref.id, createdAt: updatedAt, includeSender: true,
      });
    }
    transaction.update(ref, change);
    return { ok: true };
  });
});

exports.addMobileTaskAttachments = onCall(async request => {
  const { email, db } = assignmentContext(request, 'đính kèm tệp trao đổi');
  const { taskId, attachments } = request.data ?? {};
  if (typeof taskId !== 'string' || !/^[\w-]{1,150}$/.test(taskId)) {
    throw new HttpsError('invalid-argument', 'Mã công việc không hợp lệ.');
  }
  const items = parseAttachments(attachments, 1);
  if (!items.length) throw new HttpsError('invalid-argument', 'Chọn ít nhất một tệp.');
  const ref = db.collection('tasks').doc(taskId);
  const scope = `${taskId}:discussion:${randomUUID()}`;
  await db.runTransaction(async transaction => {
    const [member, snapshot] = await transaction.getAll(db.collection('members').doc(email), ref);
    const task = snapshot.data();
    if (!activeMember(member) || task?.assigneeEmail !== email) {
      throw new HttpsError('permission-denied', 'Bạn không còn quyền gửi trao đổi cho công việc này.');
    }
    if (task.status === 'Xong') {
      throw new HttpsError('failed-precondition', 'Công việc đã xong và chỉ có thể xem chi tiết.');
    }
    const at = new Date().toISOString();
    const files = writeAttachments(transaction, ref, items, email, at, scope);
    transaction.update(ref, { comments: [...(task.comments ?? []), { by: email, at, text: '', files }] });
  });
  return { ok: true };
});

exports.downloadMobileTaskAttachment = onCall(async request => {
  const { email, db } = assignmentContext(request, 'tải tệp đính kèm');
  const { taskId, fileId } = request.data ?? {};
  const validId = id => typeof id === 'string' && /^[\w-]{1,150}$/.test(id);
  if (!validId(taskId) || !validId(fileId)) {
    throw new HttpsError('invalid-argument', 'Mã tệp không hợp lệ.');
  }
  const taskRef = db.collection('tasks').doc(taskId);
  const [member, snapshot] = await db.getAll(db.collection('members').doc(email), taskRef);
  const task = snapshot.data();
  const canReadTask = task && (task.assigneeEmail === email || task.assignedBy === email ||
    (task.status === 'Chờ duyệt' && task.approverEmail === email && canReviewTasks(member)));
  if (!activeMember(member) || !canReadTask) {
    throw new HttpsError('permission-denied', 'Bạn không có quyền tải tệp này.');
  }
  const linked = Array.isArray(task.comments) && task.comments.some(comment =>
    Array.isArray(comment?.files) && comment.files.some(file => file?.id === fileId));
  if (!linked) throw new HttpsError('not-found', 'Không tìm thấy tệp trong công việc.');
  const fileRef = db.collection('files').doc(fileId);
  const file = (await fileRef.get()).data();
  if (!file || file.parent !== taskRef.path || file.scopeType !== 'tasks' || file.scopeId !== taskId ||
      !Number.isInteger(file.size) || file.size < 0 || file.size > maxFileBytes ||
      !Number.isInteger(file.chunks) || file.chunks !== Math.max(1, Math.ceil(file.size / fileChunkBytes))) {
    throw new HttpsError('not-found', 'Tệp đính kèm không khả dụng.');
  }
  const chunks = await db.getAll(...Array.from({ length: file.chunks }, (_, i) => fileRef.collection('chunks').doc(String(i))));
  const buffers = chunks.map((chunk, i) => {
    const data = chunk.get('data');
    const expectedSize = Math.min(fileChunkBytes, file.size - i * fileChunkBytes);
    if (!Buffer.isBuffer(data) || data.length !== expectedSize) {
      throw new HttpsError('data-loss', 'Tệp đính kèm chưa đầy đủ.');
    }
    return data;
  });
  return { base64: Buffer.concat(buffers).toString('base64') };
});

function validChecklistWeight(weight) {
  return Number.isSafeInteger(weight) && weight > 0 && weight <= Math.floor(Number.MAX_SAFE_INTEGER / 30);
}

function checklistProgress(items) {
  let total = 0;
  let completed = 0;
  for (const item of items) {
    const weight = validChecklistWeight(item?.weight) ? item.weight : 1;
    total += weight;
    if (item?.done === true) completed += weight;
  }
  return total ? Math.round(completed / total * 100) : 0;
}

function getTaskId(value) {
  if (typeof value !== 'string' || !value || value.includes('/') ||
      value === '.' || value === '..' || Buffer.byteLength(value) > 1500) {
    throw new HttpsError('invalid-argument', 'Mã công việc không hợp lệ.');
  }
  return value;
}

function editTask({ email, db }, id, canEdit, edit) {
  const taskRef = db.collection('tasks').doc(id);
  const memberRef = db.collection('members').doc(email);
  return db.runTransaction(async transaction => {
    const [member, snapshot] = await transaction.getAll(memberRef, taskRef);
    const task = snapshot.data();
    if (!activeMember(member) || !task || !canEdit(task, member)) {
      throw new HttpsError('permission-denied', 'Bạn không có quyền thực hiện thao tác này.');
    }
    const now = new Date().toISOString();
    const change = await edit({ task, taskRef, member, id, transaction, db, email, now });
    if (change) transaction.update(taskRef, { ...change, updatedAt: now, updatedBy: email });
    return { ok: true };
  });
}

function editAssignedTask(request, edit) {
  if (!emulator || !process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new HttpsError('failed-precondition', 'Cần chạy Firebase Emulator cho bản thử.');
  }
  const email = verifiedEmail(request, projectId);
  return editTask({ email, db: getFirestore(app) }, getTaskId(request.data?.taskId), task => task.assigneeEmail === email, edit);
}

exports.remindMobileTask = onCall(request => {
  const access = assignmentContext(request, 'nhắc việc');
  const { taskId, assigneeEmail, previousReminder } = request.data ?? {};
  if (!isMemberEmail(assigneeEmail) ||
      (previousReminder !== null && (typeof previousReminder !== 'string' || previousReminder.length > 64))) {
    throw new HttpsError('invalid-argument', 'Thông tin nhắc việc không hợp lệ.');
  }
  const id = getTaskId(taskId);
  return editTask(access, id, task => task.assignedBy === access.email,
    async ({ task, taskRef, member, transaction, db, email, now }) => {
      if (!openStatuses.includes(task.status) || task.assigneeEmail !== assigneeEmail || assigneeEmail === email) {
        throw new HttpsError('failed-precondition', 'Công việc đã thay đổi hoặc không còn người thực hiện phù hợp.');
      }
      // A retry with the same task snapshot must not queue another email.
      if ((task.remindedAt ?? null) !== previousReminder) return;
      const recipient = await transaction.get(db.collection('members').doc(assigneeEmail));
      if (!activeMember(recipient)) {
        throw new HttpsError('failed-precondition', 'Người thực hiện không còn hoạt động.');
      }
      const due = /^\d{4}-\d{2}-\d{2}$/.test(task.due ?? '') ? task.due : '';
      const daysLate = (Date.parse(workDate.format(new Date(now))) - Date.parse(due)) / 86_400_000;
      const reminder = daysLate > 0 ? 'đã quá hạn ' + daysLate + ' ngày'
        : due ? 'hạn ' + due.split('-').reverse().join('/') : 'chưa có hạn';
      writeTaskNotification(transaction, db, {
        from: email, to: assigneeEmail, taskId: id, title: 'Nhắc việc: ' + task.title,
        body: `${memberName(member)} nhắc: ${reminder} · tiến độ ${task.progress ?? 0}%`,
        createdAt: now,
      });
      transaction.update(taskRef, { remindedAt: now, remindedBy: email });
    });
});

exports.setTaskChecklistItem = onCall(request => {
  const { index, label, done } = request.data ?? {};
  if (!Number.isSafeInteger(index) || index < 0 || typeof label !== 'string' || typeof done !== 'boolean') {
    throw new HttpsError('invalid-argument', 'Mục checklist không hợp lệ.');
  }
  return editAssignedTask(request, ({ task }) => {
    if (!openStatuses.includes(task.status)) {
      throw new HttpsError('failed-precondition', 'Checklist chỉ sửa được khi công việc đang mở.');
    }
    const checklist = task.checklist;
    const item = Array.isArray(checklist) ? checklist[index] : undefined;
    if (!item || (item.t || item.text || '') !== label) {
      throw new HttpsError('failed-precondition', 'Checklist vừa thay đổi. Hãy chọn lại mục cần cập nhật.');
    }
    const updated = checklist.slice();
    updated[index] = { ...item, done };
    const progress = checklistProgress(updated);
    if (item.done === done && task.progress === progress) return;
    return { checklist: updated, progress };
  });
});

exports.reportTaskCompletion = onCall(request => {
  const note = request.data?.note;
  if (typeof note !== 'string' || note.trim().length > 1000) {
    throw new HttpsError('invalid-argument', 'Kết quả thực hiện tối đa 1.000 ký tự.');
  }
  const text = note.trim();
  return editAssignedTask(request, async context => {
    const { task, id, transaction, db, email, now } = context;
    if (task.status === 'Chờ duyệt' || (task.status === 'Xong' && task.progress === 100 && task.doneAt)) return;
    if (!openStatuses.includes(task.status)) {
      throw new HttpsError('failed-precondition', 'Công việc này hiện không thể báo hoàn thành.');
    }
    const checklist = Array.isArray(task.checklist) ? task.checklist : [];
    if (checklist.some(item => item?.done !== true)) {
      throw new HttpsError('failed-precondition', 'Hãy đánh dấu xong tất cả việc con trước khi báo hoàn thành.');
    }
    if (!checklist.length && task.progress !== 100) {
      throw new HttpsError('failed-precondition', 'Đặt và lưu tiến độ 100% để báo hoàn thành.');
    }
    const settings = await transaction.get(db.collection('settings').doc('work'));
    if (settings.get('requireReportNote') === true && !text) {
      throw new HttpsError('failed-precondition', 'Hãy ghi kết quả thực hiện trước khi báo hoàn thành.');
    }
    const requiresReview = typeof task.requireReview === 'boolean'
      ? task.requireReview : settings.get('requireReview') !== false;
    const recipient = requiresReview ? task.approverEmail || task.assignedBy : task.assignedBy;
    const profile = isMemberEmail(recipient) && recipient !== email
      ? await transaction.get(db.collection('members').doc(recipient)) : undefined;
    if (profile && activeMember(profile) && (!requiresReview || !task.approverEmail || canReviewTasks(profile))) {
      writeTaskNotification(transaction, db, { from: email, to: recipient, taskId: id,
        title: requiresReview ? 'Có việc chờ duyệt' : 'Công việc đã hoàn thành',
        body: task.title, createdAt: now });
    }
    return {
      status: requiresReview ? 'Chờ duyệt' : 'Xong',
      progress: 100,
      doneAt: now,
      ...(text ? { comments: [...(task.comments ?? []), { by: email, at: now, text, files: [] }] } : {}),
    };
  });
});

exports.reviewTaskCompletion = onCall(request => {
  const { decision, rating, note, submission } = request.data ?? {};
  if (!['approve', 'rework'].includes(decision) || typeof submission !== 'string' ||
      typeof note !== 'string' || note.trim().length > 1000) {
    throw new HttpsError('invalid-argument', 'Thông tin duyệt không hợp lệ.');
  }
  const reviewNote = note.trim();
  if (decision === 'approve' && !reviewRatings.includes(rating)) {
    throw new HttpsError('invalid-argument', 'Chọn đánh giá kết quả trước khi duyệt.');
  }
  if (decision === 'rework' && !reviewNote) {
    throw new HttpsError('invalid-argument', 'Nhập nhận xét để người nhận biết cần làm lại phần nào.');
  }

  const access = assignmentContext(request, 'duyệt công việc');
  const canReview = (task, member) => task.approverEmail
    ? task.approverEmail === access.email && canReviewTasks(member)
    : task.assignedBy === access.email;
  return editTask(access, getTaskId(request.data?.taskId), canReview, async context => {
    const { task, id, transaction, db, email, now } = context;
    if (task.status !== 'Chờ duyệt' || (task.doneAt || task.updatedAt || '') !== submission) {
      throw new HttpsError('failed-precondition', 'Lượt gửi duyệt này đã thay đổi. Hãy mở lại công việc.');
    }
    writeTaskNotification(transaction, db, { from: email, to: task.assigneeEmail, taskId: id,
      title: decision === 'approve' ? 'Công việc đã được duyệt' : 'Công việc cần làm lại',
      body: task.title, createdAt: now });
    if (decision === 'approve') {
      return {
        status: 'Xong', progress: 100, doneAt: task.doneAt || now,
        rating, reviewNote, reviewedBy: email, reviewedAt: now,
      };
    }
    return {
      status: 'Đang làm', doneAt: '', rating: '', reviewNote, reviewedBy: '', reviewedAt: '',
      ...(Array.isArray(task.checklist) && task.checklist.length
        ? { progress: checklistProgress(task.checklist) } : {}),
    };
  });
});
