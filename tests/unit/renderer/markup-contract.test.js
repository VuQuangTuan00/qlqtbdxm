'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const renderer = path.resolve(__dirname, '../../../renderer');

test('page action containers have well-formed class and style attributes', () => {
  const equipment = fs.readFileSync(path.join(renderer, 'pages/equipment/list.js'), 'utf8');
  const plans = fs.readFileSync(path.join(renderer, 'pages/maintenance/plan-list.js'), 'utf8');

  assert.match(equipment, /class="page-header-actions" style="margin:var\(--space-2\) 0;"/);
  assert.match(plans, /class="page-header-actions" style="margin:var\(--space-2\) 0;"/);
  assert.doesNotMatch(equipment, /class="page-header-actions style=/);
  assert.doesNotMatch(plans, /class="page-header-actions" style="[^"]*>/);
});
