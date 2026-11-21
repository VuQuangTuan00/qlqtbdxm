'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(
  path.resolve(__dirname, '../../../renderer/pages/maintenance/maintenance-steps.js'),
  'utf8',
);

test('renderer loads and renders separate lists for both tabs', () => {
  assert.match(source, /engineMaintenance:list', \{ vehicleId: id, tab: 'tech_process' \}/);
  assert.match(source, /engineMaintenance:list', \{ vehicleId: id, tab: 'norm_ktkt' \}/);
  assert.match(source, /const itemsByTab = \{\s*tech_process: resTech\.success[\s\S]*?norm_ktkt: resNorm\.success/);
  assert.match(source, /const items = itemsByTab\[activeTab\]/);
});

test('renderer item actions send the active tab and use the normalized maintenance DTO', () => {
  const actionChannels = [
    'create', 'update', 'delete', 'reorder',
    'uploadFile', 'readFile', 'openFile', 'deleteFile',
  ];
  for (const action of actionChannels) {
    assert.match(
      source,
      new RegExp(`engineMaintenance:${action}[\\s\\S]{0,180}?tab:\\s*activeTab`),
      `${action} must include the active tab`,
    );
  }

  for (const field of ['maintenance_id', 'maintenance_name', 'file_name', 'file_path']) {
    assert.match(source, new RegExp(`\\b${field}\\b`));
  }
  assert.doesNotMatch(source, /engine_maintenance_id|tech_process_id|norm_ktkt_id|tech_process_file_path|norm_ktkt_file_path/);
});

test('renderer computes each file count against its own maintenance list', () => {
  assert.match(source, /\$\{techCount\}\/\$\{techItems\.length\}/);
  assert.match(source, /\$\{normCount\}\/\$\{normItems\.length\}/);
  assert.match(source, /techItems\.filter\(\(i\) => i\.file_path\)/);
  assert.match(source, /normItems\.filter\(\(i\) => i\.file_path\)/);
});
