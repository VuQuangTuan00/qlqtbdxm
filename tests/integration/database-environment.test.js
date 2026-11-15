'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { requireIsolatedSqlServerConfig } = require('../helpers/test-environment');

test('SQL integration refuses to run without an explicit destructive-test opt-in', () => {
  assert.throws(
    () => requireIsolatedSqlServerConfig({
      TEST_DB_SERVER: 'test-host',
      TEST_DB_NAME: 'maintenance_test',
      TEST_DB_USER: 'test-user',
      TEST_DB_PASSWORD: 'test-password',
    }),
    /TEST_DB_ALLOW_DESTRUCTIVE=true/,
  );
});

test('SQL integration refuses a database name that is not explicitly test-only', () => {
  assert.throws(
    () => requireIsolatedSqlServerConfig({
      TEST_DB_ALLOW_DESTRUCTIVE: 'true',
      TEST_DB_SERVER: 'test-host',
      TEST_DB_NAME: 'QTCN',
      TEST_DB_USER: 'test-user',
      TEST_DB_PASSWORD: 'test-password',
    }),
    /must end with _test/,
  );
});

test('SQL integration accepts only an explicitly named isolated test database', () => {
  const config = requireIsolatedSqlServerConfig({
    TEST_DB_ALLOW_DESTRUCTIVE: 'true',
    TEST_DB_SERVER: 'test-host',
    TEST_DB_PORT: '14330',
    TEST_DB_NAME: 'maintenance_test',
    TEST_DB_USER: 'test-user',
    TEST_DB_PASSWORD: 'test-password',
  });

  assert.deepEqual(config, {
    server: 'test-host',
    port: 14330,
    database: 'maintenance_test',
    user: 'test-user',
    password: 'test-password',
  });
});
