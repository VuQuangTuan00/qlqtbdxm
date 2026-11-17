'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('application startup retries the pending file cleanup queue after Electron is ready', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../main/index.js'), 'utf8');

  assert.match(
    source,
    /require\(['"]\.\/services\/pending-file-cleanup\.service['"]\)/
  );
  const readyBody = source.slice(source.indexOf('app.whenReady().then'));
  assert.match(readyBody, /processPendingCleanup\(\)/);
});
