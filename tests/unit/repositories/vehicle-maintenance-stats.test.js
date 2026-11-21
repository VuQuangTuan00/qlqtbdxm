'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

function loadVehicleRepository(query) {
  const databasePath = require.resolve('../../../main/database/index');
  const basePath = require.resolve('../../../main/repositories/base.repository');
  const repositoryPath = require.resolve('../../../main/repositories/vehicle.repository');
  const saved = new Map([
    [databasePath, require.cache[databasePath]],
    [basePath, require.cache[basePath]],
    [repositoryPath, require.cache[repositoryPath]],
  ]);

  require.cache[databasePath] = {
    id: databasePath,
    filename: databasePath,
    loaded: true,
    exports: { getDb: () => ({ query }) },
  };
  delete require.cache[basePath];
  delete require.cache[repositoryPath];
  const repository = require(repositoryPath);

  for (const [modulePath, cached] of saved) {
    if (cached) require.cache[modulePath] = cached;
    else delete require.cache[modulePath];
  }
  return repository;
}

test('vehicle file sorting and maintenance totals aggregate both independent tables', async () => {
  let capturedSql = '';
  const repository = loadVehicleRepository(async (sql) => {
    capturedSql = sql;
    return { rows: [{ maintenance_count: 5, tech_file_count: 2, norm_file_count: 1 }] };
  });

  const rows = await repository.listWithStats({ sort: 'files' });

  assert.equal(rows[0].maintenance_count, 5);
  assert.match(capturedSql, /FROM tech_process_maintenance/);
  assert.match(capturedSql, /FROM norm_ktkt_maintenance/);
  assert.match(capturedSql, /ISNULL\(ts\.maintenance_count, 0\) \+ ISNULL\(ns\.maintenance_count, 0\)/);
  assert.match(capturedSql, /ISNULL\(ts\.tech_file_count, 0\) \+ ISNULL\(ns\.norm_file_count, 0\)/);
  assert.doesNotMatch(capturedSql, /engine_maintenance/);
});
