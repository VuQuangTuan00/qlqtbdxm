'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { withTempDir } = require('../../helpers/test-environment');
const actualStorageService = require('../../../main/services/file-storage.service');

const FILE_STORAGE_ROOT = '\\\\FILE-SERVER\\QTCN-Files';

function loadDbConfigIpc(userDataPath, authService, sqlOverride, configOptions = {}, storageOverride = {}) {
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
    safeStorage: {
      isEncryptionAvailable() { return configOptions.encryptionAvailable !== false; },
      encryptString(value) { return Buffer.from(`safe-storage:${value}`, 'utf8'); },
      decryptString(value) {
        if (configOptions.decryptError) throw configOptions.decryptError;
        const decoded = Buffer.from(value).toString('utf8');
        if (!decoded.startsWith('safe-storage:')) throw new Error('ciphertext invalid');
        return decoded.slice('safe-storage:'.length);
      },
    },
  };
  const sql = sqlOverride || { connect: async () => { throw new Error('not used'); } };
  const database = {
    getDbConfig() {
      const configPath = path.join(userDataPath, 'db-config.json');
      return fs.existsSync(configPath)
        ? JSON.parse(fs.readFileSync(configPath, 'utf8'))
        : null;
    },
  };

  const modulePath = require.resolve('../../../main/ipc/db-config.ipc');
  const configModulePath = require.resolve('../../../main/config/db-config');
  const storageModulePath = require.resolve('../../../main/services/file-storage.service');
  const replacements = new Map([
    [require.resolve('electron'), electron],
    [require.resolve('mssql'), sql],
    [require.resolve('../../../main/database'), database],
    [require.resolve('../../../main/services/auth.service'), authService],
    [storageModulePath, {
      ...actualStorageService,
      testReadWriteAccess: storageOverride.testReadWriteAccess || (() => true),
    }],
    [require.resolve('../../../main/utils/logger'), { info() {}, warn() {}, error() {} }],
  ]);
  const saved = new Map([
    [modulePath, require.cache[modulePath]],
    [configModulePath, require.cache[configModulePath]],
    [storageModulePath, require.cache[storageModulePath]],
  ]);
  for (const replacementPath of replacements.keys()) {
    saved.set(replacementPath, require.cache[replacementPath]);
    require.cache[replacementPath] = {
      id: replacementPath,
      filename: replacementPath,
      loaded: true,
      exports: replacements.get(replacementPath),
    };
  }
  delete require.cache[configModulePath];
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
    assert.deepEqual(result.data, {
      server: '',
      port: undefined,
      database: '',
      user: '',
      password: '',
      fileStorageRoot: '',
    });
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
    fs.writeFileSync(path.join(userDataPath, 'db-config.json'), JSON.stringify({
      mode: 'sqlserver', server: 'db.local', database: 'QTCN', user: 'app', password: 'secret',
      fileStorageRoot: FILE_STORAGE_ROOT,
    }));
    const authService = { requireAdmin: () => true };
    const { ipcModule, handlers } = loadDbConfigIpc(userDataPath, authService);
    ipcModule.register({ setupMode: false });

    const result = await handlers.get('dbconfig:get')();
    assert.equal(result.success, true);
    assert.equal(result.data.password, '');
  });
});

test('saving db config preserves omitted password, backupDirectory, and unknown keys', async () => {
  await withTempDir('db-config-preserve-', async (userDataPath) => {
    const configPath = path.join(userDataPath, 'db-config.json');
    fs.writeFileSync(configPath, JSON.stringify({
      mode: 'sqlserver',
      server: 'old-db',
      port: 1433,
      database: 'QTCN',
      user: 'app',
      password: 'old-secret',
      fileStorageRoot: FILE_STORAGE_ROOT,
      backupDirectory: 'D:\\SqlBackup',
      futureSetting: { enabled: true },
    }));
    const authService = { requireAdmin: () => true };
    const { ipcModule, handlers } = loadDbConfigIpc(userDataPath, authService);
    ipcModule.register({ setupMode: false });

    const result = await handlers.get('dbconfig:set')(null, {
      mode: 'sqlserver',
      server: 'old-db',
      port: 1433,
      database: 'QTCN_NEXT',
      user: 'app',
      fileStorageRoot: FILE_STORAGE_ROOT,
    });
    const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    assert.equal(result.success, true);
    assert.equal(saved.server, 'old-db');
    assert.equal(Object.hasOwn(saved, 'password'), false);
    assert.equal(saved.passwordEncryption, 'electron-safe-storage-v1');
    assert.equal(typeof saved.passwordEncrypted, 'string');
    assert.equal(JSON.stringify(saved).includes('old-secret'), false);
    assert.equal(saved.backupDirectory, 'D:\\SqlBackup');
    assert.deepEqual(saved.futureSetting, { enabled: true });
  });
});

