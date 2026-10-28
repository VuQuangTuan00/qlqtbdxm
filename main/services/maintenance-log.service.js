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

  let entry;
  await getDb().transaction(async () => {
    if (plan.status === 'approved') await planRepo.updateStatus(plan_id, 'in_progress');
    entry = await logRepo.create({
      plan_id, step_id, performed_by: userId,
      start_time: new Date().toISOString(), status: 'in_progress',
    });
  });

  return ok(await logRepo.findByIdFull(entry.id), 'Bắt đầu thực hiện');
}

async function update(id, data, userId) {
  const log = await logRepo.findById(id);
  if (!log) return fail('Không tìm thấy nhật ký');

  const allowed = ['result', 'note', 'start_time', 'end_time', 'status'];
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

  await getDb().transaction(async () => {
    await logRepo.updateStatus(id, status, updateExtra);
    if (status === 'completed') {
      const allDone = await logRepo.allCompleted(log.plan_id);
      if (allDone) {
        await planRepo.updateStatus(log.plan_id, 'completed');
        logger.info(`[Log] Kế hoạch ${log.plan_id} đã hoàn thành tất cả bước`);
      }
    }
  });

  return ok(await logRepo.findByIdFull(id), 'Cập nhật trạng thái thành công');
}

module.exports = { list, get, create, update, updateStatus };
