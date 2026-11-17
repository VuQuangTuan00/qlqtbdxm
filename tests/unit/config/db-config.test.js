'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { withTempDir } = require('../../helpers/test-environment');

function loadConfigModule(userDataPath) {
  const electronPath = require.resolve('electron');
  const modulePath = require.resolve('../../../main/config/db-config');
  const savedElectron = require.cache[electronPath];
  const savedModule = require.cache[modulePath];

  require.cache[electronPath] = {
    id: electronPath,
    filename: electronPath,
    loaded: true,
    exports: { app: { getPath: (name) => {
      assert.equal(name, 'userData');
      return userDataPath;
    } } },
  };
  delete require.cache[modulePath];
  const configModule = require(modulePath);

  if (savedElectron) require.cache[electronPath] = savedElectron;
  else delete require.cache[electronPath];
  if (savedModule) require.cache[modulePath] = savedModule;
  else delete require.cache[modulePath];

  return configModule;
}

const validConfig = {
  mode: 'sqlserver',
  server: 'db.internal',
  port: 1433,
  database: 'QTCN',
  user: 'qtcn_app',
  password: 'secret',
};

test('missing db-config returns null even when production-style DB env variables exist', async () => {
  await withTempDir('db-config-missing-', async (userDataPath) => {
    const previous = process.env.DB_SERVER;
    process.env.DB_SERVER = 'must-not-be-used';
    try {
      const { readDbConfig } = loadConfigModule(userDataPath);
      assert.equal(readDbConfig(), null);
    } finally {
      if (previous === undefined) delete process.env.DB_SERVER;
      else process.env.DB_SERVER = previous;
    }
  });
});

test('valid db-config is returned without discarding optional or unknown keys', async () => {
  await withTempDir('db-config-valid-', async (userDataPath) => {
    const expected = { ...validConfig, backupDirectory: '\\\\sql-host\\backup', futureSetting: true };
    fs.writeFileSync(path.join(userDataPath, 'db-config.json'), JSON.stringify(expected));

    const { readDbConfig } = loadConfigModule(userDataPath);
    assert.deepEqual(readDbConfig(), expected);
  });
});

test('malformed db-config throws and leaves the original bytes unchanged', async () => {
  await withTempDir('db-config-malformed-', async (userDataPath) => {
    const configPath = path.join(userDataPath, 'db-config.json');
    const original = Buffer.from('{"mode":"sqlserver",');
    fs.writeFileSync(configPath, original);

    const { readDbConfig, readDbConfigForRecovery } = loadConfigModule(userDataPath);
    assert.throws(() => readDbConfig(), /Không thể đọc cấu hình SQL Server/i);
    assert.equal(readDbConfigForRecovery(), null);
    assert.deepEqual(fs.readFileSync(configPath), original);
  });
});

test('saving a repaired config preserves malformed bytes in a recovery backup', async () => {
  await withTempDir('db-config-repair-', async (userDataPath) => {
    const configPath = path.join(userDataPath, 'db-config.json');
    const original = Buffer.from('{"mode":"sqlserver",');
    fs.writeFileSync(configPath, original);

    const { writeDbConfig } = loadConfigModule(userDataPath);
    const saved = writeDbConfig(validConfig);
    const recoveryFiles = fs.readdirSync(userDataPath)
      .filter((name) => /^db-config\.invalid-.*\.bak$/.test(name));

    assert.deepEqual(JSON.parse(fs.readFileSync(configPath, 'utf8')), saved);
    assert.equal(recoveryFiles.length, 1);
    assert.deepEqual(fs.readFileSync(path.join(userDataPath, recoveryFiles[0])), original);
  });
});

test('invalid db-config is rejected but remains available for recovery fields', async () => {
  await withTempDir('db-config-invalid-', async (userDataPath) => {
    const invalid = { mode: 'sqlserver', server: 'db.internal', database: 'QTCN' };
    fs.writeFileSync(path.join(userDataPath, 'db-config.json'), JSON.stringify(invalid));

    const { readDbConfig, readDbConfigForRecovery } = loadConfigModule(userDataPath);
    assert.throws(() => readDbConfig(), /Tên đăng nhập/i);
    assert.deepEqual(readDbConfigForRecovery(), invalid);
  });
});

