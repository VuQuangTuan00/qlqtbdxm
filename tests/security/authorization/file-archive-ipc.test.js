'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { withTempDir } = require('../../helpers/test-environment');

function loadFileArchiveIpc(root, { storageError } = {}) {
  const handlers = new Map();
  const calls = [];
  const archivePath = path.join(root, 'transfer.zip');
  fs.writeFileSync(archivePath, 'zip placeholder');

  const electron = {
    ipcMain: { handle(channel, handler) { handlers.set(channel, handler); } },
    dialog: {
      async showOpenDialog() { return { canceled: false, filePaths: [archivePath] }; },
      async showSaveDialog() {
        return { canceled: false, filePath: path.join(root, 'export.zip') };
      },
    },
    BrowserWindow: { fromWebContents() { return undefined; } },
    app: {
      getPath(name) { assert.equal(name, 'documents'); return root; },
      relaunch() { calls.push('relaunch'); },
      exit() { calls.push('exit'); },
    },
  };
  const archiveService = {
    async exportTransferPackage(destination, databaseBackupPath) {
      calls.push(['exportTransferPackage', destination, databaseBackupPath]);
      fs.writeFileSync(destination, 'zip placeholder');
      return destination;
    },
    async restoreFilesFromTransferPackage(selectedPath) {
      calls.push(['restoreFiles', selectedPath]);
      return { backupPath: null };
    },
    async extractDatabaseBackupFromTransferPackage(selectedPath, destination) {
      calls.push(['extractDatabase', selectedPath, destination]);
      fs.writeFileSync(destination, 'bak placeholder');
      return { backupPath: destination };
    },
  };
  const database = {
    async getMssqlBackupDirectory() {
      const directory = path.join(root, 'sql-backups');
      fs.mkdirSync(directory, { recursive: true });
      return directory;
    },
    async restoreMssqlDatabase(incoming, safety) {
      calls.push(['restoreDatabase', incoming, safety]);
      assert.equal(fs.existsSync(incoming), true);
      return { safetyBackupPath: safety };
    },
    getDbConfig() { return { database: 'QTCN' }; },
    async backupMssqlDatabase(backupPath) {
      calls.push(['backupDatabase', backupPath]);
      fs.writeFileSync(backupPath, 'bak placeholder');
    },
  };
  const pendingCleanup = {
    processPendingCleanup() {
      calls.push('processPendingCleanup');
      return { deleted: 0, remaining: 0 };
    },
  };
  const fileStorage = {
    getStorageRoot() {
      calls.push('getStorageRoot');
      if (storageError) throw storageError;
      return path.join(root, 'shared-storage');
    },
    testReadWriteAccess(storageRoot) {
      calls.push(['testStorage', storageRoot]);
      if (storageError) throw storageError;
      return true;
    },
  };

  const modulePath = require.resolve('../../../main/ipc/file-archive.ipc');
  const replacements = new Map([
    [require.resolve('electron'), electron],
    [require.resolve('../../../main/database'), database],
    [require.resolve('../../../main/services/auth.service'), {
      requireAuth: () => true,
      requireAdmin: () => true,
    }],
    [require.resolve('../../../main/services/file-archive.service'), archiveService],
    [require.resolve('../../../main/services/pending-file-cleanup.service'), pendingCleanup],
    [require.resolve('../../../main/services/file-storage.service'), fileStorage],
    [require.resolve('../../../main/utils/logger'), { info() {}, warn() {}, error() {} }],
  ]);
  const saved = new Map([[modulePath, require.cache[modulePath]]]);
  for (const [replacementPath, replacement] of replacements) {
    saved.set(replacementPath, require.cache[replacementPath]);
    require.cache[replacementPath] = {
      id: replacementPath,
      filename: replacementPath,
      loaded: true,
      exports: replacement,
    };
  }
  delete require.cache[modulePath];
  const ipcModule = require(modulePath);
  for (const [savedPath, cached] of saved) {
    if (cached) require.cache[savedPath] = cached;
    else delete require.cache[savedPath];
  }
  ipcModule.register();
  return { handlers, calls, archivePath };
}

test('file archive exposes separate file and database restore handlers', async () => {
  await withTempDir('file-archive-ipc-', async (root) => {
    const { handlers, calls, archivePath } = loadFileArchiveIpc(root);

    assert.equal(handlers.has('fileArchive:import'), false);
    assert.equal(handlers.has('fileArchive:restoreFiles'), true);
    assert.equal(handlers.has('fileArchive:restoreDatabase'), true);

    const event = { sender: {} };
    const filesResult = await handlers.get('fileArchive:restoreFiles')(event);
    assert.equal(filesResult.success, true);
    assert.deepEqual(calls[0], ['restoreFiles', archivePath]);
    assert.equal(calls.some((call) => Array.isArray(call) && call[0] === 'restoreDatabase'), false);

    const databaseResult = await handlers.get('fileArchive:restoreDatabase')(event);
    assert.equal(databaseResult.success, true);
    assert.ok(calls.some((call) => Array.isArray(call) && call[0] === 'extractDatabase'));
    assert.ok(calls.some((call) => Array.isArray(call) && call[0] === 'restoreDatabase'));
    assert.match(databaseResult.data.safetyBackupPath, /safety/i);
  });
});

test('backup retries pending file cleanup before creating the database backup', async () => {
  await withTempDir('file-archive-cleanup-', async (root) => {
    const { handlers, calls } = loadFileArchiveIpc(root);

    const result = await handlers.get('fileArchive:export')({ sender: {} });

    assert.equal(result.success, true);
    const cleanupIndex = calls.indexOf('processPendingCleanup');
    const storageIndex = calls.findIndex((call) => Array.isArray(call) && call[0] === 'testStorage');
    const backupIndex = calls.findIndex((call) => Array.isArray(call) && call[0] === 'backupDatabase');
    const archiveIndex = calls.findIndex((call) => Array.isArray(call) && call[0] === 'exportTransferPackage');
    assert.ok(cleanupIndex >= 0);
    assert.ok(cleanupIndex < storageIndex);
    assert.ok(storageIndex < backupIndex);
    assert.ok(backupIndex < archiveIndex);
  });
});

test('backup stops before SQL BACKUP DATABASE when shared storage is unavailable', async () => {
  await withTempDir('file-archive-storage-failure-', async (root) => {
    const { handlers, calls } = loadFileArchiveIpc(root, {
      storageError: new Error('Không thể truy cập kho UNC'),
    });

    const result = await handlers.get('fileArchive:export')({ sender: {} });

    assert.equal(result.success, false);
    assert.match(result.error, /UNC|kho/i);
    assert.equal(calls.some((call) => Array.isArray(call) && call[0] === 'backupDatabase'), false);
    assert.equal(calls.some((call) => Array.isArray(call) && call[0] === 'exportTransferPackage'), false);
  });
});
