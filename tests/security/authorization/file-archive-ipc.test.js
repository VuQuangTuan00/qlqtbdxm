'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { withTempDir } = require('../../helpers/test-environment');

function loadFileArchiveIpc(root) {
  const handlers = new Map();
  const calls = [];
  const archivePath = path.join(root, 'transfer.zip');
  fs.writeFileSync(archivePath, 'zip placeholder');

  const electron = {
    ipcMain: { handle(channel, handler) { handlers.set(channel, handler); } },
    dialog: {
      async showOpenDialog() { return { canceled: false, filePaths: [archivePath] }; },
      async showSaveDialog() { return { canceled: true }; },
    },
    BrowserWindow: { fromWebContents() { return undefined; } },
    app: {
      getPath(name) { assert.equal(name, 'documents'); return root; },
      relaunch() { calls.push('relaunch'); },
      exit() { calls.push('exit'); },
    },
  };
  const archiveService = {
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
    async backupMssqlDatabase() { throw new Error('not expected'); },
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
