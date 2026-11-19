const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/dropdownPosition.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: exportsObject });
const position = (values) => exportsObject.attachedMenuPosition({
  anchorTop: 500, anchorHeight: 44, top: 32, bottom: 780, gap: 4, maxHeight: 274, ...values,
});
test('Android bottom pagination opens above, adjacent to trigger, not clipped at screen bottom', () => {
  const menu = position({ anchorTop: 720 });
  assert.equal(menu.top + menu.height, 716);
  assert.equal(menu.height, 274);
});
test('menu remains below when all choices fit', () => {
  const menu = position({ anchorTop: 200 });
  assert.equal(menu.top, 248);
  assert.equal(menu.height, 274);
});
test('short viewport constrains menu to safe area, with scrolling available', () => {
  const menu = position({ anchorTop: 160, bottom: 300 });
  assert.ok(menu.top >= 32);
  assert.ok(menu.top + menu.height <= 300);
  assert.ok(menu.height > 0 && menu.height < 274);
});
