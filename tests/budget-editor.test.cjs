// Isolated component-handler regressions: no React renderer, Firebase, or live data.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const projectDir = path.join(__dirname, '../src/features/projects');
function load(file, mocks = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(projectDir, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { exports, require(name) {
    if (name in mocks) return mocks[name];
    throw new Error(`Unexpected dependency: ${name}`);
  } });
  return exports;
}
const math = load('financeMath.js');
function editor(line) {
  const states = [];
  let cursor = 0, saved;
  const jsx = (type, props) => ({ type, props });
  const { BudgetLineEditor } = load('FinanceEditors.tsx', {
    react: { useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    } },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { Text: 'Text', TextInput: 'TextInput', View: 'View' },
    '../../components/Button': { Button: 'Button' },
    '../../components/Dropdown': { Dropdown: 'Dropdown' },
    '../../components/NumberStepper': { NumberStepper: 'NumberStepper' },
    '../../theme/screenStyles': { useScreenStyles: () => ({}) },
    '../tasks/CalendarDialog': { DateCalendarField: 'Date' },
    './financeMath': math,
  });
  function nodes(node) {
    if (!node || typeof node !== 'object') return [];
    return [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
  }
  function field(label) {
    cursor = 0;
    const tree = BudgetLineEditor({ line, categories: [], busy: false, onSave: value => { saved = value; }, onCancel() {} });
    const match = nodes(tree).find(node => node.props?.label === label);
    assert.ok(match, `Visible control: ${label}`);
    return match.props;
  }
  return {
    change: (label, value) => field(label).onChange(value),
    value: label => field(label).value,
    press: label => field(label).onPress(),
    save() { field('Ghi lại dự toán').onPress(); return saved; },
  };
}
const advanced = 'Nhập chi tiết VAT, báo giá và dự báo';
const simple = 'Nhập số tiền tổng';
const fixture = {
  code: 'DT-FAKE', name: 'Dữ liệu kiểm thử', category: 'Thiết bị', nature: 'Chi phí',
  quantity: 2, unit: 100000, unitLabel: 'cái', fees: 10000,
  taxMode: 'Chưa gồm thuế GTGT', vatMethod: 'rate', vatRate: 10,
  quote: 'Báo giá giả', quoteDate: '2026-11-16', reviewUnit: 120000, reviewSource: 'Kiểm thử',
};
for (const [input, amount] of [['500000', 500000], ['0', 0], ['', null]]) {
  test(`simple to detailed preserves amount ${JSON.stringify(input)}`, () => {
    const form = editor();
    form.change('Số tiền tổng (đ)', input);
    form.press(advanced);
    assert.equal(math.lineTotal(form.save()), amount);
  });
}
test('detailed edits survive simple-mode save, including VAT and supporting fields', () => {
  const form = editor(fixture);
  form.press(advanced);
  form.change('Đơn giá (đ)', '200000');
  form.change('Căn cứ báo giá', 'Báo giá mới');
  form.press(simple);
  assert.equal(form.value('Số tiền tổng (đ)'), '450.000');
  const saved = form.save();
  assert.equal(math.lineTotal(saved), 450000);
  assert.equal(saved.unit, 200000);
  assert.equal(saved.quantity, 2);
  assert.equal(saved.vatRate, 10);
  assert.equal(saved.quote, 'Báo giá mới');
  assert.equal(saved.quoteDate, fixture.quoteDate);
  assert.equal(saved.reviewUnit, fixture.reviewUnit);
});
test('round trips without a total change preserve the detailed breakdown', () => {
  const form = editor(fixture);
  for (let i = 0; i < 3; i++) { form.press(advanced); form.press(simple); }
  const saved = form.save();
  for (const key of Object.keys(fixture)) assert.equal(saved[key], fixture[key], key);
});
test('an explicitly changed lump sum replaces stale breakdown in either save mode', () => {
  for (const toggle of [false, true]) {
    const form = editor(fixture);
    form.press(advanced);
    form.change('Đơn giá (đ)', '200000');
    form.press(simple);
    form.change('Số tiền tổng (đ)', '500000');
    if (toggle) form.press(advanced);
    const saved = form.save();
    assert.equal(math.lineTotal(saved), 500000);
    assert.equal(saved.quantity, 1);
    assert.equal(saved.fees, 0);
    assert.equal(saved.vatRate, null);
    assert.equal(saved.reviewUnit, null);
    assert.equal(saved.quote, fixture.quote);
  }
});
test('same-total detailed edits are not replaced by the original line', () => {
  const form = editor(fixture);
  form.press(advanced);
  form.change('Số lượng', '1');
  form.change('Đơn giá (đ)', '200000');
  form.press(simple);
  const saved = form.save();
  assert.equal(math.lineTotal(saved), math.lineTotal(fixture));
  assert.equal(saved.quantity, 1);
  assert.equal(saved.unit, 200000);
});
test('incomplete VAT draft stays incomplete rather than becoming a zero amount', () => {
  const form = editor(fixture);
  form.press(advanced);
  form.change('Thuế suất (%)', '');
  form.press(simple);
  assert.equal(form.value('Số tiền tổng (đ)'), '');
  form.press(advanced);
  const saved = form.save();
  assert.equal(saved.unit, 100000);
  assert.equal(saved.vatRate, null);
  assert.equal(math.lineTotal(saved), null);
});
test('manual VAT and fees survive detailed to simple save', () => {
  const form = editor({ ...fixture, vatMethod: 'manual', vat: 30000, vatRate: null });
  form.press(advanced);
  form.change('Tiền VAT (đ)', '40000');
  form.change('Phí khác (đ)', '20000');
  form.press(simple);
  assert.equal(form.value('Số tiền tổng (đ)'), '260.000');
  const saved = form.save();
  assert.equal(saved.vat, 40000);
  assert.equal(saved.fees, 20000);
  assert.equal(saved.vatMethod, 'manual');
});
test('clearing or zeroing an existing total carries through mode switches', () => {
  for (const [input, amount] of [['', null], ['0', 0]]) {
    const form = editor(fixture);
    form.change('Số tiền tổng (đ)', input);
    form.press(advanced);
    form.press(simple);
    assert.equal(math.lineTotal(form.save()), amount);
  }
});
