'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

function loadSubject({ failIncomingRestore = false, failSafetyRestore = false } = {}) {
  const subjectPath = require.resolve('../../../main/database/mssql');
  const configPath = require.resolve('../../../main/config/db-config');
  const mssqlPath = require.resolve('mssql');
  const saved = new Map([
    [subjectPath, require.cache[subjectPath]],
    [configPath, require.cache[configPath]],
    [mssqlPath, require.cache[mssqlPath]],
  ]);
  const calls = [];

  class FakeRequest {
    constructor(pool) {
      this.pool = pool;
      this.inputs = {};
      this.timeout = 0;
    }

    input(name, _type, value) {
      this.inputs[name] = value;
      return this;
    }

    async query(statement) {
      calls.push({ statement, inputs: { ...this.inputs } });
      if (/RESTORE\s+FILELISTONLY/i.test(statement)) {
        return {
          recordset: [
            { LogicalName: 'QTCN_Data', Type: 'D' },
            { LogicalName: 'QTCN_Log', Type: 'L' },
          ],
        };
      }
      if (/sys\.master_files/i.test(statement)) {
        return {
          recordset: [
            { type_desc: 'ROWS', physical_name: 'D:\\SQLData\\QTCN.mdf' },
            { type_desc: 'LOG', physical_name: 'D:\\SQLData\\QTCN_log.ldf' },
          ],
        };
      }
      if (/InstanceDefaultDataPath/i.test(statement)) {
        return { recordset: [{ data_path: 'D:\\SQLData', log_path: 'D:\\SQLLog' }] };
      }
      if (failIncomingRestore && /RESTORE\s+DATABASE/i.test(statement) &&
          this.inputs.backupPath === 'D:\\Backup\\incoming.bak') {
        throw new Error('simulated restore failure');
      }
      if (failSafetyRestore && /RESTORE\s+DATABASE/i.test(statement) &&
          this.inputs.backupPath === 'D:\\Backup\\safety.bak') {
        throw new Error('simulated rollback failure');
      }
      if (/state_desc/i.test(statement)) return { recordset: [{ state_desc: 'ONLINE' }] };
      return { recordset: [] };
    }
  }

  class FakeConnectionPool {
    constructor(options) {
      this.options = options;
      calls.push({ connectOptions: options });
    }
    async connect() { calls.push({ connected: true }); return this; }
    request() { return new FakeRequest(this); }
    async close() { calls.push({ closed: true }); }
  }

  const fakeSql = {
    ConnectionPool: FakeConnectionPool,
    NVarChar: () => 'NVarChar',
    MAX: -1,
    Bit: 'Bit',
    Int: 'Int',
    Float: 'Float',
    DateTime2: 'DateTime2',
    Transaction: class {},
    Request: class {},
    connect: async (options) => {
      calls.push({ globalConnectOptions: options });
      return new FakeConnectionPool(options);
    },
  };
  delete require.cache[subjectPath];
  require.cache[mssqlPath] = { id: mssqlPath, filename: mssqlPath, loaded: true, exports: fakeSql };
  require.cache[configPath] = {
    id: configPath,
    filename: configPath,
    loaded: true,
    exports: {
      readDbConfig: () => ({
        mode: 'sqlserver', server: 'localhost', database: 'QTCN', user: 'app', password: 'secret', port: 1433,
      }),
    },
  };
  const subject = require(subjectPath);

  function restoreModules() {
    for (const [modulePath, cached] of saved) {
      if (cached) require.cache[modulePath] = cached;
      else delete require.cache[modulePath];
    }
  }

  return { subject, calls, restoreModules };
}

test('database restore verifies backup, creates safety backup and restores through master', async () => {
  const { subject, calls, restoreModules } = loadSubject();
  try {
    const result = await subject.restoreMssqlDatabase(
      'D:\\Backup\\incoming.bak',
      'D:\\Backup\\safety.bak',
    );

    assert.equal(calls.find((call) => call.connectOptions)?.connectOptions.database, 'master');
    const statements = calls.filter((call) => call.statement).map((call) => call.statement);
    assert.ok(statements.some((sql) => /RESTORE\s+VERIFYONLY/i.test(sql)));
    assert.ok(statements.some((sql) => /BACKUP\s+DATABASE/i.test(sql)));
    assert.ok(statements.some((sql) => /SINGLE_USER/i.test(sql)));
    assert.ok(statements.some((sql) => /RESTORE\s+DATABASE/i.test(sql) && /WITH\s+REPLACE/i.test(sql)));
    assert.ok(statements.some((sql) => /MULTI_USER/i.test(sql)));
    assert.equal(result.safetyBackupPath, 'D:\\Backup\\safety.bak');
  } finally {
    restoreModules();
  }
});

test('database restore rolls back from safety backup when incoming restore fails', async () => {
  const { subject, calls, restoreModules } = loadSubject({ failIncomingRestore: true });
  try {
    await assert.rejects(
      subject.restoreMssqlDatabase('D:\\Backup\\incoming.bak', 'D:\\Backup\\safety.bak'),
      /simulated restore failure.*phục hồi database cũ thành công/is,
    );

    const restoreCalls = calls.filter((call) => /RESTORE\s+DATABASE/i.test(call.statement || ''));
    assert.equal(restoreCalls.length, 2);
    assert.equal(restoreCalls[0].inputs.backupPath, 'D:\\Backup\\incoming.bak');
    assert.equal(restoreCalls[1].inputs.backupPath, 'D:\\Backup\\safety.bak');
    assert.ok(calls.some((call) => /MULTI_USER/i.test(call.statement || '')));
    assert.equal(calls.filter((call) => call.globalConnectOptions).length, 1);
  } finally {
    restoreModules();
  }
});

test('database restore still attempts MULTI_USER when safety rollback fails', async () => {
  const { subject, calls, restoreModules } = loadSubject({
    failIncomingRestore: true,
    failSafetyRestore: true,
  });
  try {
    await assert.rejects(
      subject.restoreMssqlDatabase('D:\\Backup\\incoming.bak', 'D:\\Backup\\safety.bak'),
      /simulated rollback failure/i,
    );

    const accessStatements = calls
      .filter((call) => /ALTER\s+DATABASE/i.test(call.statement || ''))
      .map((call) => call.statement);
    assert.match(accessStatements.at(-1), /MULTI_USER/i);
  } finally {
    restoreModules();
  }
});
