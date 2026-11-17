'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { withTempDir } = require('../../helpers/test-environment');
const {
  validateFileStorageRoot,
  createFileStorageService,
} = require('../../../main/services/file-storage.service');

test('UNC storage root accepts a share and normalizes trailing separators', () => {
  assert.equal(validateFileStorageRoot('  \\\\FILE-SERVER\\QTCN-Files\\  '), '\\\\FILE-SERVER\\QTCN-Files');
  assert.equal(validateFileStorageRoot('//FILE-SERVER/QTCN-Files/'), '\\\\FILE-SERVER\\QTCN-Files');
});

test('storage root rejects local, relative, device, and server-only paths', () => {
  for (const value of [
    'C:\\QTCN-Files',
    'QTCN-Files',
    '\\\\FILE-SERVER',
    '\\\\?\\C:\\QTCN-Files',
    '\\\\.\\pipe\\QTCN-Files',
    '',
  ]) {
    assert.throws(() => validateFileStorageRoot(value), /UNC|dùng chung|file/i, value);
  }
});

test('two clients resolve the same relative database path to the same shared file', async () => {
  await withTempDir('shared-storage-resolve-', async (root) => {
    const create = () => createFileStorageService({
      readConfig: () => ({ fileStorageRoot: root }),
      normalizeRoot: (value) => path.resolve(value),
    });
    const first = create();
    const second = create();
    fs.mkdirSync(path.join(root, 'maintenance-files'));
    fs.writeFileSync(path.join(root, 'maintenance-files', 'manual.pdf'), '%PDF-1.4');

    const expected = path.join(root, 'maintenance-files', 'manual.pdf');
    assert.equal(first.resolveStoredPath('maintenance-files/manual.pdf', 'maintenance-files'), expected);
    assert.equal(second.resolveStoredPath('maintenance-files\\manual.pdf', 'maintenance-files'), expected);
  });
});

test('stored paths are relative, folder-scoped, and cannot escape the shared root', async () => {
  await withTempDir('shared-storage-boundary-', async (root) => {
    const service = createFileStorageService({
      readConfig: () => ({ fileStorageRoot: root }),
      normalizeRoot: (value) => path.resolve(value),
    });
    const imageDir = service.ensureFolder('vehicle-images');
    const imagePath = path.join(imageDir, 'vehicle.png');
    fs.writeFileSync(imagePath, 'image');

    assert.equal(service.toStoredPath(imagePath, 'vehicle-images'), 'vehicle-images/vehicle.png');
    assert.throws(
      () => service.resolveStoredPath(imagePath, 'vehicle-images'),
      /tương đối|absolute|đường dẫn/i,
    );
    assert.throws(
      () => service.resolveStoredPath('../outside.png', 'vehicle-images'),
      /không hợp lệ|ngoài|đường dẫn/i,
    );
    assert.throws(
      () => service.resolveStoredPath('uploads/vehicle.png', 'vehicle-images'),
      /không hợp lệ|thư mục|đường dẫn/i,
    );
    assert.throws(
      () => service.resolveStoredPath('maintenance-files/vehicle.png', 'vehicle-images'),
      /không hợp lệ|thư mục|đường dẫn/i,
    );
  });
});

test('a symlink inside shared storage cannot escape its approved folder', async (t) => {
  await withTempDir('shared-storage-link-', async (root) => {
    const service = createFileStorageService({
      readConfig: () => ({ fileStorageRoot: root }),
      normalizeRoot: (value) => path.resolve(value),
    });
    const imageDir = service.ensureFolder('vehicle-images');
    const outside = path.join(root, 'outside.png');
    const link = path.join(imageDir, 'linked.png');
    fs.writeFileSync(outside, 'outside');
    try {
      fs.symlinkSync(outside, link, 'file');
    } catch (error) {
      if (['EPERM', 'EACCES', 'UNKNOWN'].includes(error.code)) {
        t.skip(`symlink creation is not permitted: ${error.code}`);
        return;
      }
      throw error;
    }

    assert.throws(
      () => service.resolveStoredPath('vehicle-images/linked.png', 'vehicle-images'),
      /liên kết|symlink|junction|ngoài/i,
    );
  });
});

test('read-write probe is removed after success and after a write error', async () => {
  await withTempDir('shared-storage-probe-', async (root) => {
    const service = createFileStorageService({
      readConfig: () => ({ fileStorageRoot: root }),
      normalizeRoot: (value) => path.resolve(value),
      createId: () => 'success',
    });
    service.testReadWriteAccess(root);
    assert.deepEqual(fs.readdirSync(root), []);

    const failingFs = Object.create(fs);
    failingFs.writeFileSync = (...args) => {
      fs.writeFileSync(...args);
      throw new Error('simulated write failure');
    };
    const failingService = createFileStorageService({
      fsModule: failingFs,
      readConfig: () => ({ fileStorageRoot: root }),
      normalizeRoot: (value) => path.resolve(value),
      createId: () => 'failure',
    });

    assert.throws(() => failingService.testReadWriteAccess(root), /simulated write failure/);
    assert.deepEqual(fs.readdirSync(root), []);
  });
});
