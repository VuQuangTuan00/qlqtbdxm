'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

function loadLogService(logRepo, planRepo, databaseModule = {}) {
  const servicePath = require.resolve('../../../main/services/maintenance-log.service');
  const replacements = new Map([
    [require.resolve('../../../main/repositories/maintenance-log.repository'), logRepo],
    [require.resolve('../../../main/repositories/maintenance-plan.repository'), planRepo],
    [require.resolve('../../../main/database/index'), databaseModule],
  ]);
  const saved = new Map([[servicePath, require.cache[servicePath]]]);
  for (const modulePath of replacements.keys()) saved.set(modulePath, require.cache[modulePath]);

  delete require.cache[servicePath];
  for (const [modulePath, exports] of replacements) {
    require.cache[modulePath] = { id: modulePath, filename: modulePath, loaded: true, exports };
  }
  const service = require(servicePath);

  for (const [modulePath, cached] of saved) {
    if (cached) require.cache[modulePath] = cached;
    else delete require.cache[modulePath];
  }
  return service;
}

test('starting a maintenance log restores the approved plan status when log creation fails', async () => {
  const state = { plan: { id: 5, status: 'approved' }, logs: [] };
  const client = {
    async query(sql) {
      if (/UPDATE maintenance_plans/i.test(sql)) {
        state.plan.status = 'in_progress';
        return { rows: [], rowCount: 1 };
      }
      if (/INSERT INTO maintenance_logs/i.test(sql)) throw new Error('log insert failed');
      throw new Error(`Unexpected SQL in test: ${sql}`);
    },
  };
  const planRepo = {
    async findById() { return { ...state.plan }; },
    async updateStatus(_id, status) { state.plan.status = status; },
  };
  const logRepo = {
    async create() { throw new Error('log insert failed'); },
    async transaction(operation) {
      const snapshot = structuredClone(state);
      try {
        return await operation(client);
      } catch (error) {
        state.plan = snapshot.plan;
        state.logs = snapshot.logs;
        throw error;
      }
    },
  };
  const service = loadLogService(logRepo, planRepo);

  await assert.rejects(service.create({ plan_id: 5, step_id: 8 }, 9), /log insert failed/);
  assert.equal(state.plan.status, 'approved');
  assert.deepEqual(state.logs, []);
});

test('completing the final log rolls back when updating the plan status fails', async () => {
  const state = {
    plan: { id: 5, status: 'in_progress' },
    logs: [{ id: 12, plan_id: 5, status: 'in_progress' }],
  };
  const client = {
    async query(sql, params) {
      if (/UPDATE maintenance_logs/i.test(sql)) {
        state.logs[0].status = params[0];
        return { rows: [], rowCount: 1 };
      }
      if (/SELECT COUNT\(\*\) as total/i.test(sql)) {
        return { rows: [{ total: 1, done: 1 }], rowCount: 1 };
      }
      if (/UPDATE maintenance_plans/i.test(sql)) throw new Error('plan status update failed');
      throw new Error(`Unexpected SQL in test: ${sql}`);
    },
  };
  const logRepo = {
    async findById() { return { ...state.logs[0] }; },
    async updateStatus(_id, status) { state.logs[0].status = status; },
    async allCompleted() { return true; },
    async transaction(operation) {
      const snapshot = structuredClone(state);
      try {
        return await operation(client);
      } catch (error) {
        state.plan = snapshot.plan;
        state.logs = snapshot.logs;
        throw error;
      }
    },
    async findByIdFull() { return { ...state.logs[0] }; },
  };
  const planRepo = {
    async updateStatus() { throw new Error('plan status update failed'); },
  };
  const service = loadLogService(logRepo, planRepo);

  await assert.rejects(service.updateStatus(12, 'completed', {}, 9), /plan status update failed/);
  assert.equal(state.logs[0].status, 'in_progress');
  assert.equal(state.plan.status, 'in_progress');
});

test('generic log update cannot bypass workflow status handling', async () => {
  let written;
  const logRepo = {
    async findById() { return { id: 12, plan_id: 5, status: 'pending' }; },
    async update(_id, data) { written = data; },
    async findByIdFull() { return { id: 12, ...written }; },
  };
  const service = loadLogService(logRepo, {});

  const result = await service.update(12, { note: 'ghi chú', status: 'completed' }, 9);

  assert.equal(result.success, true);
  assert.deepEqual(written, { note: 'ghi chú' });
});