test('saving invalid db config is rejected without replacing the existing file', async () => {
  await withTempDir('db-config-invalid-save-', async (userDataPath) => {
    const configPath = path.join(userDataPath, 'db-config.json');
    const original = JSON.stringify({
      mode: 'sqlserver', server: 'db.local', database: 'QTCN', user: 'app', password: 'secret',
      fileStorageRoot: FILE_STORAGE_ROOT,
    });
    fs.writeFileSync(configPath, original);
    const authService = { requireAdmin: () => true };
    const { ipcModule, handlers } = loadDbConfigIpc(userDataPath, authService);
    ipcModule.register({ setupMode: false });

    const result = await handlers.get('dbconfig:set')(null, {
      mode: 'sqlserver', server: '', database: 'QTCN', user: 'app',
      fileStorageRoot: FILE_STORAGE_ROOT,
    });

    assert.equal(result.success, false);
    assert.equal(fs.readFileSync(configPath, 'utf8'), original);
  });
});

test('saving a changed SQL endpoint without a new password is rejected', async () => {
  await withTempDir('db-config-changed-endpoint-', async (userDataPath) => {
    const configPath = path.join(userDataPath, 'db-config.json');
    const original = JSON.stringify({
      mode: 'sqlserver', server: 'db.local', database: 'QTCN', user: 'app', password: 'secret',
      fileStorageRoot: FILE_STORAGE_ROOT,
    });
    fs.writeFileSync(configPath, original);
    const { ipcModule, handlers } = loadDbConfigIpc(
      userDataPath,
      { requireAdmin: () => true },
    );
    ipcModule.register({ setupMode: false });

    const result = await handlers.get('dbconfig:set')(null, {
      server: 'other-db.local', database: 'QTCN', user: 'app', password: '',
      fileStorageRoot: FILE_STORAGE_ROOT,
    });

    assert.equal(result.success, false);
    assert.match(result.error, /nhập lại mật khẩu/i);
    assert.equal(fs.readFileSync(configPath, 'utf8'), original);
  });
});

test('atomic replacement failure leaves the existing db config untouched', async () => {
  await withTempDir('db-config-atomic-save-', async (userDataPath) => {
    const configPath = path.join(userDataPath, 'db-config.json');
    const original = JSON.stringify({
      mode: 'sqlserver', server: 'db.local', database: 'QTCN', user: 'app', password: 'secret',
      fileStorageRoot: FILE_STORAGE_ROOT,
    });
    fs.writeFileSync(configPath, original);
    const authService = { requireAdmin: () => true };
    const { ipcModule, handlers } = loadDbConfigIpc(userDataPath, authService);
    ipcModule.register({ setupMode: false });

    const originalRename = fs.renameSync;
    fs.renameSync = () => { throw new Error('simulated atomic replace failure'); };
    try {
      const result = await handlers.get('dbconfig:set')(null, {
        mode: 'sqlserver', server: 'new-db', database: 'QTCN', user: 'app', password: 'new-secret',
        fileStorageRoot: FILE_STORAGE_ROOT,
      });
      assert.equal(result.success, false);
      assert.match(result.error, /atomic replace failure/i);
    } finally {
      fs.renameSync = originalRename;
    }

    assert.equal(fs.readFileSync(configPath, 'utf8'), original);
    assert.deepEqual(fs.readdirSync(userDataPath), ['db-config.json']);
  });
});

