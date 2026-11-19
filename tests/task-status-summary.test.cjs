const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(`src/features/tasks/${file}.ts`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports, require: name => mocks[name] });
  return exports;
}
const statuses = load('taskStatuses');
const { taskStatusSummary } = load('taskStatusSummary', { './taskStatuses': statuses });
const plain = value => JSON.parse(JSON.stringify(value));
const counts = rows => Object.fromEntries(taskStatusSummary(rows).map(row => [row.status, row.tasks.length]));
test('canonical statuses include zero counts and completed tasks, independent of due date', () => {
  assert.deepEqual(counts([{ id: '1', status: 'Xong' }, { id: '2', status: 'Vướng', due: '2000-01-01' }]),
    { 'Chưa làm': 0, 'Đang làm': 0, 'Vướng': 1, 'Chờ duyệt': 0, 'Xong': 1 });
});
test('received/sent duplicate ID counts once and status updates move exactly one item', () => {
  const rows = [{ id: '1', status: 'Chưa làm' }, { id: '1', status: 'Đang làm' }];
  const result = counts(rows);
  assert.equal(result['Chưa làm'], 0); assert.equal(result['Đang làm'], 1);
  assert.equal(Object.values(result).reduce((a, b) => a + b, 0), 1);
  assert.equal(counts([{ id: '1', status: 'Xong' }]).Xong, 1);
});
test('missing status matches board fallback and unknown/stale statuses count under Khác', () => {
  const result = counts([{ id: 'a', status: '' }, { id: 'b', status: 'Legacy' }, { id: 'c', status: 'Khác' }]);
  assert.equal(result['Chưa làm'], 1); assert.equal(result['Khác'], 2);
  assert.equal(counts([])['Khác'], undefined);
});
test('summary follows supplied canonical configuration order without duplicate groups', () => {
  const rows = [{ id: 'a', status: 'New' }, { id: 'b', status: 'Old' }];
  assert.deepEqual(plain(taskStatusSummary(rows, ['New', 'Zero', 'New']).map(x => [x.status, x.tasks.length])),
    [['New', 1], ['Zero', 0], ['Khác', 1]]);
  assert.deepEqual(plain(taskStatusSummary(rows, ['Old']).map(x => [x.status, x.tasks.length])), [['Old', 1], ['Khác', 1]]);
});
