'use strict';

const vehicleTypeRepo = require('../repositories/vehicle-type.repository');
const vehicleStepRepo = require('../repositories/vehicle-maintenance-step.repository');
const { getDb } = require('../database/index');
const { ok, fail } = require('../utils/response');
const logger = require('../utils/logger');

// ============================================================
// VEHICLE TYPES
// ============================================================

async function listTypes(opts = {}) {
  const rows = await vehicleTypeRepo.listWithStats(opts);
  return ok(rows);
}

async function getType(id) {
  const vt = await vehicleTypeRepo.findByIdFull(id);
  if (!vt) return fail('Không tìm thấy loại xe');
  const equipments = await vehicleTypeRepo.getEquipments(id);
  vt.equipments = equipments;
  return ok(vt);
}

async function createType(data, userId) {
  const { type_code, type_name, description, image_url, manufacturer, origin_country } = data;
  if (!type_code || !type_name) return fail('Thiếu mã hoặc tên loại xe');

  const existing = await vehicleTypeRepo.findOne({ type_code });
  if (existing) return fail('Mã loại xe đã tồn tại');

  const vt = await vehicleTypeRepo.create({
    type_code: type_code.trim().toUpperCase(),
    type_name: type_name.trim(),
    description: description || null,
    image_url: image_url || null,
    manufacturer: manufacturer || null,
    origin_country: origin_country || null,
    is_active: true,
    created_by: userId,
  });

  await _audit(userId, 'create', 'vehicle_types', vt.id);
  logger.info(`[VehicleType] Tạo: ${type_code}`);
  return ok(await vehicleTypeRepo.findByIdFull(vt.id), 'Tạo loại xe thành công');
}

async function updateType(id, data, userId) {
  if (!(await vehicleTypeRepo.exists(id))) return fail('Không tìm thấy loại xe');

  const allowed = ['type_name', 'description', 'image_url', 'manufacturer', 'origin_country', 'is_active'];
  const updateData = { updated_at: new Date().toISOString() };
  for (const k of allowed) {
    if (data[k] !== undefined) updateData[k] = data[k];
  }

  await vehicleTypeRepo.update(id, updateData);
  await _audit(userId, 'update', 'vehicle_types', id);
  return ok(await vehicleTypeRepo.findByIdFull(id), 'Cập nhật thành công');
}

async function deleteType(id, userId) {
  const vt = await vehicleTypeRepo.findById(id);
  if (!vt) return fail('Không tìm thấy loại xe');

  // Kiểm tra trang bị đang dùng
  const { rows: eq } = await getDb().query(
    'SELECT COUNT(*) as c FROM equipments WHERE vehicle_type_id = $1', [id]
  );
  if (parseInt(eq[0].c) > 0) {
    return fail(`Không thể xóa: có ${eq[0].c} trang bị đang sử dụng loại xe này`);
  }

  await vehicleTypeRepo.delete(id);
  await _audit(userId, 'delete', 'vehicle_types', id);
  return ok(null, 'Xóa loại xe thành công');
}

// ============================================================
// VEHICLE MAINTENANCE STEPS
// ============================================================

async function listSteps(vehicleTypeId, maintenanceType) {
  if (!vehicleTypeId) return fail('Thiếu vehicleTypeId');
  if (maintenanceType) {
    return ok(await vehicleStepRepo.findByVehicleAndType(vehicleTypeId, maintenanceType));
  }
  return ok(await vehicleStepRepo.findAllByVehicle(vehicleTypeId));
}

async function createStep(data, userId) {
  const { vehicle_type_id, maintenance_type, step_name, technical_requirement,
          estimated_time, tools_required, safety_notes, is_mandatory } = data;

  if (!vehicle_type_id || !maintenance_type || !step_name) {
    return fail('Thiếu thông tin bắt buộc');
  }

  const maxOrder = await vehicleStepRepo.getMaxOrder(vehicle_type_id, maintenance_type);
  const step_order = data.step_order || (maxOrder + 1);

  // Nếu có step_order tùy chỉnh, đẩy các bước sau lên
  if (data.step_order) {
    await getDb().query(`
      UPDATE vehicle_maintenance_steps
      SET step_order = step_order + 1
      WHERE vehicle_type_id = $1 AND maintenance_type = $2 AND step_order >= $3
    `, [vehicle_type_id, maintenance_type, step_order]);
  }

  const step = await vehicleStepRepo.create({
    vehicle_type_id,
    maintenance_type,
    step_order,
    step_name: step_name.trim(),
    technical_requirement: technical_requirement || null,
    estimated_time: estimated_time ? parseInt(estimated_time) : null,
    tools_required: tools_required || null,
    safety_notes: safety_notes || null,
    is_mandatory: is_mandatory !== false,
    created_by: userId,
  });

  return ok(step, 'Thêm bước thành công');
}

async function updateStep(id, data, userId) {
  const step = await vehicleStepRepo.findById(id);
  if (!step) return fail('Không tìm thấy bước');

  const allowed = ['step_name', 'technical_requirement', 'estimated_time',
                   'tools_required', 'safety_notes', 'is_mandatory'];
  const updateData = {};
  for (const k of allowed) {
    if (data[k] !== undefined) updateData[k] = data[k];
  }

  await vehicleStepRepo.update(id, updateData);
  return ok(await vehicleStepRepo.findById(id), 'Cập nhật bước thành công');
}

async function deleteStep(id, userId) {
  const step = await vehicleStepRepo.findById(id);
  if (!step) return fail('Không tìm thấy bước');

  await vehicleStepRepo.delete(id);
  // Sắp xếp lại thứ tự
  await vehicleStepRepo.reorder(step.vehicle_type_id, step.maintenance_type);
  return ok(null, 'Xóa bước thành công');
}

async function reorderSteps(vehicleTypeId, maintenanceType, orderedIds, userId) {
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) return fail('Danh sách id không hợp lệ');

  for (let i = 0; i < orderedIds.length; i++) {
    await getDb().query(
      'UPDATE vehicle_maintenance_steps SET step_order = $1 WHERE id = $2 AND vehicle_type_id = $3',
      [i + 1, orderedIds[i], vehicleTypeId]
    );
  }
  return ok(null, 'Sắp xếp lại thành công');
}

async function _audit(userId, action, table, targetId) {
  try {
    await getDb().query(
      'INSERT INTO audit_logs (user_id, action, target_table, target_id) VALUES ($1,$2,$3,$4)',
      [userId, action, table, targetId]
    );
  } catch (e) {}
}

module.exports = {
  listTypes, getType, createType, updateType, deleteType,
  listSteps, createStep, updateStep, deleteStep, reorderSteps,
};