test('connection test rejects missing endpoint instead of inventing localhost defaults', async () => {
  await withTempDir('db-config-test-validation-', async (userDataPath) => {
    let connectCount = 0;
    const sql = {
      connect: async () => { connectCount += 1; },
      ConnectionPool: class { constructor() { connectCount += 1; } },
    };
    const { ipcModule, handlers } = loadDbConfigIpc(
      userDataPath,
      { requireAdmin: () => false },
      sql,
    );
    ipcModule.register({ setupMode: true });

    const result = await handlers.get('dbconfig:test')(null, {
      server: '', database: 'QTCN', user: 'app', password: 'secret',
      fileStorageRoot: FILE_STORAGE_ROOT,
    });

    assert.equal(result.success, false);
    assert.equal(connectCount, 0);
  });
});

test('connection test uses the same named-instance connection builder as startup', async () => {
  await withTempDir('db-config-test-instance-', async (userDataPath) => {
    let receivedOptions;
    let globalConnectCount = 0;
    let isolatedConnectCount = 0;
    let isolatedCloseCount = 0;
    const sql = {
      connect: async () => { globalConnectCount += 1; throw new Error('global pool must not be used'); },
      ConnectionPool: class {
        constructor(options) { receivedOptions = options; }
        async connect() { isolatedConnectCount += 1; return this; }
        request() { return { query: async () => ({ recordset: [{ version: 'SQL Server' }] }) }; }
        async close() { isolatedCloseCount += 1; }
      },
    };
    const { ipcModule, handlers } = loadDbConfigIpc(
      userDataPath,
      { requireAdmin: () => false },
      sql,
    );
    ipcModule.register({ setupMode: true });

    const result = await handlers.get('dbconfig:test')(null, {
      server: 'DBHOST', instanceName: 'SQLEXPRESS', database: 'QTCN', user: 'app', password: 'secret',
      fileStorageRoot: FILE_STORAGE_ROOT,
    });

    assert.equal(result.success, true);
    assert.equal(receivedOptions.server, 'DBHOST');
    assert.equal(receivedOptions.port, undefined);
    assert.equal(receivedOptions.options.instanceName, 'SQLEXPRESS');
    assert.equal(globalConnectCount, 0);
    assert.equal(isolatedConnectCount, 1);
    assert.equal(isolatedCloseCount, 1);
  });
});

test('db config get includes instance name only when it is configured', async () => {
  await withTempDir('db-config-get-instance-', async (userDataPath) => {
    fs.writeFileSync(path.join(userDataPath, 'db-config.json'), JSON.stringify({
      mode: 'sqlserver',
      server: 'DBHOST',
      instanceName: 'SQLEXPRESS',
      database: 'QTCN',
      user: 'app',
      password: 'secret',
      fileStorageRoot: FILE_STORAGE_ROOT,
    }));
    const { ipcModule, handlers } = loadDbConfigIpc(
      userDataPath,
      { requireAdmin: () => true },
    );
    ipcModule.register({ setupMode: false });

    const result = await handlers.get('dbconfig:get')();

    assert.equal(result.success, true);
    assert.equal(result.data.instanceName, 'SQLEXPRESS');
  });
});

test('db config get omits instance name for a valid config without one', async () => {
  await withTempDir('db-config-get-no-instance-', async (userDataPath) => {
    fs.writeFileSync(path.join(userDataPath, 'db-config.json'), JSON.stringify({
      mode: 'sqlserver',
      server: 'DBHOST',
      port: 1433,
      database: 'QTCN',
      user: 'app',
      password: 'secret',
      fileStorageRoot: FILE_STORAGE_ROOT,
    }));
    const { ipcModule, handlers } = loadDbConfigIpc(
      userDataPath,
      { requireAdmin: () => true },
    );
    ipcModule.register({ setupMode: false });

    const result = await handlers.get('dbconfig:get')();

    assert.equal(result.success, true);
    assert.equal(Object.hasOwn(result.data, 'instanceName'), false);
  });
});

