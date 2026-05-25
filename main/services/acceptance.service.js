'use strict';

const acceptanceRepo = require('../repositories/acceptance.repository');
const planRepo = require('../repositories/maintenance-plan.repository');
const { getDb } = require('../database/index');
const { ok, fail, paginated } = require('../utils/response');
const logger = require('../utils/logger');

function get(planId) {
  const record = acceptanceRepo.findByPlan(planId);
  return ok(record);
}

function create(data, userId) {
  const { plan_id, conclusion, note, acceptance_date } = data;
  if (!plan_id || !conclusion) return fail('Thiếu thông tin bắt buộc');

  const plan = planRepo.findById(plan_id);
  if (!plan) return fail('Không tìm thấy kế hoạch');
  if (plan.status !== 'completed') {
    return fail('Kế hoạch chưa hoàn thành, chưa thể nghiệm thu');
  }

  const existing = acceptanceRepo.findByPlan(plan_id);
  if (existing) return fail('Kế hoạch này đã có biên bản nghiệm thu');

  const record = acceptanceRepo.create({
    plan_id,
    accepted_by: userId,
    acceptance_date: acceptance_date || new Date().toISOString().split('T')[0],
    conclusion,
    note: note || null,
  });

  // Ghi audit
  try {
    getDb().prepare(`
      INSERT INTO audit_logs (user_id, action, target_table, target_id) VALUES (?, ?, ?, ?)
    `).run(userId, 'create', 'acceptance_records', record.id);
  } catch (e) {}

  logger.info(`[Acceptance] Tạo biên bản nghiệm thu plan_id=${plan_id}`);
  return ok(acceptanceRepo.findByPlan(plan_id), 'Tạo biên bản nghiệm thu thành công');
}

function update(id, data, userId) {
  const record = acceptanceRepo.findById(id);
  if (!record) return fail('Không tìm thấy biên bản nghiệm thu');

  const allowed = ['conclusion', 'note', 'acceptance_date'];
  const updateData = {};
  for (const k of allowed) {
    if (data[k] !== undefined) updateData[k] = data[k];
  }

  acceptanceRepo.update(id, updateData);
  return ok(acceptanceRepo.findById(id), 'Cập nhật thành công');
}

function list(opts = {}) {
  const result = acceptanceRepo.listFull(opts);
  return paginated(result.items, result.total, result.page, result.pageSize);
}

module.exports = { get, create, update, list };
