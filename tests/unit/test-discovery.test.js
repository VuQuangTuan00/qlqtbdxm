'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { withTempDir } = require('../helpers/test-environment');
const { discoverTests } = require('../helpers/test-discovery');

test('discoverTests selects only test files from the requested suite', async () => {
  await withTempDir('test-discovery-', async (root) => {
    fs.mkdirSync(path.join(root, 'unit'), { recursive: true });
    fs.mkdirSync(path.join(root, 'integration'), { recursive: true });
    fs.writeFileSync(path.join(root, 'unit', 'alpha.test.js'), '', 'utf8');
    fs.writeFileSync(path.join(root, 'unit', 'helper.js'), '', 'utf8');
    fs.writeFileSync(path.join(root, 'integration', 'beta.test.js'), '', 'utf8');

    assert.deepEqual(discoverTests(root, 'unit'), [path.join(root, 'unit', 'alpha.test.js')]);
    assert.deepEqual(discoverTests(root, 'all'), [
      path.join(root, 'integration', 'beta.test.js'),
      path.join(root, 'unit', 'alpha.test.js'),
    ]);
  });
});
