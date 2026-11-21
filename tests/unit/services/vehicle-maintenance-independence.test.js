'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

function loadVehicleService({ techRepo, normRepo, fileStorageCalls }) {
  const servicePath = require.resolve('../../../main/services/vehicle.service');
  const paths = [
    servicePath,
    require.resolve('electron'),
    require.resolve('../../../main/repositories/vehicle.repository'),
    require.resolve('../../../main/repositories/tech-process-maintenance.repository'),
    require.resolve('../../../main/repositories/norm-ktkt-maintenance.repository'),
    require.resolve('../../../main/repositories/vehicle-type.repository'),
    require.resolve('../../../main/database/index'),
    require.resolve('../../../main/utils/logger'),
    require.resolve('../../../main/services/pending-file-cleanup.service'),
    require.resolve('../../../main/services/file-storage.service'),
  ];
  const saved = new Map(paths.map((modulePath) => [modulePath, require.cache[modulePath]]));
  const emptyRepository = {};
  const replacements = new Map([
    [paths[1], {
      app: { getPath() { return 'C:\\maintenance-test'; } },
      shell: { async openPath() { return ''; } },
    }],
    [paths[2], emptyRepository],
    [paths[3], techRepo],
    [paths[4], normRepo],
    [paths[5], emptyRepository],
    [paths[6], {
      getDb() {
        return { async query() { return { rows: [{ c: 0 }], rowCount: 0 }; } };
      },
    }],
    [paths[7], { info() {}, warn() {}, error() {} }],
    [paths[8], { deleteOrQueue() { return true; } }],
    [paths[9], {
      ensureFolder() { fileStorageCalls.push('ensureFolder'); return 'C:\\maintenance-test'; },
      toStoredPath(value) { return value; },
      resolveStoredPath() { return null; },
      toFileUrl() { return null; },
    }],
  ]);

  delete require.cache[servicePath];
  for (const [modulePath, exports] of replacements) {
    require.cache[modulePath] = {
      id: modulePath,
      filename: modulePath,
      loaded: true,
      exports,
    };
  }
  const service = require(servicePath);

  for (const [modulePath, cached] of saved) {
    if (cached) require.cache[modulePath] = cached;
    else delete require.cache[modulePath];
  }
  return service;
}

test('list normalizes rows from only the selected maintenance repository', async () => {
  const calls = [];
  const service = loadVehicleService({
    techRepo: {
      async findByVehicle() { calls.push('tech'); return []; },
    },
    normRepo: {
      async findByVehicle() {
        calls.push('norm');
        return [{
          norm_ktkt_id: 17,
          vehicle_id: 4,
          norm_ktkt_name: 'Định mức',
          display_order: 2,
          norm_ktkt_file_name: 'norm.pdf',
          norm_ktkt_file_path: 'maintenance-files/norm.pdf',
        }];
      },
    },
    fileStorageCalls: [],
  });

  const result = await service.listMaintenance(4, 'norm_ktkt');

  assert.deepEqual(calls, ['norm']);
  assert.deepEqual(result.data, [{
    maintenance_id: 17,
    vehicle_id: 4,
    maintenance_name: 'Định mức',
    display_order: 2,
    file_name: 'norm.pdf',
    file_path: 'maintenance-files/norm.pdf',
    tab: 'norm_ktkt',
  }]);
});

test('same numeric IDs remain scoped to the selected repository for mutations', async () => {
  const calls = [];
  const row = {
    tech_process_id: 9,
    vehicle_id: 4,
    tech_process_name: 'Quy trình',
    display_order: 1,
  };
  const normRow = {
    norm_ktkt_id: 9,
    vehicle_id: 4,
    norm_ktkt_name: 'Định mức',
    display_order: 1,
  };
  let currentNormRow = normRow;
  const techRepo = {
    async findById(id) { calls.push(['tech-find', id]); return row; },
    async delete(id) { calls.push(['tech-delete', id]); return true; },
  };
  const normRepo = {
    async getMaxOrder(vehicleId) { calls.push(['norm-max', vehicleId]); return 3; },
    async create(data) {
      calls.push(['norm-create', data]);
      return { ...normRow, ...data };
    },
    async findById(id) { calls.push(['norm-find', id]); return currentNormRow; },
    async update(id, data) {
      calls.push(['norm-update', id, data]);
      currentNormRow = { ...currentNormRow, ...data };
      return currentNormRow;
    },
    async reorderAll(vehicleId, orderedIds) { calls.push(['norm-reorder', vehicleId, orderedIds]); },
  };
  const service = loadVehicleService({ techRepo, normRepo, fileStorageCalls: [] });

  const created = await service.createMaintenance({
    vehicle_id: 4, tab: 'norm_ktkt', maintenance_name: '  Định mức mới  ',
  }, 7);
  const updated = await service.updateMaintenance(9, 'norm_ktkt', {
    maintenance_name: '  Định mức đã sửa  ',
  }, 7);
  await service.reorderMaintenance(4, 'norm_ktkt', [9], 7);
  await service.deleteMaintenance(9, 'tech_process', 7);

  assert.equal(created.data.maintenance_id, 9);
  assert.equal(created.data.maintenance_name, 'Định mức mới');
  assert.equal(created.data.tab, 'norm_ktkt');
  assert.equal(updated.data.maintenance_name, 'Định mức đã sửa');
  assert.deepEqual(calls, [
    ['norm-max', 4],
    ['norm-create', { vehicle_id: 4, norm_ktkt_name: 'Định mức mới', display_order: 4 }],
    ['norm-find', 9],
    ['norm-update', 9, { norm_ktkt_name: 'Định mức đã sửa' }],
    ['norm-reorder', 4, [9]],
    ['tech-find', 9],
    ['tech-delete', 9],
  ]);
});

test('missing or unknown tabs fail before repository or filesystem access', async () => {
  const calls = [];
  const unusedRepo = new Proxy({}, {
    get() {
      return async () => { calls.push('repository'); };
    },
  });
  const fileStorageCalls = [];
  const service = loadVehicleService({
    techRepo: unusedRepo,
    normRepo: unusedRepo,
    fileStorageCalls,
  });

  const results = await Promise.all([
    service.listMaintenance(1),
    service.createMaintenance({ vehicle_id: 1, maintenance_name: 'Tên' }),
    service.updateMaintenance(1, 'other', { maintenance_name: 'Tên' }),
    service.deleteMaintenance(1, 'other'),
    service.reorderMaintenance(1, 'other', [1]),
    service.uploadFile(1, 'other', { file_name: 'a.pdf', file_buffer: Buffer.from('%PDF-1.4') }),
    service.deleteFile(1, 'other'),
    service.readFile(1, 'other'),
    service.openFile(1, 'other'),
  ]);

  assert.ok(results.every((result) => result.success === false));
  assert.deepEqual(calls, []);
  assert.deepEqual(fileStorageCalls, []);
});
