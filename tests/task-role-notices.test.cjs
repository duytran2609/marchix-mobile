const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');
const ts = require('typescript');
const { taskRoleNotices } = require('../functions/taskRoleNotices');

test('watcher ordering, duplicate entries and missing legacy roles do not create notifications', () => {
  const first = 'first@example.test';
  const second = 'second@example.test';
  assert.deepEqual(taskRoleNotices({ watchers: [first, second, first] }, { watchers: [second, first] }), []);
  assert.deepEqual(taskRoleNotices({}, { watchers: [], approverEmail: '', assigneeEmail: '' }), []);
  assert.deepEqual(taskRoleNotices({ title: 'Demo', approverEmail: first }, { title: 'New demo', approverEmail: '' }),
    [{ to: first, title: 'Bạn không còn là người duyệt công việc', body: 'Demo' }]);
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
      '../../../functions/taskRoleNotices': { taskRoleNotices },
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
    assert.equal(writes.length, 3);
    assert.deepEqual(writes.slice(0, 2).map(({ destination, value }) => [destination.path, value.to, value.title, value.taskId]), [
      ['notifications', newApprover, 'Công việc chờ bạn duyệt', ref.id],
      ['notifications', assigner, 'Bạn không còn là người duyệt công việc', ref.id],
    ]);
    assert.equal(writes[2].destination, ref);
    assert.equal(writes[2].value.approverEmail, newApprover);
  });
}