test('connection test reuses the stored password for an unchanged endpoint', async () => {
  await withTempDir('db-config-test-stored-password-', async (userDataPath) => {
    fs.writeFileSync(path.join(userDataPath, 'db-config.json'), JSON.stringify({
      mode: 'sqlserver',
      server: 'DBHOST',
      instanceName: 'SQLEXPRESS',
      database: 'QTCN',
      user: 'app',
      password: 'stored-secret',
      fileStorageRoot: FILE_STORAGE_ROOT,
    }));
    let receivedOptions;
    const sql = {
      ConnectionPool: class {
        constructor(options) { receivedOptions = options; }
        async connect() { return this; }
        request() { return { query: async () => ({ recordset: [{ version: 'SQL Server' }] }) }; }
        async close() {}
      },
    };
    const { ipcModule, handlers } = loadDbConfigIpc(
      userDataPath,
      { requireAdmin: () => false },
      sql,
    );
    ipcModule.register({ setupMode: true });

    const result = await handlers.get('dbconfig:test')(null, {
      server: 'DBHOST',
      instanceName: 'SQLEXPRESS',
      database: 'QTCN',
      user: 'app',
      password: '',
      fileStorageRoot: FILE_STORAGE_ROOT,
    });

    assert.equal(result.success, true);
    assert.equal(receivedOptions.password, 'stored-secret');
  });
});

test('connection test does not reuse the stored password for a different server', async () => {
  await withTempDir('db-config-test-foreign-password-', async (userDataPath) => {
    fs.writeFileSync(path.join(userDataPath, 'db-config.json'), JSON.stringify({
      mode: 'sqlserver',
      server: 'DBHOST',
      instanceName: 'SQLEXPRESS',
      database: 'QTCN',
      user: 'app',
      password: 'stored-secret',
      fileStorageRoot: FILE_STORAGE_ROOT,
    }));
    let receivedOptions;
    const sql = {
      ConnectionPool: class {
        constructor(options) { receivedOptions = options; }
        async connect() { return this; }
        request() { return { query: async () => ({ recordset: [{ version: 'SQL Server' }] }) }; }
        async close() {}
      },
    };
    const { ipcModule, handlers } = loadDbConfigIpc(
      userDataPath,
      { requireAdmin: () => false },
      sql,
    );
    ipcModule.register({ setupMode: true });

    const result = await handlers.get('dbconfig:test')(null, {
      server: 'OTHERHOST',
      instanceName: 'SQLEXPRESS',
      database: 'QTCN',
      user: 'app',
      password: '',
      fileStorageRoot: FILE_STORAGE_ROOT,
    });

    assert.equal(result.success, true);
    assert.equal(receivedOptions.password, '');
  });
});

test('connection test requires password re-entry when stored ciphertext cannot be decrypted', async () => {
  await withTempDir('db-config-test-foreign-cipher-', async (userDataPath) => {
    fs.writeFileSync(path.join(userDataPath, 'db-config.json'), JSON.stringify({
      mode: 'sqlserver',
      server: 'DBHOST',
      instanceName: 'SQLEXPRESS',
      database: 'QTCN',
      user: 'app',
      passwordEncryption: 'electron-safe-storage-v1',
      passwordEncrypted: Buffer.from('foreign-cipher').toString('base64'),
      fileStorageRoot: FILE_STORAGE_ROOT,
    }));
    let receivedOptions;
    const sql = {
      ConnectionPool: class {
        constructor(options) { receivedOptions = options; }
        async connect() { return this; }
        request() { return { query: async () => ({ recordset: [{ version: 'SQL Server' }] }) }; }
        async close() {}
      },
    };
    const { ipcModule, handlers } = loadDbConfigIpc(
      userDataPath,
      { requireAdmin: () => false },
      sql,
      { decryptError: new Error('DPAPI key mismatch') },
    );
    ipcModule.register({ setupMode: true });

    const getResult = await handlers.get('dbconfig:get')();
    const testResult = await handlers.get('dbconfig:test')(null, {
      server: 'DBHOST',
      instanceName: 'SQLEXPRESS',
      database: 'QTCN',
      user: 'app',
      password: '',
      fileStorageRoot: FILE_STORAGE_ROOT,
    });

    assert.equal(getResult.success, true);
    assert.equal(JSON.stringify(getResult).includes('foreign-cipher'), false);
    assert.equal(testResult.success, true);
    assert.equal(receivedOptions.password, '');
  });
});

