'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

function loadEquipmentService(equipmentRepo, databaseModule) {
  const servicePath = require.resolve('../../../main/services/equipment.service');
  const repoPath = require.resolve('../../../main/repositories/equipment.repository');
  const databasePath = require.resolve('../../../main/database/index');
  const saved = new Map([
    [servicePath, require.cache[servicePath]],
    [repoPath, require.cache[repoPath]],
    [databasePath, require.cache[databasePath]],
  ]);

  delete require.cache[servicePath];
  require.cache[repoPath] = { id: repoPath, filename: repoPath, loaded: true, exports: equipmentRepo };
  require.cache[databasePath] = { id: databasePath, filename: databasePath, loaded: true, exports: databaseModule };
  const service = require(servicePath);

  for (const [modulePath, cached] of saved) {
    if (cached) require.cache[modulePath] = cached;
    else delete require.cache[modulePath];
  }
  return service;
}

test('equipment creation rolls back the equipment when QR creation fails', async () => {
  const state = { equipments: [], qrCodes: [], auditLogs: [] };
  const client = {
    async query(sql, params) {
      if (/INSERT INTO equipments/i.test(sql)) {
        const equipment = { id: 1, equipment_code: params[0], equipment_name: params[1] };
        state.equipments.push(equipment);
        return { rows: [equipment], rowCount: 1 };
      }
      if (/INSERT INTO qr_codes/i.test(sql)) throw new Error('QR insert failed');
      if (/INSERT INTO audit_logs/i.test(sql)) {
        state.auditLogs.push(params);
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL in test: ${sql}`);
    },
  };

  const equipmentRepo = {
    async findOne() { return null; },
    async create(data) {
      const equipment = { id: 1, ...data };
      state.equipments.push(equipment);
      return equipment;
    },
    async transaction(operation) {
      const snapshot = structuredClone(state);
      try {
        return await operation(client);
      } catch (error) {
        state.equipments = snapshot.equipments;
        state.qrCodes = snapshot.qrCodes;
        state.auditLogs = snapshot.auditLogs;
        throw error;
      }
    },
    async findByIdFull(id) { return state.equipments.find((item) => item.id === id) || null; },
  };
  const databaseModule = {
    getDb() {
      return {
        async query(sql) {
          if (/INSERT INTO qr_codes/i.test(sql)) throw new Error('QR insert failed');
          throw new Error(`Unexpected non-transaction SQL in test: ${sql}`);
        },
      };
    },
  };
  const service = loadEquipmentService(equipmentRepo, databaseModule);

  await assert.rejects(
    service.create({ equipment_code: 'x-01', equipment_name: 'Test equipment' }, 9),
    /QR insert failed/,
  );
  assert.deepEqual(state.equipments, []);
  assert.deepEqual(state.qrCodes, []);
  assert.deepEqual(state.auditLogs, []);
});

test('equipment deletion removes its QR record in the same transaction', async () => {
  const state = {
    equipments: [{ id: 7 }],
    qrCodes: [{ equipment_id: 7 }],
    auditLogs: [],
  };
  const client = {
    async query(sql, params) {
      if (/DELETE FROM qr_codes/i.test(sql)) {
        state.qrCodes = state.qrCodes.filter((item) => item.equipment_id !== params[0]);
        return { rows: [], rowCount: 1 };
      }
      if (/DELETE FROM equipments/i.test(sql)) {
        if (state.qrCodes.some((item) => item.equipment_id === params[0])) {
          throw new Error('FK qr_codes blocks equipment delete');
        }
        state.equipments = state.equipments.filter((item) => item.id !== params[0]);
        return { rows: [], rowCount: 1 };
      }
      if (/INSERT INTO audit_logs/i.test(sql)) {
        state.auditLogs.push(params);
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL in test: ${sql}`);
    },
  };
  const equipmentRepo = {
    async exists(id) { return state.equipments.some((item) => item.id === id); },
    async delete(id) {
      if (state.qrCodes.some((item) => item.equipment_id === id)) {
        throw new Error('FK qr_codes blocks equipment delete');
      }
      state.equipments = state.equipments.filter((item) => item.id !== id);
      return true;
    },
    async transaction(operation) {
      const snapshot = structuredClone(state);
      try {
        return await operation(client);
      } catch (error) {
        state.equipments = snapshot.equipments;
        state.qrCodes = snapshot.qrCodes;
        state.auditLogs = snapshot.auditLogs;
        throw error;
      }
    },
  };
  const databaseModule = {
    getDb() {
      return {
        async query(sql) { throw new Error(`Unexpected non-transaction SQL in test: ${sql}`); },
      };
    },
  };
  const service = loadEquipmentService(equipmentRepo, databaseModule);

  const result = await service.remove(7, 9);

  assert.equal(result.success, true);
  assert.deepEqual(state.equipments, []);
  assert.deepEqual(state.qrCodes, []);
  assert.deepEqual(state.auditLogs, [[9, 'delete', 'equipments', 7]]);
});
