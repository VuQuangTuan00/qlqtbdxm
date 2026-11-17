'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { buildMssqlConnectionOptions } = require('../../../main/database/mssql');

const base = {
  mode: 'sqlserver',
  server: 'sql.internal',
  database: 'QTCN',
  user: 'qtcn_app',
  password: 'secret',
};

test('numeric port is used without fabricating an instance name', () => {
  const options = buildMssqlConnectionOptions({ ...base, port: 14330 });

  assert.equal(options.server, 'sql.internal');
  assert.equal(options.port, 14330);
  assert.equal(options.database, 'QTCN');
  assert.equal(options.user, 'qtcn_app');
  assert.equal(options.password, 'secret');
  assert.equal(Object.hasOwn(options.options, 'instanceName'), false);
});

test('named instance is used without fabricating a port', () => {
  const options = buildMssqlConnectionOptions({ ...base, instanceName: 'SQLEXPRESS' });

  assert.equal(Object.hasOwn(options, 'port'), false);
  assert.equal(options.options.instanceName, 'SQLEXPRESS');
});

test('server-only config does not inject machine-specific endpoint defaults', () => {
  const options = buildMssqlConnectionOptions(base);

  assert.equal(options.server, 'sql.internal');
  assert.equal(Object.hasOwn(options, 'port'), false);
  assert.equal(Object.hasOwn(options.options, 'instanceName'), false);
});
