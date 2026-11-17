'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildMssqlConnectionOptions,
  normalizeEndpoint,
} = require('../../../main/database/mssql');

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

test('local SQLEXPRESS shorthand uses localhost and named-instance discovery', () => {
  const options = buildMssqlConnectionOptions({
    ...base,
    server: '.\\SQLEXPRESS',
    port: 1433,
  });

  assert.equal(options.server, 'localhost');
  assert.equal(options.options.instanceName, 'SQLEXPRESS');
  assert.equal(Object.hasOwn(options, 'port'), false);
});

test('(local) shorthand normalizes to localhost', () => {
  assert.deepEqual(
    normalizeEndpoint({ server: '(local)' }),
    { server: 'localhost', instanceName: '', port: undefined },
  );
});

test('port embedded in server takes precedence over the port field', () => {
  const options = buildMssqlConnectionOptions({
    ...base,
    server: 'HOST,14330',
    port: 1433,
  });

  assert.equal(options.server, 'HOST');
  assert.equal(options.port, 14330);
  assert.equal(Object.hasOwn(options.options, 'instanceName'), false);
});

test('default port remains explicit when no instance is configured', () => {
  const options = buildMssqlConnectionOptions({ ...base, server: 'HOST', port: 1433 });

  assert.equal(options.server, 'HOST');
  assert.equal(options.port, 1433);
  assert.equal(Object.hasOwn(options.options, 'instanceName'), false);
});

test('explicit non-default port takes precedence over an instance name', () => {
  const options = buildMssqlConnectionOptions({
    ...base,
    server: 'HOST',
    instanceName: 'SQLEXPRESS',
    port: 14330,
  });

  assert.equal(options.server, 'HOST');
  assert.equal(options.port, 14330);
  assert.equal(Object.hasOwn(options.options, 'instanceName'), false);
});

test('tcp prefix is removed from the server name', () => {
  assert.equal(normalizeEndpoint({ server: 'tcp:HOST' }).server, 'HOST');
});

test('empty server is not converted to localhost', () => {
  assert.equal(normalizeEndpoint({ server: '' }).server, '');
});

test('connection options reject an invalid port embedded in the server', () => {
  assert.throws(
    () => buildMssqlConnectionOptions({ ...base, server: 'HOST,0' }),
    /Cổng SQL Server/i,
  );
  assert.throws(
    () => buildMssqlConnectionOptions({ ...base, server: 'HOST,65536' }),
    /Cổng SQL Server/i,
  );
});

test('connection options reject a server that becomes empty after normalization', () => {
  for (const server of ['tcp:', ',1433', '\\SQLEXPRESS']) {
    assert.throws(
      () => buildMssqlConnectionOptions({ ...base, server }),
      /Máy chủ SQL Server/i,
      server,
    );
  }
});

test('connection options reject an empty instance embedded in the server', () => {
  assert.throws(
    () => buildMssqlConnectionOptions({ ...base, server: 'HOST\\   ' }),
    /instance SQL Server/i,
  );
});
