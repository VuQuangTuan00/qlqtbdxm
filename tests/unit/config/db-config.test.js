'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { withTempDir } = require('../../helpers/test-environment');

function loadConfigModule(userDataPath, options = {}) {
  const electronPath = require.resolve('electron');
  const modulePath = require.resolve('../../../main/config/db-config');
  const savedElectron = require.cache[electronPath];
  const savedModule = require.cache[modulePath];

  require.cache[electronPath] = {
    id: electronPath,
    filename: electronPath,
    loaded: true,
    exports: {
      app: { getPath: (name) => {
        assert.equal(name, 'userData');
        return userDataPath;
      } },
      safeStorage: {
        isEncryptionAvailable() { return options.encryptionAvailable !== false; },
        encryptString(value) {
          if (options.encryptError) throw options.encryptError;
          return Buffer.from(`safe-storage:${value}`, 'utf8');
        },
        decryptString(value) {
          if (options.decryptError) throw options.decryptError;
          const decoded = Buffer.from(value).toString('utf8');
          if (!decoded.startsWith('safe-storage:')) throw new Error('ciphertext invalid');
          return decoded.slice('safe-storage:'.length);
        },
      },
    },
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
  fileStorageRoot: '\\\\FILE-SERVER\\QTCN-Files',
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
    const disk = JSON.parse(fs.readFileSync(path.join(userDataPath, 'db-config.json'), 'utf8'));
    assert.equal(Object.hasOwn(disk, 'password'), false);
    assert.equal(disk.passwordEncryption, 'electron-safe-storage-v1');
    assert.equal(typeof disk.passwordEncrypted, 'string');
    assert.equal(fs.readFileSync(path.join(userDataPath, 'db-config.json'), 'utf8').includes('secret'), false);
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
    const original = Buffer.from('{"mode":"sqlserver","password":"legacy-secret"');
    fs.writeFileSync(configPath, original);

    const { writeDbConfig } = loadConfigModule(userDataPath);
    const saved = writeDbConfig(validConfig);
    const recoveryFiles = fs.readdirSync(userDataPath)
      .filter((name) => /^db-config\.invalid-.*\.bak$/.test(name));

    const disk = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(Object.hasOwn(disk, 'password'), false);
    assert.equal(disk.passwordEncryption, 'electron-safe-storage-v1');
    assert.deepEqual(writeDbConfig({ password: '' }), saved);
    assert.equal(recoveryFiles.length, 1);
    const backupText = fs.readFileSync(path.join(userDataPath, recoveryFiles[0]), 'utf8');
    const backup = JSON.parse(backupText);
    const encryptedPayload = Buffer.from(backup.contentEncrypted, 'base64')
      .toString('utf8')
      .slice('safe-storage:'.length);
    assert.equal(backup.format, 'db-config-invalid-backup');
    assert.equal(backup.encryption, 'electron-safe-storage-v1');
    assert.equal(backupText.includes('legacy-secret'), false);
    assert.deepEqual(Buffer.from(encryptedPayload, 'base64'), original);
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

test('file storage root is required and must be an absolute UNC share', async () => {
  await withTempDir('db-config-storage-root-', async (userDataPath) => {
    const { validateDbConfig } = loadConfigModule(userDataPath);
    const withoutRoot = { ...validConfig };
    delete withoutRoot.fileStorageRoot;

    assert.throws(() => validateDbConfig(withoutRoot), /UNC|dùng chung|file/i);
    assert.throws(
      () => validateDbConfig({ ...validConfig, fileStorageRoot: 'C:\\QTCN-Files' }),
      /UNC|dùng chung|file/i,
    );
    assert.equal(
      validateDbConfig({ ...validConfig, fileStorageRoot: '\\\\FILE-SERVER\\QTCN-Files\\' }).fileStorageRoot,
      '\\\\FILE-SERVER\\QTCN-Files',
    );
  });
});

test('writeDbConfig atomically encrypts password and merges unknown settings from the existing file', async () => {
  await withTempDir('db-config-write-', async (userDataPath) => {
    const configPath = path.join(userDataPath, 'db-config.json');
    const existing = {
      ...validConfig,
      backupDirectory: 'D:\\SqlBackup',
      futureSetting: { enabled: true },
    };
    fs.writeFileSync(configPath, JSON.stringify(existing, null, 2));

    const { writeDbConfig } = loadConfigModule(userDataPath);
    const saved = writeDbConfig({ database: 'QTCN_NEXT', password: '' });
    const disk = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    assert.equal(saved.server, 'db.internal');
    assert.equal(saved.database, 'QTCN_NEXT');
    assert.equal(saved.password, 'secret');
    assert.equal(saved.backupDirectory, 'D:\\SqlBackup');
    assert.deepEqual(saved.futureSetting, { enabled: true });
    assert.equal(Object.hasOwn(disk, 'password'), false);
    assert.equal(disk.passwordEncryption, 'electron-safe-storage-v1');
    assert.equal(typeof disk.passwordEncrypted, 'string');
    assert.equal(JSON.stringify(disk).includes('secret'), false);
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
    const saved = writeDbConfig({ instanceName: null, password: 'replacement-secret' });
    const disk = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    assert.equal(Object.hasOwn(saved, 'instanceName'), false);
    assert.equal(saved.backupDirectory, 'D:\\SqlBackup');
    assert.deepEqual(saved.futureSetting, { enabled: true });
    assert.equal(Object.hasOwn(disk, 'instanceName'), false);
    assert.equal(Object.hasOwn(disk, 'password'), false);
    assert.equal(disk.passwordEncryption, 'electron-safe-storage-v1');
  });
});

test('an unchanged endpoint and password keep the existing ciphertext instead of encrypting it again', async () => {
  await withTempDir('db-config-preserve-cipher-', async (userDataPath) => {
    const configPath = path.join(userDataPath, 'db-config.json');
    const { writeDbConfig } = loadConfigModule(userDataPath);
    writeDbConfig(validConfig);
    const before = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    const saved = writeDbConfig({ database: 'QTCN_NEXT', password: '' });
    const after = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    assert.equal(saved.password, 'secret');
    assert.equal(after.passwordEncrypted, before.passwordEncrypted);
  });
});

test('changing a credential endpoint requires a new password and leaves the old file untouched', async () => {
  await withTempDir('db-config-endpoint-password-', async (userDataPath) => {
    const configPath = path.join(userDataPath, 'db-config.json');
    const { writeDbConfig } = loadConfigModule(userDataPath);
    writeDbConfig(validConfig);
    const before = fs.readFileSync(configPath);

    assert.throws(
      () => writeDbConfig({ server: 'other-db.internal', password: '' }),
      /nhập lại mật khẩu/i,
    );
    assert.deepEqual(fs.readFileSync(configPath), before);
  });
});

test('recovery config never exposes plaintext password or ciphertext', async () => {
  await withTempDir('db-config-recovery-sanitize-', async (userDataPath) => {
    const configPath = path.join(userDataPath, 'db-config.json');
    fs.writeFileSync(configPath, JSON.stringify({
      ...validConfig,
      passwordEncrypted: 'must-not-leak',
      passwordEncryption: 'electron-safe-storage-v1',
    }));

    const { readDbConfigForRecovery } = loadConfigModule(userDataPath);
    const recovery = readDbConfigForRecovery();

    assert.equal(recovery.server, validConfig.server);
    assert.equal(recovery.database, validConfig.database);
    assert.equal(recovery.user, validConfig.user);
    assert.equal(Object.hasOwn(recovery, 'password'), false);
    assert.equal(Object.hasOwn(recovery, 'passwordEncrypted'), false);
    assert.equal(Object.hasOwn(recovery, 'passwordEncryption'), false);
  });
});

test('ciphertext from another machine enters recovery without losing public connection fields', async () => {
  await withTempDir('db-config-wrong-machine-', async (userDataPath) => {
    const configPath = path.join(userDataPath, 'db-config.json');
    fs.writeFileSync(configPath, JSON.stringify({
      mode: 'sqlserver',
      server: 'other-machine\\SQLEXPRESS',
      database: 'QTCN',
      user: 'QTCN',
      passwordEncrypted: Buffer.from('foreign-cipher').toString('base64'),
      passwordEncryption: 'electron-safe-storage-v1',
    }));

    const { readDbConfig, readDbConfigForRecovery } = loadConfigModule(userDataPath, {
      decryptError: new Error('DPAPI key mismatch'),
    });

    assert.throws(() => readDbConfig(), /không thể giải mã mật khẩu/i);
    assert.deepEqual(readDbConfigForRecovery(), {
      mode: 'sqlserver',
      server: 'other-machine\\SQLEXPRESS',
      database: 'QTCN',
      user: 'QTCN',
    });
  });
});

test('safeStorage unavailable never writes a plaintext fallback', async () => {
  await withTempDir('db-config-no-encryption-', async (userDataPath) => {
    const configPath = path.join(userDataPath, 'db-config.json');
    const { writeDbConfig } = loadConfigModule(userDataPath, { encryptionAvailable: false });

    assert.throws(() => writeDbConfig(validConfig), /mã hóa mật khẩu/i);
    assert.equal(fs.existsSync(configPath), false);
  });
});
