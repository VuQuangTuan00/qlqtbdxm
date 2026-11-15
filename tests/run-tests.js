'use strict';

const path = require('node:path');
const { discoverTests } = require('./helpers/test-discovery');

const suite = process.argv[2] || 'all';
const files = discoverTests(__dirname, suite);

if (!files.length) {
  throw new Error(`No tests found for suite: ${suite}`);
}

for (const file of files) require(path.resolve(file));
