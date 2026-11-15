'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

function loadAuthService(userRepo, dbQueries = []) {
  const database = {
    getDb() {
      return {
        async query(sql, params) {
          dbQueries.push({ sql, params });
          return { rows: [], rowCount: 1 };
        },
      };
    },
  };
  const hash = {
    comparePassword(plain, encoded) { return encoded === `hash:${plain}`; },
    hashPassword(plain) { return `hash:${plain}`; },
  };
  const logger = { warn() {}, info() {}, error() {} };
  const servicePath = require.resolve('../../../main/services/auth.service');
  const replacements = new Map([
    [require.resolve('../../../main/repositories/user.repository'), userRepo],
    [require.resolve('../../../main/database/index'), database],
    [require.resolve('../../../main/utils/hash'), hash],
    [require.resolve('../../../main/utils/logger'), logger],
  ]);
  const saved = new Map([[servicePath, require.cache[servicePath]]]);
  delete require.cache[servicePath];
  for (const [modulePath, exports] of replacements) {
    saved.set(modulePath, require.cache[modulePath]);
    require.cache[modulePath] = { id: modulePath, filename: modulePath, loaded: true, exports };
  }
  const service = require(servicePath);
  for (const [modulePath, cached] of saved) {
    if (cached) require.cache[modulePath] = cached;
    else delete require.cache[modulePath];
  }
  return service;
}

function activeUser(overrides = {}) {
  return {
    id: 7,
    username: 'admin',
    password_hash: 'hash:correct-password',
    full_name: 'Quản trị viên',
    role_code: 'admin',
    role_name: 'Quản trị viên',
    unit_id: 2,
    unit_name: 'Đơn vị 2',
    is_active: true,
    ...overrides,
  };
}

test('login returns the same generic error for missing users and wrong passwords', async () => {
  const missingService = loadAuthService({ async findByUsername() { return null; } });
  const wrongService = loadAuthService({ async findByUsername() { return activeUser(); } });

  const missing = await missingService.login('unknown', 'bad');
  const wrong = await wrongService.login('admin', 'bad');
  assert.equal(missing.success, false);
  assert.equal(wrong.success, false);
  assert.equal(missing.error, wrong.error);
});

test('login rejects inactive users and does not create a session', async () => {
  const service = loadAuthService({
    async findByUsername() { return activeUser({ is_active: false }); },
  });

  const result = await service.login('admin', 'correct-password');
  assert.equal(result.success, false);
  assert.equal(service.requireAuth(), null);
});

test('successful login creates a password-free session and logout clears it', async () => {
  const queries = [];
  const service = loadAuthService({ async findByUsername() { return activeUser(); } }, queries);

  const login = await service.login('admin', 'correct-password');
  assert.equal(login.success, true);
  assert.equal(login.data.userId, 7);
  assert.equal('password_hash' in login.data, false);
  assert.equal(service.requireAdmin(), true);

  const logout = await service.logout();
  assert.equal(logout.success, true);
  assert.equal(service.requireAuth(), null);
  assert.equal(queries.length, 2);
});

test('changePassword verifies ownership inputs and writes only a valid new hash', async () => {
  const updates = [];
  const service = loadAuthService({
    async findById(id) { return id === 7 ? activeUser() : null; },
    async updatePassword(id, hash) { updates.push({ id, hash }); },
  });

  assert.equal((await service.changePassword(7, 'wrong', 'new-password')).success, false);
  assert.equal((await service.changePassword(7, 'correct-password', 'short')).success, false);
  assert.equal((await service.changePassword(7, 'correct-password', 'new-password')).success, true);
  assert.deepEqual(updates, [{ id: 7, hash: 'hash:new-password' }]);
});