test('saving renderer config clears a stale instance and rejects unapproved keys', async () => {
  await withTempDir('db-config-set-whitelist-', async (userDataPath) => {
    const configPath = path.join(userDataPath, 'db-config.json');
    fs.writeFileSync(configPath, JSON.stringify({
      mode: 'sqlserver',
      server: 'DBHOST',
      instanceName: 'SQLEXPRESS',
      database: 'QTCN',
      user: 'app',
      password: 'stored-secret',
      fileStorageRoot: FILE_STORAGE_ROOT,
      backupDirectory: 'D:\\SqlBackup',
      futureSetting: { enabled: true },
    }));
    const { ipcModule, handlers } = loadDbConfigIpc(
      userDataPath,
      { requireAdmin: () => true },
    );
    ipcModule.register({ setupMode: false });

    const result = await handlers.get('dbconfig:set')(null, {
      server: 'NEWHOST',
      port: 1433,
      database: 'QTCN',
      user: 'app',
      password: 'new-secret',
      fileStorageRoot: FILE_STORAGE_ROOT,
      backupDirectory: 'C:\\Untrusted',
      injectedKey: true,
    });
    const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    assert.equal(result.success, true);
    assert.equal(Object.hasOwn(saved, 'instanceName'), false);
    assert.equal(saved.backupDirectory, 'D:\\SqlBackup');
    assert.equal(saved.fileStorageRoot, FILE_STORAGE_ROOT);
    assert.equal(Object.hasOwn(saved, 'injectedKey'), false);
    assert.deepEqual(saved.futureSetting, { enabled: true });
    assert.equal(Object.hasOwn(result.data.config, 'instanceName'), false);
  });
});

test('connection test verifies read-write access to the configured shared file root', async () => {
  await withTempDir('db-config-test-storage-', async (userDataPath) => {
    const storageCalls = [];
    const sql = {
      ConnectionPool: class {
        async connect() { return this; }
        request() { return { query: async () => ({ recordset: [{ version: 'SQL Server' }] }) }; }
        async close() {}
      },
    };
    const { ipcModule, handlers } = loadDbConfigIpc(
      userDataPath,
      { requireAdmin: () => false },
      sql,
      {},
      { testReadWriteAccess(root) { storageCalls.push(root); } },
    );
    ipcModule.register({ setupMode: true });

    const result = await handlers.get('dbconfig:test')(null, {
      server: 'DBHOST',
      port: 1433,
      database: 'QTCN',
      user: 'app',
      password: 'secret',
      fileStorageRoot: FILE_STORAGE_ROOT,
    });

    assert.equal(result.success, true);
    assert.deepEqual(storageCalls, [FILE_STORAGE_ROOT]);
  });
});

test('connection test reports an inaccessible shared file root', async () => {
  await withTempDir('db-config-test-storage-failure-', async (userDataPath) => {
    const sql = {
      ConnectionPool: class {
        async connect() { return this; }
        request() { return { query: async () => ({ recordset: [{ version: 'SQL Server' }] }) }; }
        async close() {}
      },
    };
    const { ipcModule, handlers } = loadDbConfigIpc(
      userDataPath,
      { requireAdmin: () => false },
      sql,
      {},
      { testReadWriteAccess() { throw new Error('SMB access denied'); } },
    );
    ipcModule.register({ setupMode: true });

    const result = await handlers.get('dbconfig:test')(null, {
      server: 'DBHOST',
      port: 1433,
      database: 'QTCN',
      user: 'app',
      password: 'secret',
      fileStorageRoot: FILE_STORAGE_ROOT,
    });

    assert.equal(result.success, false);
    assert.match(result.error, /SMB access denied/);
  });
});

