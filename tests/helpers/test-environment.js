'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

async function withTempDir(prefix, operation) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    return await operation(tempDir);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function requireIsolatedSqlServerConfig(env = process.env) {
  if (env.TEST_DB_ALLOW_DESTRUCTIVE !== 'true') {
    throw new Error('SQL integration is disabled; set TEST_DB_ALLOW_DESTRUCTIVE=true for an isolated test database.');
  }

  const required = ['TEST_DB_SERVER', 'TEST_DB_NAME', 'TEST_DB_USER', 'TEST_DB_PASSWORD'];
  const missing = required.filter((name) => !env[name]);
  if (missing.length) {
    throw new Error(`Missing isolated SQL test configuration: ${missing.join(', ')}`);
  }
  if (!env.TEST_DB_NAME.toLowerCase().endsWith('_test')) {
    throw new Error('TEST_DB_NAME must end with _test.');
  }

  const port = Number(env.TEST_DB_PORT || 1433);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('TEST_DB_PORT must be an integer from 1 to 65535.');
  }

  return {
    server: env.TEST_DB_SERVER,
    port,
    database: env.TEST_DB_NAME,
    user: env.TEST_DB_USER,
    password: env.TEST_DB_PASSWORD,
  };
}

module.exports = { withTempDir, requireIsolatedSqlServerConfig };
