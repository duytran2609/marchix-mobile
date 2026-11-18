const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function setup(platform) {
  let revealed = 0, measured = 0, dismissed = 0, currentAnchor;
  const exportsObject = {};
  const mocks = {
    react: { useContext: () => () => { revealed++; }, useEffect() {}, useRef: () => ({ current: undefined }),
      useState: () => [null, value => { currentAnchor = value; }] },
    'react-native': { Platform: { OS: platform }, Keyboard: { dismiss() { dismissed++; } }, StyleSheet: { create: x => x } },
    'react-native-safe-area-context': {}, './KeyboardScrollView': {}, './KeyboardViewport': {}, './Toast': {},
    './dropdownPosition': {}, 'react/jsx-runtime': {},
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/DropdownOverlay.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports: exportsObject, require: name => {
    assert.ok(name in mocks, name); return mocks[name];
  } });
  const hook = exportsObject.useDropdownAnchor(230);
  hook.trigger.current = { measureInWindow(callback) { measured++; callback(20, 720, 112, 44); } };
  return { hook, values: () => ({ revealed, measured, dismissed, currentAnchor }) };
}
for (const platform of ['android', 'ios']) test(`${platform}: page-size menu measures stationary trigger without racing native scroll`, () => {
  const { hook, values } = setup(platform);
  hook.open();
  assert.equal(values().revealed, 0);
  assert.equal(values().measured, 1);
  assert.equal(values().currentAnchor.y, 720);
  hook.close();
  assert.equal(values().currentAnchor, null);
  hook.open();
  assert.equal(values().measured, 2);
});
test('web retains scroll reservation before measuring attached menu', () => {
  const { hook, values } = setup('web');
  hook.open();
  assert.equal(values().revealed, 1);
  assert.equal(values().measured, 0);
});
