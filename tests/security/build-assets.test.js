'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');

test('window and Windows build icons resolve to logo_app-derived local assets', () => {
  const windowManager = fs.readFileSync(path.join(root, 'main/window-manager.js'), 'utf8');
  const builder = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8');
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const iconPath = path.join(root, 'build/icon.ico');

  assert.match(windowManager, /renderer\/assets\/images\/logo_app\.png/);
  assert.match(builder, /icon:\s*icon\.ico/);
  assert.equal(packageJson.build.win.icon, 'icon.ico');
  assert.doesNotMatch(packageJson.scripts.clean, /\bbuild\b/, 'clean must preserve electron-builder resources');
  assert.equal(fs.existsSync(iconPath), true);

  const header = fs.readFileSync(iconPath).subarray(0, 6);
  assert.deepEqual([...header.subarray(0, 4)], [0, 0, 1, 0]);
  assert.ok(header.readUInt16LE(4) >= 5, 'ICO should contain multiple Windows icon sizes');
});
