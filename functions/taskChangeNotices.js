const emailPattern = /^[^\s/@]+@[^\s/@]+$/;

/** @param {(string | undefined)[]} values */
function members(values) {
  return new Set(values.filter(email => typeof email === 'string' && email.length <= 254 && emailPattern.test(email)));
}

/**
 * @typedef {{ title?: string, status?: string, assignee?: string, assigneeEmail?: string, watchers?: string[],
 *   approverEmail?: string, due?: string }} TaskDetails
 * @param {TaskDetails} before
 * @param {TaskDetails} after
 * @param {(email: string) => string | undefined} [nameForEmail]
 * @returns {{ to: string, title: string, body: string }[]}
 */
function taskChangeNotices(before, after, nameForEmail = () => undefined) {
  /** @param {string | undefined} email @param {string} unset @param {string} [savedName] */
  function person(email, unset, savedName) {
    if (!email) return unset;
    const candidate = nameForEmail(email) || savedName;
    const name = typeof candidate === 'string' ? candidate.trim() : '';
    return name && name !== email ? `${name} (${email})` : email;
  }

  const task = `Công việc: ${after.title || before.title || 'Chưa có tên'}`;
  const assigneeChange = `Người thực hiện: ${person(before.assigneeEmail, 'Chưa giao', before.assignee)} → ` +
    person(after.assigneeEmail, 'Chưa giao', after.assignee);
  const approverChange = `Người duyệt: ${person(before.approverEmail, 'Chưa chỉ định')} → ` +
    person(after.approverEmail, 'Chưa chỉ định');
  const roles = [
    {
      previous: [before.assigneeEmail], current: [after.assigneeEmail],
      added: 'Bạn là người thực hiện mới', removed: 'Bạn không còn phụ trách thực hiện công việc',
      detail: assigneeChange,
    },
    {
      previous: Array.isArray(before.watchers) ? before.watchers : [],
      current: Array.isArray(after.watchers) ? after.watchers : [],
      added: 'Bạn được thêm làm người theo dõi công việc', removed: 'Bạn không còn theo dõi công việc',
    },
    {
      previous: [before.approverEmail], current: [after.approverEmail],
      added: after.status === 'Chờ duyệt' ? 'Công việc chờ bạn duyệt' : 'Bạn được chỉ định duyệt công việc',
      removed: 'Bạn không còn là người duyệt công việc',
      detail: approverChange,
    },
  ];
  const notices = [];
  for (const { previous, current, added, removed, detail } of roles) {
    const oldMembers = members(previous);
    const newMembers = members(current);
    for (const to of newMembers) {
      if (!oldMembers.has(to)) notices.push({ to, title: added, body: detail ? `${task}\n${detail}` : after.title ?? '' });
    }
    for (const to of oldMembers) {
      if (!newMembers.has(to)) notices.push({ to, title: removed, body: detail ? `${task}\n${detail}` : before.title ?? '' });
    }
  }
  if ((before.approverEmail || '') !== (after.approverEmail || '')) {
    for (const to of members([after.assigneeEmail])) {
      if (to !== before.approverEmail && to !== after.approverEmail) {
        notices.push({ to, title: 'Người duyệt công việc đã thay đổi', body: `${task}\n${approverChange}` });
      }
    }
  }

  if ((before.due || '') !== (after.due || '')) {
    const formatDue = (/** @type {string | undefined} */ due) => typeof due === 'string' && due
      ? due.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1') : 'Chưa đặt hạn';
    const recipients = members([after.assigneeEmail, after.status === 'Chờ duyệt' ? after.approverEmail : undefined]);
    for (const to of recipients) {
      notices.push({ to, title: 'Hạn công việc đã thay đổi',
        body: `${task}\nHạn: ${formatDue(before.due)} → ${formatDue(after.due)}` });
    }
  }
  return notices;
}

module.exports = { taskChangeNotices };
