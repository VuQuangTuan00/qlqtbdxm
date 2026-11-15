'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { requireIsolatedSqlServerConfig } = require('../helpers/test-environment');

test('test harness never falls back to production-style DB environment variables', () => {
  assert.throws(
    () => requireIsolatedSqlServerConfig({
      TEST_DB_ALLOW_DESTRUCTIVE: 'true',
      DB_SERVER: 'production-host',
      DB_NAME: 'QTCN',
      DB_USER: 'production-user',
      DB_PASSWORD: 'production-password',
    }),
    /Missing isolated SQL test configuration/,
  );
});
