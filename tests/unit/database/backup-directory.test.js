'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const { withTempDir } = require('../../helpers/test-environment');
const { resolveMssqlBackupDirectory } = require('../../../main/database/mssql');

test('configured backupDirectory takes precedence without querying SQL Server', async () => {
  await withTempDir('configured-backup-', async (directory) => {
    let queryCount = 0;
    const result = await resolveMssqlBackupDirectory(
      { backupDirectory: `  ${directory}  ` },
      async () => { queryCount += 1; return 'must-not-be-used'; },
    );

    assert.equal(result, directory);
    assert.equal(queryCount, 0);
  });
});

test('empty backupDirectory falls back to the SQL Server instance default', async () => {
  await withTempDir('server-backup-', async (directory) => {
    let queryCount = 0;
    const result = await resolveMssqlBackupDirectory(
      { backupDirectory: '   ' },
      async () => { queryCount += 1; return directory; },
    );

    assert.equal(result, directory);
    assert.equal(queryCount, 1);
  });
});

test('missing SQL Server backup property reports how to configure a shared path', async () => {
  await assert.rejects(
    () => resolveMssqlBackupDirectory({}, async () => null),
    /backupDirectory.*UNC/i,
  );
});

test('backup directory must be visible to both SQL Server and Electron', async () => {
  await assert.rejects(
    () => resolveMssqlBackupDirectory({}, async () => 'Z:\\missing-sql-backup'),
    /không tìm thấy.*backupDirectory.*UNC/i,
  );
});

test('backup directory access errors are normalized with local and UNC guidance', async () => {
  const originalExists = fs.existsSync;
  const originalStat = fs.statSync;
  fs.existsSync = () => true;
  fs.statSync = () => { throw new Error('EACCES'); };
  try {
    await assert.rejects(
      () => resolveMssqlBackupDirectory({ backupDirectory: '\\\\sql-host\\backup' }, async () => ''),
      /không thể truy cập.*backupDirectory.*UNC/i,
    );
  } finally {
    fs.existsSync = originalExists;
    fs.statSync = originalStat;
  }
});
