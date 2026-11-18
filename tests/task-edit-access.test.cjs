const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const exportsObject = {};
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/features/tasks/taskEditAccess.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(code, { exports: exportsObject });
const { taskEditBlockReason } = exportsObject;
const email = 'assigner@example.test';

test('enabled assigner can edit non-completed tasks, including pending review', () => {
  for (const status of ['Chưa làm', 'Đang làm', 'Vướng', 'Chờ duyệt']) {
    assert.equal(taskEditBlockReason({ status, assignedBy: email }, email, true), undefined);
  }
});

test('read-only details explain completed tasks and disabled builds', () => {
  assert.equal(taskEditBlockReason({ status: 'Xong', assignedBy: email }, email, true),
    'Công việc đã xong, chỉ có thể xem chi tiết.');
  assert.equal(taskEditBlockReason({ status: 'Đang làm', assignedBy: email }, email, false),
    'Bản ứng dụng này chưa bật chỉnh sửa công việc.');
});

test('receiver, unrelated user, missing assigner and empty session never gain edit access', () => {
  for (const [assignedBy, viewer] of [[email, 'receiver@example.test'], [email, 'admin@example.test'],
    [undefined, email], ['', '']]) {
    assert.equal(taskEditBlockReason({ status: 'Đang làm', assignedBy }, viewer, true),
      'Chỉ người giao việc mới được chỉnh sửa công việc này.');
  }
});
