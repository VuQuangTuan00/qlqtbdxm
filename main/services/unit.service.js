'use strict';

const unitRepo = require('../repositories/unit.repository');
const { ok, fail } = require('../utils/response');

async function list({ search = '' } = {}) {
  if (search) return ok(await unitRepo.search(search));
  return ok(await unitRepo.findAll({}, { orderBy: 'unit_name' }));
}

async function get(id) {
  const unit = await unitRepo.findById(id);
  if (!unit) return fail('Không tìm thấy đơn vị');
  return ok(unit);
}

async function getTree() {
  return ok(await unitRepo.getTree());
}

async function create(data) {
  const { unit_code, unit_name, parent_unit_id } = data;
  if (!unit_code || !unit_name) return fail('Thiếu mã hoặc tên đơn vị');

  const existing = await unitRepo.findOne({ unit_code });
  if (existing) return fail('Mã đơn vị đã tồn tại');

  const unit = await unitRepo.create({
    unit_code: unit_code.trim().toUpperCase(),
    unit_name: unit_name.trim(),
    parent_unit_id: parent_unit_id || null,
  });
  return ok(unit, 'Tạo đơn vị thành công');
}

async function update(id, data) {
  if (!(await unitRepo.exists(id))) return fail('Không tìm thấy đơn vị');

  const allowed = ['unit_name', 'parent_unit_id'];
  const updateData = {};
  for (const k of allowed) {
    if (data[k] !== undefined) updateData[k] = data[k];
  }

  const updated = await unitRepo.update(id, updateData);
  return ok(updated, 'Cập nhật thành công');
}

async function remove(id) {
  if (!(await unitRepo.exists(id))) return fail('Không tìm thấy đơn vị');
  await unitRepo.delete(id);
  return ok(null, 'Xóa đơn vị thành công');
}

module.exports = { list, get, getTree, create, update, remove };
