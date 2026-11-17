'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { withTempDir } = require('../../helpers/test-environment');
const { resolveDatabaseStartup } = require('../../../main/startup/database-startup');

function loadConfigModule(userDataPath) {
  const electronPath = require.resolve('electron');
  const modulePath = require.resolve('../../../main/config/db-config');
  const savedElectron = require.cache[electronPath];
  const savedModule = require.cache[modulePath];
  require.cache[electronPath] = {
    id: electronPath,
    filename: electronPath,
    loaded: true,
    exports: {
      app: { getPath: () => userDataPath },
      safeStorage: {
        isEncryptionAvailable: () => true,
        encryptString: (value) => Buffer.from(`safe-storage:${value}`, 'utf8'),
        decryptString: (value) => Buffer.from(value).toString('utf8').slice('safe-storage:'.length),
      },
    },
  };
  delete require.cache[modulePath];
  const loaded = require(modulePath);
  if (savedElectron) require.cache[electronPath] = savedElectron;
  else delete require.cache[electronPath];
  if (savedModule) require.cache[modulePath] = savedModule;
  else delete require.cache[modulePath];
  return loaded;
}

test('missing db config selects first-run without attempting a connection', async () => {
  let initCalls = 0;
  const result = await resolveDatabaseStartup({
    readDbConfig: () => null,
    readDbConfigForRecovery: () => null,
    initDatabase: async () => { initCalls += 1; },
  });

  assert.deepEqual(result, { mode: 'first-run' });
  assert.equal(initCalls, 0);
});

test('valid db config initializes the database and selects ready mode', async () => {
  const config = {
    mode: 'sqlserver', server: 'db.local', port: 1433, database: 'QTCN', user: 'app', password: 'secret',
    fileStorageRoot: '\\\\FILE-SERVER\\QTCN-Files',
  };
  let initCalls = 0;
  const result = await resolveDatabaseStartup({
    readDbConfig: () => config,
    readDbConfigForRecovery: () => config,
    initDatabase: async () => { initCalls += 1; },
  });

  assert.equal(result.mode, 'ready');
  assert.equal(initCalls, 1);
});

test('malformed db config selects recovery without changing the file', async () => {
  await withTempDir('startup-invalid-config-', async (userDataPath) => {
    const configPath = path.join(userDataPath, 'db-config.json');
    const original = Buffer.from('{"mode":"sqlserver",');
    fs.writeFileSync(configPath, original);
    const configModule = loadConfigModule(userDataPath);
    let initCalls = 0;

    const result = await resolveDatabaseStartup({
      ...configModule,
      initDatabase: async () => { initCalls += 1; },
    });

    assert.equal(result.mode, 'recovery');
    assert.match(result.error, /Không thể đọc cấu hình SQL Server/i);
    assert.deepEqual(result.config, {
      server: '', port: undefined, database: '', user: '', fileStorageRoot: '',
    });
    assert.equal(initCalls, 0);
    assert.deepEqual(fs.readFileSync(configPath), original);
  });
});

test('connection failure selects recovery without exposing password or unknown keys', async () => {
  const config = {
    mode: 'sqlserver',
    server: 'db.local',
    port: 1433,
    database: 'QTCN',
    user: 'app',
    password: 'must-stay-private',
    backupDirectory: 'D:\\SqlBackup',
    fileStorageRoot: '\\\\FILE-SERVER\\QTCN-Files',
  };

  const result = await resolveDatabaseStartup({
    readDbConfig: () => config,
    readDbConfigForRecovery: () => config,
    initDatabase: async () => { throw new Error('connection refused'); },
  });

  assert.deepEqual(result, {
    mode: 'recovery',
    error: 'connection refused',
    config: {
      server: 'db.local',
      port: 1433,
      database: 'QTCN',
      user: 'app',
      fileStorageRoot: '\\\\FILE-SERVER\\QTCN-Files',
    },
  });
  assert.equal(JSON.stringify(result).includes('must-stay-private'), false);
  assert.equal(JSON.stringify(result).includes('SqlBackup'), false);
});
