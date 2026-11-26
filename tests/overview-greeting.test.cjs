const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const output = {};
const dateHelpers = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/features/tasks/taskDates.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: dateHelpers });
const morning = '2026-11-25T05:00:00+07:00';
class MorningDate extends Date {
  constructor(value = morning) { super(value); }
}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/OverviewGreeting.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText, { exports: output, Date: MorningDate, require: name => ({
  react: { useEffect: () => {}, useState: initial => [initial()] },
  'react-native': { Text: 'Text', View: 'View', StyleSheet: { create: value => value } },
  '../theme/theme': { useTheme: () => ({ dark: false }) },
  '../features/tasks/taskDates': dateHelpers,
  'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'Fragment' },
})[name] });

test('Vietnam time chooses the correct period and schedules its next boundary', () => {
  for (const [time, period, delay] of [
    ['00:00:00.000', 'evening', 5 * 3_600_000],
    ['04:59:59.999', 'evening', 1],
    ['05:00:00.000', 'morning', 7 * 3_600_000],
    ['11:59:59.999', 'morning', 1],
    ['12:00:00.000', 'afternoon', 6 * 3_600_000],
    ['17:59:59.999', 'afternoon', 1],
    ['18:00:00.000', 'evening', 11 * 3_600_000],
    ['23:59:59.999', 'evening', 5 * 3_600_000 + 1],
  ]) {
    const actual = output.overviewGreetingTime(new Date(`2026-11-25T${time}+07:00`));
    assert.equal(actual.period, period, time);
    assert.equal(actual.delay, delay, time);
    assert.equal(actual.midnightDelay, Date.parse('2026-11-26T00:00:00+07:00') - Date.parse(`2026-11-25T${time}+07:00`));
  }
});

test('daily quotes are stable in Vietnam time and distinct within each shuffled week', () => {
  const start = Date.parse('2026-11-23T00:00:00+07:00');
  const day = 86_400_000;
  const weeks = [];
  let previous;
  for (let week = 0; week < 12; week++) {
    const texts = [];
    for (let weekday = 0; weekday < 7; weekday++) {
      const first = start + (week * 7 + weekday) * day;
      const quote = output.overviewQuote(new Date(first));
      assert.equal(output.overviewQuote(new Date(first + day - 1)), quote);
      assert.notEqual(quote, previous);
      previous = quote;
      texts.push(quote.text);
    }
    assert.equal(new Set(texts).size, 7);
    weeks.push(texts);
  }
  for (let weekday = 0; weekday < 7; weekday++) {
    const quotes = weeks.map(week => week[weekday]);
    assert.ok(new Set(quotes).size > 1);
  }
});

test('long names remain complete with wrapping, no truncation or fixed height', () => {
  const name = 'Nguyễn Thị Hoàng Anh Minh Châu';
  const { props } = output.OverviewGreeting({ name: `  ${name}  `, email: 'demo@example.test' }).props.children[1];
  const [label, separator, highlighted, punctuation] = props.children.props.children;
  assert.equal(label + separator, 'Chào buổi sáng, ');
  assert.equal(highlighted.props.children, name);
  assert.equal(punctuation, '!');
  assert.equal(props.style[0].fontWeight, '400');
  assert.equal(highlighted.props.style[0].fontWeight, '800');
  assert.notEqual(highlighted.props.style[1].color, props.style[1].color);
  assert.equal(props.numberOfLines, undefined);
  assert.equal(props.style[0].height, undefined);
  assert.equal(props.style[0].width, '100%');
  assert.equal(props.accessibilityRole, 'header');
});

test('missing name or session email fallback gets neutral greeting', () => {
  for (const name of ['', '  ', null, undefined, 42, 'duy@example.test']) {
    const { props } = output.OverviewGreeting({ name, email: 'duy@example.test' }).props.children[1];
    assert.equal(props.children, 'Chào buổi sáng!');
  }
});
