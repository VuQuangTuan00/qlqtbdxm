'use strict';

const unitRepo = require('../repositories/unit.repository');
const { ok, fail } = require('../utils/response');

function list({ search = '' } = {}) {
  if (search) return ok(unitRepo.search(search));
  return ok(unitRepo.findAll({}, { orderBy: 'unit_name' }));
}

function get(id) {
  const unit = unitRepo.findById(id);
  if (!unit) return fail('Không tìm thấy đơn vị');
  return ok(unit);
}

function getTree() {
  return ok(unitRepo.getTree());
}

function create(data) {
  const { unit_code, unit_name, parent_unit_id } = data;
  if (!unit_code || !unit_name) return fail('Thiếu mã hoặc tên đơn vị');

  const existing = unitRepo.findOne({ unit_code });
  if (existing) return fail('Mã đơn vị đã tồn tại');

  const unit = unitRepo.create({
    unit_code: unit_code.trim().toUpperCase(),
    unit_name: unit_name.trim(),
    parent_unit_id: parent_unit_id || null,
  });
  return ok(unit, 'Tạo đơn vị thành công');
}

function update(id, data) {
  if (!unitRepo.exists(id)) return fail('Không tìm thấy đơn vị');

  const allowed = ['unit_name', 'parent_unit_id'];
  const updateData = {};
  for (const k of allowed) {
    if (data[k] !== undefined) updateData[k] = data[k];
  }

  const updated = unitRepo.update(id, updateData);
  return ok(updated, 'Cập nhật thành công');
}

function remove(id) {
  if (!unitRepo.exists(id)) return fail('Không tìm thấy đơn vị');
  unitRepo.delete(id);
  return ok(null, 'Xóa đơn vị thành công');
}

module.exports = { list, get, getTree, create, update, remove };
