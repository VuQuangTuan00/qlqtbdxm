'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

function loadAuthIpc(authService, userRepo) {
  const handlers = new Map();
  const replacements = new Map([
    [require.resolve('electron'), {
      ipcMain: { handle(channel, handler) { handlers.set(channel, handler); } },
    }],
    [require.resolve('../../../main/services/auth.service'), authService],
    [require.resolve('../../../main/repositories/user.repository'), userRepo],
    [require.resolve('../../../main/database/index'), {
      getDb() { return { async query() { return { rows: [] }; } }; },
    }],
    [require.resolve('../../../main/utils/hash'), { hashPassword(value) { return value; } }],
  ]);
  const modulePath = require.resolve('../../../main/ipc/auth.ipc');
  const saved = new Map([[modulePath, require.cache[modulePath]]]);
  delete require.cache[modulePath];
  for (const [replacementPath, exports] of replacements) {
    saved.set(replacementPath, require.cache[replacementPath]);
    require.cache[replacementPath] = {
      id: replacementPath,
      filename: replacementPath,
      loaded: true,
      exports,
    };
  }
  const ipc = require(modulePath);
  ipc.register();
  for (const [savedPath, cached] of saved) {
    if (cached) require.cache[savedPath] = cached;
    else delete require.cache[savedPath];
  }
  return handlers;
}

test('an admin cannot disable the account backing the active session', async () => {
  let setActiveCalled = false;
  const authService = {
    requireAuth: () => ({ userId: 7, roleCode: 'admin' }),
    requireAdmin: () => true,
  };
  const userRepo = {
    async findById() { return { id: 7, is_active: true }; },
    async setActive() { setActiveCalled = true; },
  };
  const handlers = loadAuthIpc(authService, userRepo);

  const result = await handlers.get('user:toggleActive')(null, { id: 7 });
  assert.equal(result.success, false);
  assert.match(result.error, /đang đăng nhập/i);
  assert.equal(setActiveCalled, false);
});

test('a non-admin session cannot enumerate users', async () => {
  let listCalled = false;
  const authService = {
    requireAuth: () => ({ userId: 8, roleCode: 'technician' }),
    requireAdmin: () => false,
  };
  const userRepo = {
    async listUsers() { listCalled = true; return []; },
  };
  const handlers = loadAuthIpc(authService, userRepo);

  const result = await handlers.get('user:list')(null, {});
  assert.equal(result.success, false);
  assert.equal(listCalled, false);
});

test('user creation enforces the same minimum password length as password changes', async () => {
  let createCalled = false;
  const authService = {
    requireAuth: () => ({ userId: 7, roleCode: 'admin' }),
    requireAdmin: () => true,
  };
  const userRepo = {
    async findByUsername() { return null; },
    async create() { createCalled = true; return { id: 9 }; },
  };
  const handlers = loadAuthIpc(authService, userRepo);

  const result = await handlers.get('user:create')(null, {
    username: 'new-user',
    password: '12345',
    full_name: 'Người dùng mới',
    role_id: 2,
  });
  assert.equal(result.success, false);
  assert.match(result.error, /6 ký tự/i);
  assert.equal(createCalled, false);
});

