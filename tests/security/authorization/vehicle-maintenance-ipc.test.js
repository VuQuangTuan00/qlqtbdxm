'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

function loadHandlers(authState, serviceCalls) {
  const handlers = new Map();
  const paths = [
    require.resolve('electron'),
    require.resolve('../../../main/ipc/vehicle.ipc'),
    require.resolve('../../../main/services/vehicle.service'),
    require.resolve('../../../main/services/auth.service'),
    require.resolve('../../../main/utils/response'),
  ];
  const saved = new Map(paths.map((modulePath) => [modulePath, require.cache[modulePath]]));
  const success = async (...args) => {
    serviceCalls.push(args);
    return { success: true };
  };
  const service = {
    listMaintenance: success,
    createMaintenance: success,
    updateMaintenance: success,
    deleteMaintenance: success,
    reorderMaintenance: success,
    uploadFile: success,
    deleteFile: success,
    readFile: success,
    openFile: success,
  };
  const replacements = new Map([
    [paths[0], {
      ipcMain: { handle(channel, handler) { handlers.set(channel, handler); } },
    }],
    [paths[2], service],
    [paths[3], {
      requireAuth() { return authState.session; },
      requireAdmin() { return authState.isAdmin; },
    }],
    [paths[4], { fail(error) { return { success: false, error }; } }],
  ]);

  delete require.cache[paths[1]];
  for (const [modulePath, exports] of replacements) {
    require.cache[modulePath] = {
      id: modulePath,
      filename: modulePath,
      loaded: true,
      exports,
    };
  }
  const ipc = require(paths[1]);
  ipc.register();

  for (const [modulePath, cached] of saved) {
    if (cached) require.cache[modulePath] = cached;
    else delete require.cache[modulePath];
  }
  return handlers;
}

test('maintenance IPC forwards tab to each list and mutation service call', async () => {
  const calls = [];
  const handlers = loadHandlers({
    session: { userId: 7 },
    isAdmin: true,
  }, calls);

  await handlers.get('engineMaintenance:list')({}, { vehicleId: 3, tab: 'norm_ktkt' });
  await handlers.get('engineMaintenance:create')({}, {
    vehicle_id: 3, tab: 'tech_process', maintenance_name: 'Quy trình',
  });
  await handlers.get('engineMaintenance:update')({}, {
    id: 11, tab: 'norm_ktkt', data: { maintenance_name: 'Định mức' },
  });
  await handlers.get('engineMaintenance:delete')({}, { id: 12, tab: 'tech_process' });
  await handlers.get('engineMaintenance:reorder')({}, {
    vehicleId: 3, tab: 'norm_ktkt', orderedIds: [9, 8],
  });

  assert.deepEqual(calls, [
    [3, 'norm_ktkt'],
    [{ vehicle_id: 3, tab: 'tech_process', maintenance_name: 'Quy trình' }, 7],
    [11, 'norm_ktkt', { maintenance_name: 'Định mức' }, 7],
    [12, 'tech_process', 7],
    [3, 'norm_ktkt', [9, 8], 7],
  ]);
});

test('maintenance IPC keeps authentication and admin checks before service access', async () => {
  const calls = [];
  const handlers = loadHandlers({
    session: null,
    isAdmin: false,
  }, calls);

  const unauthenticated = await handlers.get('engineMaintenance:list')({}, {
    vehicleId: 3, tab: 'tech_process',
  });
  assert.equal(unauthenticated.success, false);

  const authState = { session: { userId: 7 }, isAdmin: false };
  const guardedHandlers = loadHandlers(authState, calls);
  const mutations = [
    ['engineMaintenance:create', { vehicle_id: 3, tab: 'tech_process', maintenance_name: 'A' }],
    ['engineMaintenance:update', { id: 1, tab: 'tech_process', data: { maintenance_name: 'B' } }],
    ['engineMaintenance:delete', { id: 1, tab: 'tech_process' }],
    ['engineMaintenance:reorder', { vehicleId: 3, tab: 'tech_process', orderedIds: [1] }],
    ['engineMaintenance:uploadFile', { id: 1, tab: 'tech_process', fileData: {} }],
    ['engineMaintenance:deleteFile', { id: 1, tab: 'tech_process' }],
  ];
  for (const [channel, payload] of mutations) {
    const result = await guardedHandlers.get(channel)({}, payload);
    assert.equal(result.success, false, `${channel} must require admin`);
  }

  assert.deepEqual(calls, []);
});
