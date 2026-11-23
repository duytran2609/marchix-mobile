const emailPattern = /^[^\s/@]+@[^\s/@]+$/;

/** @param {(string | undefined)[]} values */
function members(values) {
  return new Set(values.filter(email => typeof email === 'string' && email.length <= 254 && emailPattern.test(email)));
}

/**
 * @typedef {{ title?: string, status?: string, assigneeEmail?: string, watchers?: string[], approverEmail?: string }} TaskRoles
 * @param {TaskRoles} before
 * @param {TaskRoles} after
 * @returns {{ to: string, title: string, body: string }[]}
 */
function taskRoleNotices(before, after) {
  const roles = [
    {
      previous: [before.assigneeEmail], current: [after.assigneeEmail],
      added: 'Bạn được giao việc mới', removed: 'Bạn không còn phụ trách thực hiện công việc',
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
    },
  ];
  const notices = [];
  for (const { previous, current, added, removed } of roles) {
    const oldMembers = members(previous);
    const newMembers = members(current);
    for (const to of newMembers) {
      if (!oldMembers.has(to)) notices.push({ to, title: added, body: after.title ?? '' });
    }
    for (const to of oldMembers) {
      if (!newMembers.has(to)) notices.push({ to, title: removed, body: before.title ?? '' });
    }
  }
  return notices;
}

module.exports = { taskRoleNotices };
