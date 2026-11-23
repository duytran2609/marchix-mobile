const { createHash } = require('node:crypto');

const pending = 'Chờ duyệt';
const isEmail = value => typeof value === 'string' && value.length <= 254 && /^[^\s/@]+@[^\s/@]+$/.test(value);
const active = member => member.exists && member.get('enabled') !== false;
const permitted = (member, grant) => member.get('role') === 'admin' ||
  (grant && Array.isArray(member.get('grants')) && member.get('grants').includes(grant));

function notification(from, to, title, body, link, createdAt) {
  return { from, to, title, body, link, createdAt, read: false, emailed: false };
}

function writeTaskNotification(transaction, db, { from, to, taskId, title, body, createdAt, includeSender = false }) {
  if (!isEmail(to) || (!includeSender && to === from)) return;
  transaction.create(db.collection('notifications').doc(), {
    ...notification(from, to, title, typeof body === 'string' ? body : '', '#cong-viec', createdAt),
    ...(taskId !== undefined && { taskId }),
  });
}

function workflowNotices(collection, id, before, after) {
  if (!after) return [];
  const changedStatus = before?.status !== after.status;
  const newReviewer = after.status === pending && (changedStatus || before?.approverEmail !== after.approverEmail);
  const actor = after.updatedBy || after.createdBy;
  const notice = (title, body, targets, link) => ({ actor, title, body, targets, link });
  const person = (email, grant) => ({ email, grant });

  if (collection === 'requests') {
    const link = '#don-tu/' + id;
    if (newReviewer) {
      return [notice('Có đơn từ chờ duyệt', 'Mở đơn để xem và xử lý.',
        [after.approverEmail ? person(after.approverEmail, 'requestReview') : {}], link)];
    }
    if (before?.status === pending && ['Đã duyệt', 'Từ chối'].includes(after.status)) {
      return [notice(after.status === 'Đã duyệt' ? 'Đơn của bạn đã được duyệt' : 'Đơn của bạn bị từ chối',
        'Mở đơn để xem kết quả.', [person(after.createdBy)], link)];
    }
  }

  if (collection === 'cash' && ['thu', 'chi'].includes(after.type)) {
    const link = '#thu-chi/' + id;
    if (newReviewer) {
      return [notice('Có đề nghị thu chi chờ duyệt', 'Mở chứng từ để duyệt hoặc phân công người duyệt.',
        [after.approverEmail ? person(after.approverEmail, 'cashReview') : {}], link)];
    }
    if (before && changedStatus && ['Chờ chi', 'Chờ thu', 'Từ chối', 'Đã chi', 'Đã thu'].includes(after.status)) {
      const waiting = ['Chờ chi', 'Chờ thu'].includes(after.status);
      const titles = {
        'Chờ chi': 'Đề nghị chi đã được duyệt', 'Chờ thu': 'Đề nghị thu đã được duyệt',
        'Từ chối': 'Đề nghị thu chi bị từ chối', 'Đã chi': 'Đã xác nhận chi', 'Đã thu': 'Đã xác nhận thu',
      };
      const result = [notice(titles[after.status], 'Mở chứng từ để xem trạng thái mới.', [person(after.createdBy)], link)];
      if (waiting && isEmail(after.approvedBy) && after.approvedBy !== after.createdBy) {
        result.unshift(notice('Có chứng từ cần xác nhận thu chi', 'Mở chứng từ để xác nhận giao dịch.',
          [{ grant: 'cashRecord' }], link));
      }
      return result;
    }
  }

  if (collection === 'payroll' && changedStatus && /^\d{4}-(0[1-9]|1[0-2])$/.test(after.month ?? '')) {
    const month = after.month.slice(5) + '/' + after.month.slice(0, 4);
    const link = '#luong/' + after.month;
    if (after.status === 'Đã chốt') return [notice('Phiếu lương đã được chốt', 'Kỳ lương ' + month, [person(after.email)], link)];
    if (after.status === 'Đã trả') return [notice('Phiếu lương đã được đánh dấu đã trả', 'Kỳ lương ' + month, [person(after.email)], link)];
  }

  return [];
}

async function publishWorkflowNotifications(db, collection, event) {
  const id = event.params.id;
  const notices = workflowNotices(collection, id, event.data?.before.data(), event.data?.after.data());
  if (!notices.length) return;
  const members = db.collection('members');
  const profiles = new Map();
  const recipients = new Map();
  const readProfile = email => {
    if (!profiles.has(email)) profiles.set(email, members.doc(email).get());
    return profiles.get(email);
  };

  for (const notice of notices) {
    for (const target of notice.targets) {
      if ('email' in target) {
        if (!isEmail(target.email) || target.email === notice.actor || recipients.has(target.email)) continue;
        const member = await readProfile(target.email);
        if (active(member) && (!target.grant || permitted(member, target.grant))) recipients.set(target.email, notice);
        continue;
      }
      const groups = [members.where('role', '==', 'admin').get()];
      if (target.grant) groups.push(members.where('grants', 'array-contains', target.grant).get());
      for (const group of await Promise.all(groups)) {
        for (const member of group.docs) {
          if (isEmail(member.id) && active(member) && member.id !== notice.actor && !recipients.has(member.id)) {
            recipients.set(member.id, notice);
          }
        }
      }
    }
  }
  await Promise.all([...recipients].map(async ([to, notice]) => {
    const key = createHash('sha256').update(JSON.stringify([event.source, event.id, collection, id, to])).digest('hex');
    try {
      await db.collection('notifications').doc('workflow_' + key).create(
        notification(notice.actor || '', to, notice.title, notice.body, notice.link, event.time));
    } catch (error) {
      if (error?.code !== 6) throw error;
    }
  }));
}

module.exports = { publishWorkflowNotifications, writeTaskNotification };
