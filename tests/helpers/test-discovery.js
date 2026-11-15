'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SUITES = ['unit', 'integration', 'security'];

function collectTestFiles(directory, output) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectTestFiles(fullPath, output);
    if (entry.isFile() && entry.name.endsWith('.test.js')) output.push(fullPath);
  }
}

function discoverTests(root, suite) {
  if (suite !== 'all' && !SUITES.includes(suite)) {
    throw new Error(`Unknown test suite: ${suite}`);
  }

  const selected = suite === 'all' ? SUITES : [suite];
  const files = [];
  for (const name of selected) collectTestFiles(path.join(root, name), files);
  return files.sort((a, b) => a.localeCompare(b, 'en'));
}

module.exports = { discoverTests };
