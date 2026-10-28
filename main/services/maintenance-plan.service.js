'use strict';

const planRepo = require('../repositories/maintenance-plan.repository');
const stepRepo = require('../repositories/maintenance-step.repository');
const logRepo = require('../repositories/maintenance-log.repository');
const { getDb } = require('../database/index');
const { ok, fail, paginated } = require('../utils/response');
const logger = require('../utils/logger');

async function list(opts = {}) {
  const result = await planRepo.search(opts);
  return paginated(result.items, result.total, result.page, result.pageSize);
}

async function get(id) {
  const plan = await planRepo.findByIdFull(id);
  if (!plan) return fail('Không tìm thấy kế hoạch bảo dưỡng');
  return ok(plan);
}

async function getSteps(maintenanceType) {
  const steps = await stepRepo.findByType(maintenanceType);
  return ok(steps);
}

async function create(data, userId) {
  const { equipment_id, maintenance_type, planned_date } = data;
  if (!equipment_id || !maintenance_type || !planned_date) {
    return fail('Thiếu thông tin bắt buộc: trang bị, loại bảo dưỡng, ngày kế hoạch');
  }

  const steps = await stepRepo.findByType(maintenance_type);
  if (!steps.length) return fail('Loại bảo dưỡng chưa có các bước quy trình');
  const date = new Date(planned_date);
  if (Number.isNaN(date.getTime())) return fail('Ngày kế hoạch không hợp lệ');
  const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
  let plan;
  await getDb().transaction(async () => {
    const { rows } = await getDb().query(
      `SELECT COALESCE(MAX(CAST(substr(plan_code, -4) AS INTEGER)), 0) + 1 AS next_number
       FROM maintenance_plans WHERE plan_code LIKE $1`,
      [`KH-${dateStr}-%`]
    );
    const plan_code = `KH-${dateStr}-${String(rows[0].next_number).padStart(4, '0')}`;
    plan = await planRepo.create({
      plan_code, equipment_id, maintenance_type, planned_date,
      created_by: userId, approved_by: null, status: 'pending',
    });
    for (const step of steps) {
      await getDb().query(
        `INSERT INTO maintenance_logs (plan_id, step_id, performed_by, status) VALUES ($1, $2, $3, 'pending')`,
        [plan.id, step.id, userId]
      );
    }
    await _auditLog(userId, 'create', 'maintenance_plans', plan.id);
  });
  const plan_code = plan.plan_code;
  logger.info(`[Plan] Tạo kế hoạch: ${plan_code}`);
  return ok(await planRepo.findByIdFull(plan.id), 'Tạo kế hoạch thành công');
}

async function update(id, data, userId) {
  const plan = await planRepo.findById(id);
  if (!plan) return fail('Không tìm thấy kế hoạch');
  if (['completed', 'cancelled'].includes(plan.status)) {
    return fail('Không thể chỉnh sửa kế hoạch đã hoàn thành hoặc đã hủy');
  }

  const allowed = ['planned_date', 'maintenance_type'];
  const updateData = {};
  for (const k of allowed) {
    if (data[k] !== undefined) updateData[k] = data[k];
  }

  await getDb().transaction(async () => {
    await planRepo.update(id, updateData);
    if (updateData.maintenance_type && updateData.maintenance_type !== plan.maintenance_type) {
      const steps = await stepRepo.findByType(updateData.maintenance_type);
      if (!steps.length) throw new Error('Loại bảo dưỡng chưa có các bước quy trình');
      await getDb().query('DELETE FROM maintenance_logs WHERE plan_id = $1', [id]);
      for (const step of steps) {
        await getDb().query(
          `INSERT INTO maintenance_logs (plan_id, step_id, performed_by, status) VALUES ($1, $2, $3, 'pending')`,
          [id, step.id, userId]
        );
      }
    }
    await _auditLog(userId, 'update', 'maintenance_plans', id);
  });
  return ok(await planRepo.findByIdFull(id), 'Cập nhật thành công');
}

async function approve(id, userId) {
  const plan = await planRepo.findById(id);
  if (!plan) return fail('Không tìm thấy kế hoạch');
  if (plan.status !== 'pending') return fail('Chỉ có thể phê duyệt kế hoạch đang chờ');

  await planRepo.updateStatus(id, 'approved', userId);
  await _auditLog(userId, 'approve', 'maintenance_plans', id);
  logger.info(`[Plan] Phê duyệt kế hoạch id=${id}`);
  return ok(await planRepo.findByIdFull(id), 'Phê duyệt thành công');
}

async function cancel(id, userId) {
  const plan = await planRepo.findById(id);
  if (!plan) return fail('Không tìm thấy kế hoạch');
  if (['completed', 'cancelled'].includes(plan.status)) {
    return fail('Kế hoạch đã kết thúc, không thể hủy');
  }

  await planRepo.updateStatus(id, 'cancelled');
  await _auditLog(userId, 'cancel', 'maintenance_plans', id);
  return ok(null, 'Hủy kế hoạch thành công');
}

async function remove(id, userId) {
  const plan = await planRepo.findById(id);
  if (!plan) return fail('Không tìm thấy kế hoạch');
  if (!['pending', 'cancelled'].includes(plan.status)) {
    return fail('Chỉ có thể xóa kế hoạch ở trạng thái chờ hoặc đã hủy');
  }

  // Xóa logs liên quan
  await getDb().transaction(async () => {
    await getDb().query('DELETE FROM maintenance_logs WHERE plan_id = $1', [id]);
    await planRepo.delete(id);
    await _auditLog(userId, 'delete', 'maintenance_plans', id);
  });
  return ok(null, 'Xóa kế hoạch thành công');
}

async function _auditLog(userId, action, table, targetId) {
  try {
    await getDb().query(
      'INSERT INTO audit_logs (user_id, action, target_table, target_id) VALUES ($1, $2, $3, $4)',
      [userId, action, table, targetId]
    );
  } catch (e) {}
}

module.exports = { list, get, getSteps, create, update, approve, cancel, remove };
