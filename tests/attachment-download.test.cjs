const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const source = readFileSync(require.resolve('../src/utils/attachmentFile.ts'), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: false },
});

const cache = 'file:///cache';
const uri = 'content://media/external_primary/downloads/1';
const bytes = Uint8Array.of(0x50, 0x4b, 3, 4);
const file = { name: 'Mô tả / hệ thống.docx', type: 'application/octet-stream', bytes };
const docxType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function androidSave({ createFile, copy, stat, unlink, pickDirectory, write }) {
  class File {
    constructor(folder, name) {
      this.uri = `${folder.uri}/${name}`;
    }
    write(bytes) {
      return write(this.uri, bytes);
    }
  }
  const mocks = {
    'react-native': { Platform: { OS: 'android', Version: 30 } },
    'expo-file-system': { Directory: { pickDirectoryAsync: pickDirectory }, File, Paths: { cache: { uri: cache } } },
    'expo-sharing': {},
    'react-native-blob-util': { media: { createFile }, fs: { cp: copy, stat, unlink } },
  };
  const exports = {};
  vm.runInNewContext(outputText, { exports, Error, require: name => mocks[name] });
  return exports.saveAttachment;
}

test('Android copies a DOCX into Downloads using its original bytes and inferred type', async () => {
  let cachedFile;
  const removed = [];
  const save = androidSave({
    async createFile(descriptor, collection) {
      assert.equal(descriptor.name, 'Mô tả _ hệ thống.docx');
      assert.equal(descriptor.mimeType, docxType);
      assert.equal(collection, 'Download');
      return uri;
    },
    async write(destination, data) {
      assert.match(destination, /^file:\/\/\/cache\/attachment-/);
      assert.equal(data, bytes);
      cachedFile = destination;
    },
    async copy(source, destination) {
      assert.equal(destination, uri);
      assert.equal(source, cachedFile);
    },
    async stat(destination) {
      assert.equal(destination, uri);
      return { size: bytes.length };
    },
    async unlink(destination) { removed.push(destination); },
  });
  assert.equal(await save(file), 'Đã lưu tệp vào thư mục Tải xuống.');
  assert.deepEqual(removed, [cachedFile]);
});

test('Android removes an incomplete download and saves to the folder the user selects', async () => {
  const removed = [];
  const save = androidSave({
    async createFile() { return uri; },
    async write() {},
    async copy() {},
    async stat() { return { size: 1 }; },
    async unlink(destination) { removed.push(destination); },
    async pickDirectory() {
      assert.equal(removed[0], uri);
      assert.match(removed[1], /^file:\/\/\/cache\/attachment-/);
      return { createFile(name, type) {
        assert.equal(name, 'Mô tả _ hệ thống.docx');
        assert.equal(type, docxType);
        return { async write(data) { assert.equal(data, bytes); } };
      } };
    },
  });
  assert.equal(await save(file), 'Đã lưu tệp vào thư mục đã chọn.');
});

test('Android canceling the folder picker leaves the attachment unsaved', async () => {
  const save = androidSave({
    async createFile() { throw new Error('Downloads is unavailable'); },
    async write() {},
    async unlink() {},
    async pickDirectory() {
      throw Object.assign(new Error('Canceled'), { code: 'ERR_PICKER_CANCELLED' });
    },
  });
  assert.equal(await save(file), undefined);
});
