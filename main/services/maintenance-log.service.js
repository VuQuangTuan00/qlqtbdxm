'use strict';

const logRepo = require('../repositories/maintenance-log.repository');
const planRepo = require('../repositories/maintenance-plan.repository');
const { getDb } = require('../database/index');
const { ok, fail } = require('../utils/response');
const logger = require('../utils/logger');

function list(planId) {
  const logs = logRepo.findByPlan(planId);
  return ok(logs);
}

function get(id) {
  const log = logRepo.findByIdFull(id);
  if (!log) return fail('Không tìm thấy nhật ký');
  return ok(log);
}

function create(data, userId) {
  const { plan_id, step_id } = data;
  if (!plan_id || !step_id) return fail('Thiếu thông tin bắt buộc');

  const plan = planRepo.findById(plan_id);
  if (!plan) return fail('Không tìm thấy kế hoạch');
  if (!['approved', 'in_progress'].includes(plan.status)) {
    return fail('Kế hoạch chưa được phê duyệt');
  }

  // Tự động chuyển plan sang in_progress
  if (plan.status === 'approved') {
    planRepo.updateStatus(plan_id, 'in_progress');
  }

  const entry = logRepo.create({
    plan_id,
    step_id,
    performed_by: userId,
    start_time: new Date().toISOString(),
    status: 'in_progress',
  });

  return ok(logRepo.findByIdFull(entry.id), 'Bắt đầu thực hiện');
}

function update(id, data, userId) {
  const log = logRepo.findById(id);
  if (!log) return fail('Không tìm thấy nhật ký');

  const allowed = ['result', 'note', 'start_time', 'end_time', 'status'];
  const updateData = {};
  for (const k of allowed) {
    if (data[k] !== undefined) updateData[k] = data[k];
  }

  logRepo.update(id, updateData);
  return ok(logRepo.findByIdFull(id), 'Cập nhật nhật ký thành công');
}

function updateStatus(id, status, extra = {}, userId) {
  const log = logRepo.findById(id);
  if (!log) return fail('Không tìm thấy nhật ký');

  const validStatuses = ['pending', 'in_progress', 'completed', 'failed'];
  if (!validStatuses.includes(status)) return fail('Trạng thái không hợp lệ');

  const updateExtra = { ...extra };
  if (status === 'completed' && !updateExtra.end_time) {
    updateExtra.end_time = new Date().toISOString();
  }

  logRepo.updateStatus(id, status, updateExtra);

  // Kiểm tra nếu tất cả steps hoàn thành → cập nhật plan
  if (status === 'completed') {
    const allDone = logRepo.allCompleted(log.plan_id);
    if (allDone) {
      planRepo.updateStatus(log.plan_id, 'completed');
      logger.info(`[Log] Kế hoạch ${log.plan_id} đã hoàn thành tất cả bước`);
    }
  }

  return ok(logRepo.findByIdFull(id), 'Cập nhật trạng thái thành công');
}

module.exports = { list, get, create, update, updateStatus };
