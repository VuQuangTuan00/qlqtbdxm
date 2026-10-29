'use strict';

const { spawnSync } = require('child_process');
const electronPath = require('electron');

const script = process.argv[2];
if (!script) {
  console.error('Usage: node scripts/run-electron-gui-test.js <electron-entry.js>');
  process.exit(2);
}

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const result = spawnSync(electronPath, [script], { env, stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
