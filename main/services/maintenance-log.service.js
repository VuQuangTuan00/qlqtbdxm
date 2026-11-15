'use strict';

const logRepo = require('../repositories/maintenance-log.repository');
const planRepo = require('../repositories/maintenance-plan.repository');
const { getDb } = require('../database/index');
const { ok, fail } = require('../utils/response');
const logger = require('../utils/logger');

async function list(planId) {
  const logs = await logRepo.findByPlan(planId);
  return ok(logs);
}

async function get(id) {
  const log = await logRepo.findByIdFull(id);
  if (!log) return fail('Không tìm thấy nhật ký');
  return ok(log);
}

async function create(data, userId) {
  const { plan_id, step_id } = data;
  if (!plan_id || !step_id) return fail('Thiếu thông tin bắt buộc');

  const plan = await planRepo.findById(plan_id);
  if (!plan) return fail('Không tìm thấy kế hoạch');
  if (!['approved', 'in_progress'].includes(plan.status)) {
    return fail('Kế hoạch chưa được phê duyệt');
  }

  // Tự động chuyển plan sang in_progress
  const entry = await logRepo.transaction(async (client) => {
    if (plan.status === 'approved') {
      await client.query(
        'UPDATE maintenance_plans SET status = $1 WHERE id = $2',
        ['in_progress', plan_id]
      );
    }

    const { rows } = await client.query(
      `INSERT INTO maintenance_logs (plan_id, step_id, performed_by, start_time, status)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [plan_id, step_id, userId, new Date().toISOString(), 'in_progress']
    );
    return rows[0];
  });

  return ok(await logRepo.findByIdFull(entry.id), 'Bắt đầu thực hiện');
}

async function update(id, data, userId) {
  const log = await logRepo.findById(id);
  if (!log) return fail('Không tìm thấy nhật ký');

  // Status changes must use updateStatus() so completion and plan state remain atomic.
  const allowed = ['result', 'note', 'start_time', 'end_time'];
  const updateData = {};
  for (const k of allowed) {
    if (data[k] !== undefined) updateData[k] = data[k];
  }

  await logRepo.update(id, updateData);
  return ok(await logRepo.findByIdFull(id), 'Cập nhật nhật ký thành công');
}

async function updateStatus(id, status, extra = {}, userId) {
  const log = await logRepo.findById(id);
  if (!log) return fail('Không tìm thấy nhật ký');

  const validStatuses = ['pending', 'in_progress', 'completed', 'failed'];
  if (!validStatuses.includes(status)) return fail('Trạng thái không hợp lệ');

  const updateExtra = { ...extra };
  if (status === 'completed' && !updateExtra.end_time) {
    updateExtra.end_time = new Date().toISOString();
  }

  let planCompleted = false;
  await logRepo.transaction(async (client) => {
    const fields = ['status = $1'];
    const params = [status];

    for (const field of ['result', 'note', 'end_time', 'start_time']) {
      if (updateExtra[field] !== undefined) {
        params.push(updateExtra[field]);
        fields.push(`${field} = $${params.length}`);
      }
    }

    params.push(id);
    await client.query(
      `UPDATE maintenance_logs SET ${fields.join(', ')} WHERE id = $${params.length}`,
      params
    );

    // Hoàn thành log cuối cùng và kế hoạch trong cùng một transaction.
    if (status === 'completed') {
      const { rows } = await client.query(`
        SELECT COUNT(*) as total,
               SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as done
        FROM maintenance_logs WHERE plan_id = $1
      `, [log.plan_id]);
      const total = parseInt(rows[0].total, 10);
      const done = parseInt(rows[0].done, 10);

      if (total > 0 && total === done) {
        await client.query(
          'UPDATE maintenance_plans SET status = $1 WHERE id = $2',
          ['completed', log.plan_id]
        );
        planCompleted = true;
      }
    }
  });

  if (planCompleted) {
    logger.info(`[Log] Kế hoạch ${log.plan_id} đã hoàn thành tất cả bước`);
  }

  return ok(await logRepo.findByIdFull(id), 'Cập nhật trạng thái thành công');
}

module.exports = { list, get, create, update, updateStatus };
