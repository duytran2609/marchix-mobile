const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, require(name) {
    if (name in mocks) return mocks[name];
    throw Error('Unexpected dependency: ' + name);
  } });
  return exports;
}
const helpers = load('features/notifications/projectMention.ts');
const { pilotProjectMentionId, notificationProjectId } = helpers;
const suffix = 'AbCdEf1234567890GhIj';
const legacy = { title: 'Bạn được nhắc trong dự án', link: '#du-an' };

test('Pilot IDs round-trip ASCII, Unicode, punctuation and separate recipients', () => {
  for (const id of ['project-2', 'Dự-án-Đà-Nẵng', '项目.预算', 'a.b_%~!🚀']) {
    const first = pilotProjectMentionId(id, suffix);
    const second = pilotProjectMentionId(id, 'ZbCdEf1234567890GhIj');
    assert.notEqual(first, second);
    assert.equal(notificationProjectId(legacy, first), id);
    assert.equal(notificationProjectId(legacy, second), id);
    assert(first.length < 1500);
    assert(!first.includes('/'));
  }
});
test('malformed, ambiguous and unrelated IDs never redirect to a project', () => {
  for (const id of ['.', '..', 'a/b', 'has space', '', 'a\nb']) {
    assert.throws(() => pilotProjectMentionId(id, suffix));
    assert.equal(notificationProjectId({ ...legacy, kind: 'projectMention', projectId: id }, 'legacy'), undefined);
  }
  for (const encoded of ['%2F', '%2e%2e', '%ZZ', '', '%C0%AF', 'a%20b']) {
    assert.equal(notificationProjectId(legacy, `project-mention.v1.${encoded}.${suffix}`), undefined);
  }
  assert.throws(() => pilotProjectMentionId('a'.repeat(1401), suffix));
  assert.throws(() => pilotProjectMentionId('project', 'short'));
  assert.equal(notificationProjectId(legacy, 'legacy-auto-id'), undefined);
  const id = pilotProjectMentionId('project-2', suffix);
  assert.equal(notificationProjectId({ ...legacy, link: '#cong-viec' }, id), undefined);
  assert.equal(notificationProjectId({ ...legacy, title: 'Other notification' }, id), undefined);
  assert.equal(notificationProjectId(legacy, id.replace('.v1.', '.v2.')), undefined);
});
test('existing structured notifications retain their project target', () => {
  assert.equal(notificationProjectId({ kind: 'projectMention', projectId: 'existing-project' }, 'old'), 'existing-project');
});

for (const pilotMode of [true, false]) {
  test(`publish and read project mention in ${pilotMode ? 'Pilot legacy' : 'emulator structured'} mode`, async () => {
    const written = [];
    let sequence = 0;
    const firestore = {
      collection: (_parent, ...parts) => ({ parts }),
      doc: (parent, ...parts) => ({ id: parts.length ? parts.at(-1) : String(++sequence).padStart(20, 'A') }),
      writeBatch: () => ({ set() {}, commit: async () => {} }),
      serverTimestamp: () => 'fake-time',
      setDoc: async (ref, data) => { written.push({ ref, data }); },
    };
    const store = load('features/projects/projectCollaborationStore.ts', {
      'firebase/firestore': firestore,
      '@noble/hashes/sha2.js': {}, '@noble/hashes/utils.js': {},
      '../../services/firebase/firebase': { db: {}, pilotMode },
      '../notifications/projectMention': helpers,
      '../cash/cashAttachments': { prepareCashFiles: async () => [], writeScopedFiles: () => [] },
    });
    assert.equal(await store.publishProjectPost('ZZ-target-project', 'sender@example.test', {
      title: 'Fake post', body: 'Fake body', kind: 'Cập nhật', taskId: '',
      mentions: ['recipient@example.test', 'second@example.test', 'recipient@example.test', 'sender@example.test'],
    }), 0);
    assert.equal(written.length, 2);
    assert.notEqual(written[0].ref.id, written[1].ref.id);
    for (const note of written) {
      assert.equal(note.data.link, '#du-an'); // Web accepts this exact link only.
      if (pilotMode) {
        assert.deepEqual(Object.keys(note.data).sort(), ['to', 'from', 'title', 'body', 'link', 'createdAt', 'read', 'emailed'].sort());
        assert.equal(note.data.body, 'Mở mục Trao đổi & tài liệu để xem nội dung.');
      } else {
        assert.equal(note.data.kind, 'projectMention');
        assert.equal(note.data.projectId, 'ZZ-target-project');
        assert(note.data.postId);
      }
      const reader = load('features/notifications/notifications.ts', {
        'firebase/firestore': { ...firestore, getDocFromServer: async () => ({
          id: note.ref.id, exists: () => true, data: () => note.data, get: key => note.data[key],
        }) },
        '../../services/firebase/firebase': { db: {} }, './projectMention': helpers,
      });
      const read = await reader.loadNotification(note.ref.id, note.data.to);
      assert.equal(read.projectId, 'ZZ-target-project');
      assert.equal(await reader.loadNotification(note.ref.id, 'outsider@example.test'), undefined);
    }
  });
}
