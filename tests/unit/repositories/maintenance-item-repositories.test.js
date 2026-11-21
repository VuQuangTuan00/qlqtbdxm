'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

function loadRepositories(query) {
  const databasePath = require.resolve('../../../main/database/index');
  const basePath = require.resolve('../../../main/repositories/base.repository');
  const itemBasePath = require.resolve('../../../main/repositories/maintenance-item.repository');
  const techPath = require.resolve('../../../main/repositories/tech-process-maintenance.repository');
  const normPath = require.resolve('../../../main/repositories/norm-ktkt-maintenance.repository');
  const paths = [databasePath, basePath, itemBasePath, techPath, normPath];
  const saved = new Map(paths.map((modulePath) => [modulePath, require.cache[modulePath]]));

  require.cache[databasePath] = {
    id: databasePath,
    filename: databasePath,
    loaded: true,
    exports: { getDb: () => ({ query }) },
  };
  for (const modulePath of paths.slice(1)) delete require.cache[modulePath];
  const repositories = { tech: require(techPath), norm: require(normPath) };

  for (const [modulePath, cached] of saved) {
    if (cached) require.cache[modulePath] = cached;
    else delete require.cache[modulePath];
  }
  return repositories;
}

test('maintenance repositories use fixed table and primary-key identifiers', async () => {
  const queries = [];
  const repositories = loadRepositories(async (sql, params) => {
    queries.push({ sql, params });
    return { rows: [{ id: 8 }], rowCount: 1 };
  });

  await repositories.tech.findById(8);
  await repositories.norm.findById(8);
  await repositories.tech.findByVehicle(4);
  await repositories.norm.findByVehicle(4);

  assert.match(queries[0].sql, /FROM tech_process_maintenance WHERE tech_process_id = \$1/);
  assert.match(queries[1].sql, /FROM norm_ktkt_maintenance WHERE norm_ktkt_id = \$1/);
  assert.match(queries[2].sql, /FROM tech_process_maintenance[\s\S]*ORDER BY display_order, tech_process_id/);
  assert.match(queries[3].sql, /FROM norm_ktkt_maintenance[\s\S]*ORDER BY display_order, norm_ktkt_id/);
});

test('maintenance create and update use the RETURNING adapter result', async () => {
  const queries = [];
  const repositories = loadRepositories(async (sql, params) => {
    queries.push({ sql, params });
    return { rows: [{ vehicle_id: 4, tech_process_name: 'Quy trình' }], rowCount: 1 };
  });

  const created = await repositories.tech.create({
    vehicle_id: 4, tech_process_name: 'Quy trình', display_order: 1,
  });
  const updated = await repositories.tech.update(9, { tech_process_name: 'Quy trình mới' });

  assert.equal(created.tech_process_name, 'Quy trình');
  assert.equal(updated.tech_process_name, 'Quy trình');
  assert.match(queries[0].sql, /INSERT INTO tech_process_maintenance[\s\S]*RETURNING \*/);
  assert.match(queries[1].sql, /UPDATE tech_process_maintenance[\s\S]*WHERE tech_process_id = \$2 RETURNING \*/);
});

test('maintenance reorder updates are scoped by both item ID and vehicle ID', async () => {
  const queries = [];
  const repositories = loadRepositories(async (sql, params) => {
    queries.push({ sql, params });
    return { rows: [], rowCount: 1 };
  });

  await repositories.tech.reorderAll(4, [8, 9]);
  await repositories.norm.reorderAll(5, [8]);

  assert.equal(queries.length, 3);
  assert.match(queries[0].sql, /WHERE tech_process_id = \$2 AND vehicle_id = \$3/);
  assert.deepEqual(queries[0].params, [1, 8, 4]);
  assert.match(queries[2].sql, /WHERE norm_ktkt_id = \$2 AND vehicle_id = \$3/);
  assert.deepEqual(queries[2].params, [1, 8, 5]);
});
