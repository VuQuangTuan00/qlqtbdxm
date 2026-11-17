'use strict';

const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const test = require('node:test');

function loadLogger(isPackaged) {
  const loggerPath = require.resolve('../../../main/utils/logger');
  const electronPath = require.resolve('electron');
  const electronLogPath = require.resolve('electron-log');
  const saved = new Map([
    [loggerPath, require.cache[loggerPath]],
    [electronPath, require.cache[electronPath]],
    [electronLogPath, require.cache[electronLogPath]],
  ]);
  const fakeLog = {
    transports: {
      file: {},
      console: {},
    },
    error() {}, warn() {}, info() {}, debug() {}, verbose() {},
  };
  require.cache[electronPath] = {
    id: electronPath, filename: electronPath, loaded: true, exports: { app: { isPackaged } },
  };
  require.cache[electronLogPath] = {
    id: electronLogPath, filename: electronLogPath, loaded: true, exports: fakeLog,
  };
  delete require.cache[loggerPath];
  require(loggerPath);

  for (const [modulePath, cached] of saved) {
    if (cached) require.cache[modulePath] = cached;
    else delete require.cache[modulePath];
  }
  return fakeLog;
}

test('logger uses stable levels derived from Electron packaging state', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousLogLevel = process.env.LOG_LEVEL;
  process.env.NODE_ENV = 'production';
  process.env.LOG_LEVEL = 'verbose';
  try {
    const development = loadLogger(false);
    assert.equal(development.transports.file.level, 'info');
    assert.equal(development.transports.console.level, 'debug');

    process.env.NODE_ENV = 'development';
    const packaged = loadLogger(true);
    assert.equal(packaged.transports.file.level, 'info');
    assert.equal(packaged.transports.console.level, 'warn');
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousLogLevel === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = previousLogLevel;
  }
});

test('password hashing keeps cost 10 and ignores BCRYPT_ROUNDS', () => {
  const modulePath = require.resolve('../../../main/utils/hash');
  const savedModule = require.cache[modulePath];
  const previous = process.env.BCRYPT_ROUNDS;
  process.env.BCRYPT_ROUNDS = '4';
  delete require.cache[modulePath];
  try {
    const { hashPassword, comparePassword } = require(modulePath);
    const encoded = hashPassword('correct horse battery staple');
    assert.equal(bcrypt.getRounds(encoded), 10);
    assert.equal(comparePassword('correct horse battery staple', encoded), true);
  } finally {
    if (savedModule) require.cache[modulePath] = savedModule;
    else delete require.cache[modulePath];
    if (previous === undefined) delete process.env.BCRYPT_ROUNDS;
    else process.env.BCRYPT_ROUNDS = previous;
  }
});
