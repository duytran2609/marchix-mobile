const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const output = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/OverviewGreeting.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText, { exports: output, require: name => ({
  'react-native': { Text: 'Text', StyleSheet: { create: value => value } },
  '../theme/theme': { createThemedStyles: fn => () => fn({ ink: '#000' }) },
  'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
})[name] });
test('greeting uses full trimmed Vietnamese name', () => {
  assert.equal(output.overviewGreeting('  Trần Đăng Duy  ', 'duy@example.test'), 'Xin chào, Trần Đăng Duy!');
});
test('missing name or session email fallback gets neutral greeting', () => {
  for (const name of ['', '  ', null, undefined, 42, 'duy@example.test']) {
    assert.equal(output.overviewGreeting(name, 'duy@example.test'), 'Xin chào!');
  }
});
test('long names remain complete with wrapping, no truncation or fixed height', () => {
  const name = 'Nguyễn Thị Hoàng Anh Minh Châu';
  const { props } = output.OverviewGreeting({ name, email: 'demo@example.test' });
  assert.equal(props.children, `Xin chào, ${name}!`);
  assert.equal(props.numberOfLines, undefined);
  assert.equal(props.style.height, undefined);
  assert.equal(props.style.width, '100%');
  assert.equal(props.accessibilityRole, 'header');
});
