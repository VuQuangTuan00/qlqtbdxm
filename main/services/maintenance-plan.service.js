'use strict';

const planRepo = require('../repositories/maintenance-plan.repository');
const stepRepo = require('../repositories/maintenance-step.repository');
const logRepo = require('../repositories/maintenance-log.repository');
const { getDb } = require('../database/index');
const { ok, fail, paginated } = require('../utils/response');
const logger = require('../utils/logger');

function list(opts = {}) {
  const result = planRepo.search(opts);
  return paginated(result.items, result.total, result.page, result.pageSize);
}

function get(id) {
  const plan = planRepo.findByIdFull(id);
  if (!plan) return fail('Không tìm thấy kế hoạch bảo dưỡng');
  return ok(plan);
}

function getSteps(maintenanceType) {
  const steps = stepRepo.findByType(maintenanceType);
  return ok(steps);
}

function create(data, userId) {
  const { equipment_id, maintenance_type, planned_date } = data;
  if (!equipment_id || !maintenance_type || !planned_date) {
    return fail('Thiếu thông tin bắt buộc: trang bị, loại bảo dưỡng, ngày kế hoạch');
  }

  // Sinh mã kế hoạch
  const date = new Date(planned_date);
  const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
  const count = planRepo.count() + 1;
  const plan_code = `KH-${dateStr}-${String(count).padStart(4, '0')}`;

  const plan = planRepo.create({
    plan_code,
    equipment_id,
    maintenance_type,
    planned_date,
    created_by: userId,
    approved_by: null,
    status: 'pending',
  });

  // Tạo log entries tự động từ các bước quy trình
  const steps = stepRepo.findByType(maintenance_type);
  const db = getDb();
  const insertLog = db.prepare(`
    INSERT INTO maintenance_logs (plan_id, step_id, performed_by, status)
    VALUES (?, ?, ?, 'pending')
  `);
  const insertAll = db.transaction(() => {
    for (const step of steps) {
      insertLog.run(plan.id, step.id, userId);
    }
  });
  insertAll();

  _auditLog(userId, 'create', 'maintenance_plans', plan.id);
  logger.info(`[Plan] Tạo kế hoạch: ${plan_code}`);
  return ok(planRepo.findByIdFull(plan.id), 'Tạo kế hoạch thành công');
}

function update(id, data, userId) {
  const plan = planRepo.findById(id);
  if (!plan) return fail('Không tìm thấy kế hoạch');
  if (['completed', 'cancelled'].includes(plan.status)) {
    return fail('Không thể chỉnh sửa kế hoạch đã hoàn thành hoặc đã hủy');
  }

  const allowed = ['planned_date', 'maintenance_type'];
  const updateData = {};
  for (const k of allowed) {
    if (data[k] !== undefined) updateData[k] = data[k];
  }

  planRepo.update(id, updateData);
  _auditLog(userId, 'update', 'maintenance_plans', id);
  return ok(planRepo.findByIdFull(id), 'Cập nhật thành công');
}

function approve(id, userId) {
  const plan = planRepo.findById(id);
  if (!plan) return fail('Không tìm thấy kế hoạch');
  if (plan.status !== 'pending') return fail('Chỉ có thể phê duyệt kế hoạch đang chờ');

  planRepo.updateStatus(id, 'approved', userId);
  _auditLog(userId, 'approve', 'maintenance_plans', id);
  logger.info(`[Plan] Phê duyệt kế hoạch id=${id}`);
  return ok(planRepo.findByIdFull(id), 'Phê duyệt thành công');
}

function cancel(id, userId) {
  const plan = planRepo.findById(id);
  if (!plan) return fail('Không tìm thấy kế hoạch');
  if (['completed', 'cancelled'].includes(plan.status)) {
    return fail('Kế hoạch đã kết thúc, không thể hủy');
  }

  planRepo.updateStatus(id, 'cancelled');
  _auditLog(userId, 'cancel', 'maintenance_plans', id);
  return ok(null, 'Hủy kế hoạch thành công');
}

function remove(id, userId) {
  const plan = planRepo.findById(id);
  if (!plan) return fail('Không tìm thấy kế hoạch');
  if (!['pending', 'cancelled'].includes(plan.status)) {
    return fail('Chỉ có thể xóa kế hoạch ở trạng thái chờ hoặc đã hủy');
  }

  // Xóa logs liên quan
  getDb().prepare('DELETE FROM maintenance_logs WHERE plan_id = ?').run(id);
  planRepo.delete(id);
  _auditLog(userId, 'delete', 'maintenance_plans', id);
  return ok(null, 'Xóa kế hoạch thành công');
}

function _auditLog(userId, action, table, targetId) {
  try {
    getDb().prepare(`
      INSERT INTO audit_logs (user_id, action, target_table, target_id) VALUES (?, ?, ?, ?)
    `).run(userId, action, table, targetId);
  } catch (e) {}
}

module.exports = { list, get, getSteps, create, update, approve, cancel, remove };
