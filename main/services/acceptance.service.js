'use strict';

const acceptanceRepo = require('../repositories/acceptance.repository');
const planRepo = require('../repositories/maintenance-plan.repository');
const { getDb } = require('../database/index');
const { ok, fail, paginated } = require('../utils/response');
const logger = require('../utils/logger');

async function get(planId) {
  const record = await acceptanceRepo.findByPlan(planId);
  return ok(record);
}

async function create(data, userId) {
  const { plan_id, conclusion, note, acceptance_date } = data;
  if (!plan_id || !conclusion) return fail('Thiếu thông tin bắt buộc');

  const plan = await planRepo.findById(plan_id);
  if (!plan) return fail('Không tìm thấy kế hoạch');
  if (plan.status !== 'completed') {
    return fail('Kế hoạch chưa hoàn thành, chưa thể nghiệm thu');
  }

  const existing = await acceptanceRepo.findByPlan(plan_id);
  if (existing) return fail('Kế hoạch này đã có biên bản nghiệm thu');

  const record = await acceptanceRepo.create({
    plan_id,
    accepted_by: userId,
    acceptance_date: acceptance_date || new Date().toISOString().split('T')[0],
    conclusion,
    note: note || null,
  });

  // Ghi audit
  try {
    await getDb().query(
      'INSERT INTO audit_logs (user_id, action, target_table, target_id) VALUES ($1, $2, $3, $4)',
      [userId, 'create', 'acceptance_records', record.id]
    );
  } catch (e) {}

  logger.info(`[Acceptance] Tạo biên bản nghiệm thu plan_id=${plan_id}`);
  return ok(await acceptanceRepo.findByPlan(plan_id), 'Tạo biên bản nghiệm thu thành công');
}

async function update(id, data, userId) {
  const record = await acceptanceRepo.findById(id);
  if (!record) return fail('Không tìm thấy biên bản nghiệm thu');

  const allowed = ['conclusion', 'note', 'acceptance_date'];
  const updateData = {};
  for (const k of allowed) {
    if (data[k] !== undefined) updateData[k] = data[k];
  }

  await acceptanceRepo.update(id, updateData);
  return ok(await acceptanceRepo.findById(id), 'Cập nhật thành công');
}

async function list(opts = {}) {
  const result = await acceptanceRepo.listFull(opts);
  return paginated(result.items, result.total, result.page, result.pageSize);
}

module.exports = { get, create, update, list };
