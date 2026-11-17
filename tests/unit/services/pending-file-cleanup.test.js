'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { withTempDir } = require('../../helpers/test-environment');
const {
  createPendingFileCleanupService,
} = require('../../../main/services/pending-file-cleanup.service');

function createService(userDataPath, { unlinkSync, fsModule = Object.create(fs) } = {}) {
  if (unlinkSync) fsModule.unlinkSync = unlinkSync;
  return createPendingFileCleanupService({
    fsModule,
    getUserDataPath: () => userDataPath,
    logger: { info() {}, warn() {}, error() {} },
    createId: () => 'test-id',
  });
}

test('deleteOrQueue removes an allowed file immediately', async () => {
  await withTempDir('cleanup-immediate-', async (userData) => {
    const imageDir = path.join(userData, 'vehicle-images');
    fs.mkdirSync(imageDir, { recursive: true });
    const imagePath = path.join(imageDir, 'old.png');
    fs.writeFileSync(imagePath, 'old image');
    const service = createService(userData);

    assert.equal(service.deleteOrQueue(imagePath), true);
    assert.equal(fs.existsSync(imagePath), false);
    assert.equal(fs.existsSync(service.getCleanupQueuePath()), false);
  });
});

test('a locked file is queued once and removed by a later retry', async () => {
  await withTempDir('cleanup-retry-', async (userData) => {
    const pdfDir = path.join(userData, 'maintenance-files');
    fs.mkdirSync(pdfDir, { recursive: true });
    const pdfPath = path.join(pdfDir, 'old.pdf');
    fs.writeFileSync(pdfPath, 'old pdf');
    let locked = true;
    const service = createService(userData, {
      unlinkSync(filePath) {
        if (locked && path.resolve(filePath) === path.resolve(pdfPath)) {
          const error = new Error('file is locked');
          error.code = 'EBUSY';
          throw error;
        }
        return fs.unlinkSync(filePath);
      },
    });

    assert.equal(service.deleteOrQueue(pdfPath), false);
    assert.equal(service.deleteOrQueue(pdfPath), false);
    const queued = JSON.parse(fs.readFileSync(service.getCleanupQueuePath(), 'utf8'));
    assert.deepEqual(queued, { version: 1, paths: [path.resolve(pdfPath)] });

    locked = false;
    assert.deepEqual(service.processPendingCleanup(), { deleted: 1, remaining: 0 });
    assert.equal(fs.existsSync(pdfPath), false);
    assert.deepEqual(
      JSON.parse(fs.readFileSync(service.getCleanupQueuePath(), 'utf8')),
      { version: 1, paths: [] },
    );
  });
});

test('retry drops a queued path when the file no longer exists', async () => {
  await withTempDir('cleanup-missing-', async (userData) => {
    const imageDir = path.join(userData, 'vehicle-images');
    fs.mkdirSync(imageDir, { recursive: true });
    const imagePath = path.join(imageDir, 'missing.png');
    fs.writeFileSync(imagePath, 'image');
    const service = createService(userData, {
      unlinkSync() {
        const error = new Error('locked');
        error.code = 'EBUSY';
        throw error;
      },
    });
    service.deleteOrQueue(imagePath);
    fs.rmSync(imagePath, { force: true });

    assert.deepEqual(service.processPendingCleanup(), { deleted: 0, remaining: 0 });
  });
});

test('cleanup refuses files outside approved roots and through a junction', async (t) => {
  await withTempDir('cleanup-boundary-', async (root) => {
    const userData = path.join(root, 'profile');
    const outside = path.join(root, 'outside');
    fs.mkdirSync(userData);
    fs.mkdirSync(outside);
    const outsideFile = path.join(outside, 'keep.pdf');
    fs.writeFileSync(outsideFile, 'keep');
    const service = createService(userData);

    assert.equal(service.deleteOrQueue(outsideFile), false);
    assert.equal(fs.existsSync(outsideFile), true);

    const junction = path.join(userData, 'maintenance-files');
    try {
      fs.symlinkSync(outside, junction, 'junction');
    } catch (error) {
      if (['EPERM', 'EACCES'].includes(error.code)) {
        t.skip('Junction creation is not permitted in this environment');
        return;
      }
      throw error;
    }
    assert.equal(service.deleteOrQueue(path.join(junction, 'keep.pdf')), false);
    assert.equal(fs.existsSync(outsideFile), true);
    assert.equal(fs.existsSync(service.getCleanupQueuePath()), false);
  });
});

test('a malformed queue is preserved and never used to delete files', async () => {
  await withTempDir('cleanup-malformed-', async (userData) => {
    const outsideFile = path.join(userData, 'do-not-delete.txt');
    fs.writeFileSync(outsideFile, 'keep');
    const service = createService(userData);
    fs.writeFileSync(service.getCleanupQueuePath(), '{not-json', 'utf8');

    assert.deepEqual(service.processPendingCleanup(), { deleted: 0, remaining: 0 });
    assert.equal(fs.existsSync(outsideFile), true);
    assert.equal(
      fs.readdirSync(userData).some((name) => name.startsWith('pending-file-cleanup.invalid-')),
      true,
    );
  });
});

test('a malformed queue remains byte-for-byte intact when quarantine fails', async () => {
  await withTempDir('pending-cleanup-quarantine-failure-', async (userData) => {
    const queuePath = path.join(userData, 'pending-file-cleanup.json');
    const original = Buffer.from('{"version":1,"paths":[');
    fs.writeFileSync(queuePath, original);
    const fsModule = Object.create(fs);
    fsModule.renameSync = () => {
      const error = new Error('simulated quarantine failure');
      error.code = 'EPERM';
      throw error;
    };
    const service = createService(userData, { fsModule });

    assert.deepEqual(service.processPendingCleanup(), { deleted: 0, remaining: 0 });
    assert.deepEqual(fs.readFileSync(queuePath), original);
    assert.deepEqual(fs.readdirSync(userData), ['pending-file-cleanup.json']);
  });
});
