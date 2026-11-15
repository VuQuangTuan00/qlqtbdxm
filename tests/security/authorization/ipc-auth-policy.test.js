'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ipcDir = path.resolve(__dirname, '../../../main/ipc');

function handlerBody(fileName, channel) {
  const source = fs.readFileSync(path.join(ipcDir, fileName), 'utf8');
  const marker = `ipcMain.handle('${channel}'`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `Missing handler ${channel}`);
  const next = source.indexOf('ipcMain.handle(', start + marker.length);
  return source.slice(start, next === -1 ? source.length : next);
}

const authenticatedReads = [
  ['unit.ipc.js', 'unit:list'],
  ['unit.ipc.js', 'unit:get'],
  ['unit.ipc.js', 'unit:tree'],
  ['equipment.ipc.js', 'equipment:list'],
  ['equipment.ipc.js', 'equipment:get'],
  ['equipment.ipc.js', 'equipment:search'],
  ['equipment.ipc.js', 'equipment:getByQr'],
  ['maintenance-plan.ipc.js', 'plan:list'],
  ['maintenance-plan.ipc.js', 'plan:get'],
  ['maintenance-plan.ipc.js', 'plan:getSteps'],
  ['maintenance-log.ipc.js', 'log:list'],
  ['maintenance-log.ipc.js', 'log:get'],
  ['acceptance.ipc.js', 'acceptance:get'],
  ['vehicle.ipc.js', 'vehicle:list'],
  ['vehicle.ipc.js', 'vehicle:get'],
  ['vehicle.ipc.js', 'engineMaintenance:list'],
  ['vehicle.ipc.js', 'engineMaintenance:readFile'],
  ['vehicle.ipc.js', 'engineMaintenance:openFile'],
  ['vehicle.ipc.js', 'vehicleType:list'],
  ['auth.ipc.js', 'role:list'],
];

test('business-data read handlers enforce authentication in Main process', () => {
  for (const [fileName, channel] of authenticatedReads) {
    assert.match(
      handlerBody(fileName, channel),
      /authService\.requireAuth\(\)/,
      `${channel} must enforce authentication in Main process`
    );
  }
});

test('user and role administration handlers enforce admin authorization', () => {
  for (const channel of ['user:list', 'role:list']) {
    assert.match(
      handlerBody('auth.ipc.js', channel),
      /authService\.requireAdmin\(\)/,
      `${channel} must enforce admin authorization in Main process`
    );
  }
});

test('administrative and workflow mutations enforce renderer-visible roles in Main process', () => {
  for (const channel of ['unit:create', 'unit:update', 'unit:delete']) {
    assert.match(
      handlerBody('unit.ipc.js', channel),
      /authService\.requireAdmin\(\)/,
      `${channel} must enforce the admin-only settings policy in Main process`
    );
  }

  for (const channel of ['log:create', 'log:update', 'log:updateStatus']) {
    assert.match(
      handlerBody('maintenance-log.ipc.js', channel),
      /\['admin', 'technician', 'commander'\]\.includes\(session\.roleCode\)/,
      `${channel} must enforce the maintenance executor role policy in Main process`
    );
  }

  assert.match(
    handlerBody('acceptance.ipc.js', 'acceptance:update'),
    /\['admin', 'commander', 'inspector'\]\.includes\(session\.roleCode\)/,
    'acceptance:update must enforce the same roles as acceptance:create'
  );
});

