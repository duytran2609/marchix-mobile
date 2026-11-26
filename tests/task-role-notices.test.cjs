const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');
const ts = require('typescript');
const { taskChangeNotices } = require('../functions/taskChangeNotices');

test('watcher ordering, duplicate entries and missing legacy roles do not create notifications', () => {
  const first = 'first@example.test';
  const second = 'second@example.test';
  assert.deepEqual(taskChangeNotices({ watchers: [first, second, first] }, { watchers: [second, first] }), []);
  assert.deepEqual(taskChangeNotices({}, { watchers: [], approverEmail: '', assigneeEmail: '', due: '' }), []);
  assert.deepEqual(taskChangeNotices({ title: 'Demo', approverEmail: first }, { title: 'New demo', approverEmail: '' }),
    [{ to: first, title: 'Bạn không còn là người duyệt công việc',
      body: `Công việc: New demo\nNgười duyệt: ${first} → Chưa chỉ định` }]);
});

test('deadline changes include old and new dates and notify the current assignee and pending reviewer', () => {
  const task = { title: 'Demo', assigneeEmail: 'staff@example.test', approverEmail: 'reviewer@example.test', status: 'Chờ duyệt' };
  const deadline = '2026-11-28';
  assert.deepEqual(taskChangeNotices(task, { ...task, due: deadline }), [task.assigneeEmail, task.approverEmail].map(to => ({
    to, title: 'Hạn công việc đã thay đổi', body: 'Công việc: Demo\nHạn: Chưa đặt hạn → 28/11/2026',
  })));
  assert.deepEqual(taskChangeNotices({ ...task, due: deadline }, { ...task, due: '', status: 'Đang làm' }), [{
    to: task.assigneeEmail, title: 'Hạn công việc đã thay đổi', body: 'Công việc: Demo\nHạn: 28/11/2026 → Chưa đặt hạn',
  }]);
});

for (const canListMembers of [true, false]) {
  test(`Pilot changes a pending approver and notifies both approvers (${canListMembers ? 'Firestore' : 'callable'} directory)`, async () => {
    const assigner = 'assigner@example.test';
    const newApprover = 'reviewer@example.test';
    const revision = '2026-11-01T00:00:00.000Z';
    const before = { title: 'Demo', status: 'Chờ duyệt', assignedBy: assigner, approverEmail: assigner,
      assigneeEmail: 'staff@example.test', updatedAt: revision };
    const writes = [];
    const ref = { id: 'task-1', path: 'tasks/task-1' };
    const db = {};
    const firestore = {
      collection: (_, name) => name,
      doc: (parent, name, id) => name === 'tasks' ? ref : { path: name ?? parent, id },
      getDocsFromServer: async name => {
        if (name === 'projects') return { docs: [] };
        if (!canListMembers) throw Object.assign(new Error('Permission denied'), { code: 'permission-denied' });
        return { docs: [{
          id: newApprover, get: () => true, data: () => ({ name: 'Người duyệt', grants: ['taskReview'] }),
        }] };
      },
      runTransaction: (_, callback) => callback({
        get: async destination => {
          if (destination === ref) return { data: () => before };
          assert(canListMembers);
          assert.equal(destination.id, newApprover);
          return { data: () => ({ grants: ['taskReview'] }) };
        },
        set: (destination, value) => writes.push({ destination, value }),
        update: (destination, value) => writes.push({ destination, value }),
      }),
    };
    const exports = {};
    const mocks = {
      'firebase/firestore': firestore,
      'firebase/functions': { httpsCallable: (_, name) => async () => {
        assert.equal(name, 'listMobileTaskAssignees');
        assert(!canListMembers);
        return { data: { members: [{ email: newApprover, name: 'Người duyệt', canReview: true }], projects: [] } };
      } },
      '../../../functions/taskChangeNotices': { taskChangeNotices },
      '../../services/firebase/firebase': { auth: { currentUser: { email: assigner, emailVerified: true } },
        db, taskAssignmentEnabled: true },
      './checklistProgress': {},
    };
    const source = readFileSync(require.resolve('../src/features/tasks/pilotTasks.ts'), 'utf8');
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    runInNewContext(outputText, { exports, require: name => mocks[name] });
    const { data } = await exports.pilotDirectory();
    assert.equal(data.members[0].email, newApprover);
    assert.equal(data.members[0].canReview, true);
    await exports.pilotUpdate({
      taskId: ref.id, assigneeEmails: [before.assigneeEmail], approverEmail: newApprover, revision, retainedFileIds: [],
      title: before.title, note: '', message: '', watchers: [],
    });
    assert.equal(writes.length, 4);
    const body = `Công việc: Demo\nNgười duyệt: ${assigner} → Người duyệt (${newApprover})`;
    assert.deepEqual(writes.slice(0, 3).map(({ destination, value }) => [destination.path, value.to, value.title, value.body, value.taskId]), [
      ['notifications', newApprover, 'Công việc chờ bạn duyệt', body, ref.id],
      ['notifications', assigner, 'Bạn không còn là người duyệt công việc', body, ref.id],
      ['notifications', before.assigneeEmail, 'Người duyệt công việc đã thay đổi', body, ref.id],
    ]);
    assert.equal(writes[3].destination, ref);
    assert.equal(writes[3].value.approverEmail, newApprover);
  });
}
