const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const source = readFileSync(require.resolve('../src/utils/attachmentFile.ts'), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: false },
});

function androidSave({ createFile, unlink, write, savedBytes }) {
  class File {
    constructor(uri) {
      this.uri = uri;
    }
    write(bytes) {
      return write(this.uri, bytes);
    }
    async bytes() {
      return savedBytes;
    }
  }
  const mocks = {
    'react-native': { Platform: { OS: 'android', Version: 30 } },
    'expo-file-system': { File },
    'expo-sharing': {},
    'react-native-blob-util': { media: { createFile }, fs: { unlink } },
  };
  const exports = {};
  vm.runInNewContext(outputText, { exports, require: name => mocks[name] });
  return exports.saveAttachment;
}

const uri = 'content://media/external/downloads/1';
const bytes = Uint8Array.of(1, 2, 3);
const file = { name: 'Phiếu / thu.csv', type: 'application/octet-stream', bytes };

test('Android creates a user-visible download and writes the original bytes', async () => {
  const save = androidSave({
    async createFile(descriptor, collection) {
      assert.equal(descriptor.name, 'Phiếu _ thu.csv');
      assert.equal(descriptor.mimeType, 'text/csv');
      assert.equal(collection, 'Download');
      return uri;
    },
    async write(destination, data) {
      assert.equal(destination, uri);
      assert.equal(data, bytes);
    },
    savedBytes: bytes,
  });
  assert.equal(await save(file), 'Đã lưu tệp vào thư mục Tải xuống.');
});

test('Android removes an incomplete download and reports a save failure', async () => {
  const removed = [];
  const save = androidSave({
    async createFile() { return uri; },
    async write() {},
    async unlink(destination) { removed.push(destination); },
    savedBytes: bytes.subarray(0, 1),
  });
  await assert.rejects(save(file), /không đủ dữ liệu/);
  assert.deepEqual(removed, [uri]);
});
