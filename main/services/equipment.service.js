'use strict';

const equipmentRepo = require('../repositories/equipment.repository');
const { getDb } = require('../database/index');
const { ok, fail, paginated } = require('../utils/response');
const logger = require('../utils/logger');
const crypto = require('crypto');

async function list(opts = {}) {
  const result = await equipmentRepo.search(opts);
  return paginated(result.items, result.total, result.page, result.pageSize);
}

async function get(id) {
  const equipment = await equipmentRepo.findByIdFull(id);
  if (!equipment) return fail('Không tìm thấy trang bị');
  return ok(equipment);
}

async function search(opts = {}) {
  const result = await equipmentRepo.search(opts);
  return paginated(result.items, result.total, result.page, result.pageSize);
}

async function create(data, userId) {
  const { equipment_code, equipment_name, model, serial_number, year_of_manufacture, unit_id } = data;
  if (!equipment_code || !equipment_name) return fail('Thiếu mã hoặc tên trang bị');

  const existing = await equipmentRepo.findOne({ equipment_code });
  if (existing) return fail('Mã trang bị đã tồn tại');

  const equipment = await equipmentRepo.create({
    equipment_code: equipment_code.trim().toUpperCase(),
    equipment_name: equipment_name.trim(),
    model: model || null,
    serial_number: serial_number || null,
    year_of_manufacture: year_of_manufacture || null,
    unit_id: unit_id || null,
    status: 'active',
  });

  // Tạo QR code tự động
  const qrValue = `QLQT-${equipment.id}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  await getDb().query(
    'INSERT INTO qr_codes (equipment_id, qr_value) VALUES ($1, $2)',
    [equipment.id, qrValue]
  );

  // Audit log
  await _auditLog(userId, 'create', 'equipments', equipment.id);
  logger.info(`[Equipment] Tạo trang bị: ${equipment_code}`);
  return ok(await equipmentRepo.findByIdFull(equipment.id), 'Tạo trang bị thành công');
}

async function update(id, data, userId) {
  if (!(await equipmentRepo.exists(id))) return fail('Không tìm thấy trang bị');

  const allowed = ['equipment_name', 'model', 'serial_number', 'year_of_manufacture', 'unit_id', 'status'];
  const updateData = {};
  for (const k of allowed) {
    if (data[k] !== undefined) updateData[k] = data[k];
  }

  await equipmentRepo.update(id, updateData);
  await _auditLog(userId, 'update', 'equipments', id);
  return ok(await equipmentRepo.findByIdFull(id), 'Cập nhật thành công');
}

async function remove(id, userId) {
  if (!(await equipmentRepo.exists(id))) return fail('Không tìm thấy trang bị');
  await equipmentRepo.delete(id);
  await _auditLog(userId, 'delete', 'equipments', id);
  return ok(null, 'Xóa trang bị thành công');
}

async function getByQr(qrValue) {
  const equipment = await equipmentRepo.findByQr(qrValue);
  if (!equipment) return fail('Không tìm thấy trang bị với mã QR này');
  return ok(equipment);
}

async function getStatusStats() {
  return ok(await equipmentRepo.getStatusStats());
}

async function _auditLog(userId, action, table, targetId) {
  try {
    await getDb().query(
      'INSERT INTO audit_logs (user_id, action, target_table, target_id) VALUES ($1, $2, $3, $4)',
      [userId, action, table, targetId]
    );
  } catch (e) {}
}

module.exports = { list, get, search, create, update, remove, getByQr, getStatusStats };