test('port validation accepts only integers from 1 through 65535', async () => {
  await withTempDir('db-config-port-', async (userDataPath) => {
    const { validateDbConfig } = loadConfigModule(userDataPath);
    assert.equal(validateDbConfig({ ...validConfig, port: 1 }).port, 1);
    assert.equal(validateDbConfig({ ...validConfig, port: 65535 }).port, 65535);
    assert.throws(() => validateDbConfig({ ...validConfig, port: 0 }), /Cổng SQL Server/i);
    assert.throws(() => validateDbConfig({ ...validConfig, port: 65536 }), /Cổng SQL Server/i);
    assert.throws(() => validateDbConfig({ ...validConfig, port: 1433.5 }), /Cổng SQL Server/i);
  });
});

test('writeDbConfig atomically merges password and unknown settings from the existing file', async () => {
  await withTempDir('db-config-write-', async (userDataPath) => {
    const configPath = path.join(userDataPath, 'db-config.json');
    const existing = {
      ...validConfig,
      backupDirectory: 'D:\\SqlBackup',
      futureSetting: { enabled: true },
    };
    fs.writeFileSync(configPath, JSON.stringify(existing, null, 2));

    const { writeDbConfig } = loadConfigModule(userDataPath);
    const saved = writeDbConfig({ server: 'new-db.internal', password: '' });

    assert.equal(saved.server, 'new-db.internal');
    assert.equal(saved.password, 'secret');
    assert.equal(saved.backupDirectory, 'D:\\SqlBackup');
    assert.deepEqual(saved.futureSetting, { enabled: true });
    assert.deepEqual(JSON.parse(fs.readFileSync(configPath, 'utf8')), saved);
    assert.deepEqual(fs.readdirSync(userDataPath), ['db-config.json']);
  });
});

test('null and empty instance names are omitted from validated config', async () => {
  await withTempDir('db-config-empty-instance-', async (userDataPath) => {
    const { validateDbConfig } = loadConfigModule(userDataPath);

    const withNull = validateDbConfig({ ...validConfig, instanceName: null });
    const withEmpty = validateDbConfig({ ...validConfig, instanceName: '' });

    assert.equal(Object.hasOwn(withNull, 'instanceName'), false);
    assert.equal(Object.hasOwn(withEmpty, 'instanceName'), false);
  });
});

test('non-string and whitespace-only instance names remain invalid', async () => {
  await withTempDir('db-config-invalid-instance-', async (userDataPath) => {
    const { validateDbConfig } = loadConfigModule(userDataPath);

    assert.throws(
      () => validateDbConfig({ ...validConfig, instanceName: 123 }),
      /instance SQL Server/i,
    );
    assert.throws(
      () => validateDbConfig({ ...validConfig, instanceName: '   ' }),
      /instance SQL Server/i,
    );
  });
});

test('writing null instance removes the stored instance without discarding existing extensions', async () => {
  await withTempDir('db-config-remove-instance-', async (userDataPath) => {
    const configPath = path.join(userDataPath, 'db-config.json');
    fs.writeFileSync(configPath, JSON.stringify({
      ...validConfig,
      instanceName: 'SQLEXPRESS',
      backupDirectory: 'D:\\SqlBackup',
      futureSetting: { enabled: true },
    }));

    const { writeDbConfig } = loadConfigModule(userDataPath);
    const saved = writeDbConfig({ instanceName: null });

    assert.equal(Object.hasOwn(saved, 'instanceName'), false);
    assert.equal(saved.backupDirectory, 'D:\\SqlBackup');
    assert.deepEqual(saved.futureSetting, { enabled: true });
    assert.deepEqual(JSON.parse(fs.readFileSync(configPath, 'utf8')), saved);
  });
});
