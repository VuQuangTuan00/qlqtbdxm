'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { withTempDir } = require('../../helpers/test-environment');

function loadDbConfigIpc(userDataPath, authService) {
  const handlers = new Map();
  const electron = {
    ipcMain: { handle(channel, handler) { handlers.set(channel, handler); } },
    app: {
      getPath(name) {
        assert.equal(name, 'userData');
        return userDataPath;
      },
      relaunch() {},
      exit() {},
    },
  };
  const sql = { connect: async () => { throw new Error('not used'); } };
  const database = { getDbConfig: () => ({ server: 'db.local', database: 'QTCN', user: 'app' }) };

  const modulePath = require.resolve('../../../main/ipc/db-config.ipc');
  const replacements = new Map([
    [require.resolve('electron'), electron],
    [require.resolve('mssql'), sql],
    [require.resolve('../../../main/database'), database],
    [require.resolve('../../../main/services/auth.service'), authService],
  ]);
  const saved = new Map([[modulePath, require.cache[modulePath]]]);
  for (const replacementPath of replacements.keys()) {
    saved.set(replacementPath, require.cache[replacementPath]);
    require.cache[replacementPath] = {
      id: replacementPath,
      filename: replacementPath,
      loaded: true,
      exports: replacements.get(replacementPath),
    };
  }
  delete require.cache[modulePath];
  const ipcModule = require(modulePath);

  for (const [savedPath, cached] of saved) {
    if (cached) require.cache[savedPath] = cached;
    else delete require.cache[savedPath];
  }
  return { ipcModule, handlers };
}

test('db config is available during first-run without a session', async () => {
  await withTempDir('db-config-first-run-', async (userDataPath) => {
    const authService = { requireAdmin: () => false };
    const { ipcModule, handlers } = loadDbConfigIpc(userDataPath, authService);
    ipcModule.register({ setupMode: true });

    const result = await handlers.get('dbconfig:get')();
    assert.equal(result.success, true);
  });
});

test('db config rejects unauthenticated access after setup', async () => {
  await withTempDir('db-config-auth-', async (userDataPath) => {
    fs.writeFileSync(path.join(userDataPath, 'db-config.json'), '{}');
    const authService = { requireAdmin: () => false };
    const { ipcModule, handlers } = loadDbConfigIpc(userDataPath, authService);
    ipcModule.register({ setupMode: false });

    for (const channel of ['dbconfig:get', 'dbconfig:set', 'dbconfig:test']) {
      const result = await handlers.get(channel)(null, {});
      assert.equal(result.success, false, channel);
      assert.match(result.error, /quyền/i, channel);
    }
  });
});

test('db config remains available in explicit database recovery mode', async () => {
  await withTempDir('db-config-recovery-', async (userDataPath) => {
    fs.writeFileSync(path.join(userDataPath, 'db-config.json'), '{}');
    const authService = { requireAdmin: () => false };
    const { ipcModule, handlers } = loadDbConfigIpc(userDataPath, authService);
    ipcModule.register({ setupMode: false });
    ipcModule.setSetupMode(true);

    const result = await handlers.get('dbconfig:get')();
    assert.equal(result.success, true);
  });
});

test('db config is available to an administrator after setup', async () => {
  await withTempDir('db-config-admin-', async (userDataPath) => {
    fs.writeFileSync(path.join(userDataPath, 'db-config.json'), '{}');
    const authService = { requireAdmin: () => true };
    const { ipcModule, handlers } = loadDbConfigIpc(userDataPath, authService);
    ipcModule.register({ setupMode: false });

    const result = await handlers.get('dbconfig:get')();
    assert.equal(result.success, true);
    assert.equal(result.data.password, '');
  });
});

