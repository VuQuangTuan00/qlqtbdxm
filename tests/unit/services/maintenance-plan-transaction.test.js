'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

function loadPlanService(stubs) {
  const servicePath = require.resolve('../../../main/services/maintenance-plan.service');
  const replacements = new Map([
    [require.resolve('../../../main/repositories/maintenance-plan.repository'), stubs.planRepo],
    [require.resolve('../../../main/repositories/maintenance-step.repository'), stubs.stepRepo],
    [require.resolve('../../../main/repositories/maintenance-log.repository'), stubs.logRepo],
    [require.resolve('../../../main/database/index'), stubs.databaseModule],
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

test('maintenance plan creation rolls back the plan and generated logs when one log insert fails', async () => {
  const state = { plans: [], logs: [], audits: [] };
  let logInsertCount = 0;
  const client = {
    async query(sql, params) {
      if (/INSERT INTO maintenance_plans/i.test(sql)) {
        const plan = { id: 11, plan_code: params[0], maintenance_type: params[2] };
        state.plans.push(plan);
        return { rows: [plan], rowCount: 1 };
      }
      if (/INSERT INTO maintenance_logs/i.test(sql)) {
        logInsertCount++;
        if (logInsertCount === 2) throw new Error('second log insert failed');
        state.logs.push({ plan_id: params[0], step_id: params[1] });
        return { rows: [], rowCount: 1 };
      }
      if (/INSERT INTO audit_logs/i.test(sql)) {
        state.audits.push(params);
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL in test: ${sql}`);
    },
  };
  const planRepo = {
    async count() { return 0; },
    async create(data) {
      const plan = { id: 11, ...data };
      state.plans.push(plan);
      return plan;
    },
    async transaction(operation) {
      const snapshot = structuredClone(state);
      try {
        return await operation(client);
      } catch (error) {
        state.plans = snapshot.plans;
        state.logs = snapshot.logs;
        state.audits = snapshot.audits;
        throw error;
      }
    },
    async findByIdFull(id) { return state.plans.find((item) => item.id === id) || null; },
  };
  const stepRepo = {
    async findByType() { return [{ id: 101 }, { id: 102 }]; },
  };
  const databaseModule = {
    getDb() {
      return {
        async query(sql, params) {
          if (/INSERT INTO maintenance_logs/i.test(sql)) return client.query(sql, params);
          if (/INSERT INTO audit_logs/i.test(sql)) return client.query(sql, params);
          throw new Error(`Unexpected non-transaction SQL in test: ${sql}`);
        },
      };
    },
  };
  const service = loadPlanService({ planRepo, stepRepo, logRepo: {}, databaseModule });

  await assert.rejects(
    service.create({ equipment_id: 4, maintenance_type: 'dinh_ky', planned_date: '2026-11-20' }, 9),
    /second log insert failed/,
  );
  assert.deepEqual(state.plans, []);
  assert.deepEqual(state.logs, []);
  assert.deepEqual(state.audits, []);
});

test('maintenance plan deletion restores its logs when deleting the plan fails', async () => {
  const state = {
    plans: [{ id: 11, status: 'pending' }],
    logs: [{ id: 21, plan_id: 11 }],
    audits: [],
  };
  const client = {
    async query(sql, params) {
      if (/DELETE FROM maintenance_logs/i.test(sql)) {
        state.logs = state.logs.filter((item) => item.plan_id !== params[0]);
        return { rows: [], rowCount: 1 };
      }
      if (/DELETE FROM maintenance_plans/i.test(sql)) throw new Error('plan delete failed');
      if (/INSERT INTO audit_logs/i.test(sql)) {
        state.audits.push(params);
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL in test: ${sql}`);
    },
  };
  const planRepo = {
    async findById(id) { return state.plans.find((item) => item.id === id) || null; },
    async delete() { throw new Error('plan delete failed'); },
    async transaction(operation) {
      const snapshot = structuredClone(state);
      try {
        return await operation(client);
      } catch (error) {
        state.plans = snapshot.plans;
        state.logs = snapshot.logs;
        state.audits = snapshot.audits;
        throw error;
      }
    },
  };
  const databaseModule = {
    getDb() {
      return {
        async query(sql, params) {
          if (/DELETE FROM maintenance_logs/i.test(sql)) return client.query(sql, params);
          throw new Error(`Unexpected non-transaction SQL in test: ${sql}`);
        },
      };
    },
  };
  const service = loadPlanService({
    planRepo,
    stepRepo: {},
    logRepo: {},
    databaseModule,
  });

  await assert.rejects(service.remove(11, 9), /plan delete failed/);
  assert.deepEqual(state.plans, [{ id: 11, status: 'pending' }]);
  assert.deepEqual(state.logs, [{ id: 21, plan_id: 11 }]);
  assert.deepEqual(state.audits, []);
});
