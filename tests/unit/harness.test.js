'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const { withTempDir } = require('../helpers/test-environment');

test('withTempDir gives the test an isolated directory and removes it afterward', async () => {
  let tempPath;

  await withTempDir('harness-', async (dir) => {
    tempPath = dir;
    assert.equal(fs.statSync(dir).isDirectory(), true);
    fs.writeFileSync(`${dir}\\evidence.txt`, 'isolated', 'utf8');
    assert.equal(fs.readFileSync(`${dir}\\evidence.txt`, 'utf8'), 'isolated');
  });

  assert.equal(fs.existsSync(tempPath), false);
});
