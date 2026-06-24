'use strict';

const path = require('path');
const fs   = require('fs');
const { app } = require('electron');

const vehicleRepo      = require('../repositories/vehicle.repository');
const engineRepo       = require('../repositories/engine-maintenance.repository');
const vehicleTypeRepo  = require('../repositories/vehicle-type.repository');
const { getDb }    = require('../database/index');
const { ok, fail } = require('../utils/response');
const logger       = require('../utils/logger');

// ── Helpers file ────────────────────────────────────────────────

function _ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function _vehicleImgDir() {
  return _ensureDir(path.join(app.getPath('userData'), 'vehicle-images'));
}

function _pdfDir() {
  return _ensureDir(path.join(app.getPath('userData'), 'maintenance-files'));
}

function _saveFile(dir, originalName, buffer) {
  const ext  = path.extname(originalName) || '';
  const base = path.basename(originalName, ext).replace(/[^a-zA-Z0-9_\-]/g, '_');
  const fname = `${base}_${Date.now()}${ext}`;
  const fpath = path.join(dir, fname);
  fs.writeFileSync(fpath, buffer);
  return { name: fname, filePath: fpath };
}

function _deleteFile(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (e) {}
}

// ── Vehicle CRUD ────────────────────────────────────────────────

async function listVehicles(opts = {}) {
  return ok(await vehicleRepo.listWithStats(opts));
}

async function getVehicle(id) {
  const v = await vehicleRepo.findByIdFull(id);
  if (!v) return fail('Không tìm thấy loại xe');
  v.equipments = await vehicleRepo.getEquipments(id);
  return ok(v);
}

async function createVehicle(data, userId) {
  const { vehicle_name, img_name, img_buffer } = data;
  if (!vehicle_name?.trim()) return fail('Thiếu tên xe');

  let savedImgName = null;
  let savedImgPath = null;
  if (img_name && img_buffer) {
    const buf   = Buffer.from(img_buffer);
    const saved = _saveFile(_vehicleImgDir(), img_name, buf);
    savedImgName = saved.name;
    savedImgPath = saved.filePath;
  }

  const v = await vehicleRepo.create({
    vehicle_name: vehicle_name.trim(),
    img_name:     savedImgName,
    img_path:     savedImgPath,
    is_active:    true,
  });

  await _audit(userId, 'create', 'vehicle', v.vehicle_id);
  logger.info(`[Vehicle] Tạo: ${vehicle_name}`);
  return ok(await vehicleRepo.findByIdFull(v.vehicle_id), 'Tạo loại xe thành công');
}

async function updateVehicle(id, data, userId) {
  const existing = await vehicleRepo.findById(id);
  if (!existing) return fail('Không tìm thấy loại xe');

  const { vehicle_name, is_active, vehicle_type_id, img_name, img_buffer, remove_img } = data;

  const updateData = {};
  if (vehicle_name    !== undefined) updateData.vehicle_name    = vehicle_name.trim();
  if (is_active       !== undefined) updateData.is_active       = is_active;
  if (vehicle_type_id !== undefined) updateData.vehicle_type_id = vehicle_type_id || null;
  updateData.updated_at = new Date();

  if (remove_img) {
    _deleteFile(existing.img_path);
    updateData.img_name = null;
    updateData.img_path = null;
  } else if (img_name && img_buffer) {
    _deleteFile(existing.img_path);
    const buf   = Buffer.from(img_buffer);
    const saved = _saveFile(_vehicleImgDir(), img_name, buf);
    updateData.img_name = saved.name;
    updateData.img_path = saved.filePath;
  }

  await vehicleRepo.update(id, updateData);
  await _audit(userId, 'update', 'vehicle', id);
  return ok(await vehicleRepo.findByIdFull(id), 'Cập nhật thành công');
}

async function deleteVehicle(id, userId) {
  const v = await vehicleRepo.findById(id);
  if (!v) return fail('Không tìm thấy loại xe');

  const { rows: eq } = await getDb().query(
    'SELECT COUNT(*) AS c FROM equipments WHERE vehicle_id = $1', [id]
  );
  if (parseInt(eq[0].c) > 0) {
    return fail(`Không thể xóa: có ${eq[0].c} trang bị đang sử dụng loại xe này`);
  }

  const items = await engineRepo.findByVehicle(id);
  for (const item of items) {
    _deleteFile(item.tech_process_file_path);
    _deleteFile(item.norm_ktkt_file_path);
  }
  _deleteFile(v.img_path);

  await vehicleRepo.delete(id);
  await _audit(userId, 'delete', 'vehicle', id);
  return ok(null, 'Xóa loại xe thành công');
}

// ── Engine Maintenance CRUD ─────────────────────────────────────

async function listMaintenance(vehicleId) {
  if (!vehicleId) return fail('Thiếu vehicleId');
  return ok(await engineRepo.findByVehicle(vehicleId));
}

async function createMaintenance(data, userId) {
  const { vehicle_id, maintenance_name } = data;
  if (!vehicle_id || !maintenance_name?.trim()) return fail('Thiếu thông tin bắt buộc');

  const maxOrder = await engineRepo.getMaxOrder(vehicle_id);
  const item = await engineRepo.create({
    vehicle_id,
    maintenance_name: maintenance_name.trim(),
    display_order:    maxOrder + 1,
  });
  return ok(item, 'Thêm hạng mục thành công');
}

async function updateMaintenance(id, data, userId) {
  const item = await engineRepo.findById(id);
  if (!item) return fail('Không tìm thấy hạng mục');

  const updateData = {};
  if (data.maintenance_name !== undefined) {
    updateData.maintenance_name = data.maintenance_name.trim();
  }
  await engineRepo.update(id, updateData);
  return ok(await engineRepo.findById(id), 'Cập nhật thành công');
}

async function deleteMaintenance(id, userId) {
  const item = await engineRepo.findById(id);
  if (!item) return fail('Không tìm thấy hạng mục');
  _deleteFile(item.tech_process_file_path);
  _deleteFile(item.norm_ktkt_file_path);
  await engineRepo.delete(id);
  return ok(null, 'Xóa hạng mục thành công');
}

async function reorderMaintenance(vehicleId, orderedIds, userId) {
  if (!Array.isArray(orderedIds) || !orderedIds.length) return fail('Danh sách id không hợp lệ');
  await engineRepo.reorderAll(vehicleId, orderedIds);
  return ok(null, 'Sắp xếp lại thành công');
}

// ── File operations ─────────────────────────────────────────────

async function uploadFile(id, tab, fileData, userId) {
  const item = await engineRepo.findById(id);
  if (!item) return fail('Không tìm thấy hạng mục');

  const { file_name, file_buffer } = fileData;
  if (!file_name || !file_buffer) return fail('Thiếu dữ liệu file');

  const oldPath = tab === 'tech_process' ? item.tech_process_file_path : item.norm_ktkt_file_path;
  _deleteFile(oldPath);

  const buf   = Buffer.from(file_buffer);
  const saved = _saveFile(_pdfDir(), file_name, buf);

  const updateData = tab === 'tech_process'
    ? { tech_process_file_name: saved.name, tech_process_file_path: saved.filePath }
    : { norm_ktkt_file_name: saved.name, norm_ktkt_file_path: saved.filePath };

  await engineRepo.update(id, updateData);
  return ok({ file_name: saved.name }, 'Upload thành công');
}

async function deleteFile(id, tab, userId) {
  const item = await engineRepo.findById(id);
  if (!item) return fail('Không tìm thấy hạng mục');

  const filePath = tab === 'tech_process' ? item.tech_process_file_path : item.norm_ktkt_file_path;
  _deleteFile(filePath);

  const updateData = tab === 'tech_process'
    ? { tech_process_file_name: null, tech_process_file_path: null }
    : { norm_ktkt_file_name: null, norm_ktkt_file_path: null };

  await engineRepo.update(id, updateData);
  return ok(null, 'Đã xóa file');
}

async function readFile(id, tab) {
  const item = await engineRepo.findById(id);
  if (!item) return fail('Không tìm thấy hạng mục');

  const filePath = tab === 'tech_process' ? item.tech_process_file_path : item.norm_ktkt_file_path;
  const fileName = tab === 'tech_process' ? item.tech_process_file_name : item.norm_ktkt_file_name;

  if (!filePath) return fail('Chưa có file');
  if (!fs.existsSync(filePath)) return fail('File không tồn tại trên đĩa');

  const buffer = fs.readFileSync(filePath);
  return ok({ base64: buffer.toString('base64'), file_name: fileName });
}

// ── Vehicle Type CRUD ───────────────────────────────────────────

async function listVehicleTypes() {
  return ok(await vehicleTypeRepo.findAll());
}

async function createVehicleType(data) {
  const { vehicle_type_name } = data;
  if (!vehicle_type_name?.trim()) return fail('Thiếu tên loại hình');
  const item = await vehicleTypeRepo.create({ vehicle_type_name: vehicle_type_name.trim() });
  return ok(item, 'Thêm loại hình thành công');
}

async function updateVehicleType(id, data) {
  if (!(await vehicleTypeRepo.exists(id))) return fail('Không tìm thấy loại hình');
  const { vehicle_type_name } = data;
  if (!vehicle_type_name?.trim()) return fail('Thiếu tên loại hình');
  const item = await vehicleTypeRepo.update(id, { vehicle_type_name: vehicle_type_name.trim() });
  return ok(item, 'Cập nhật thành công');
}

async function deleteVehicleType(id) {
  if (!(await vehicleTypeRepo.exists(id))) return fail('Không tìm thấy loại hình');
  await vehicleTypeRepo.delete(id);
  return ok(null, 'Đã xóa loại hình');
}

// ── Audit ───────────────────────────────────────────────────────

async function _audit(userId, action, table, targetId) {
  try {
    await getDb().query(
      'INSERT INTO audit_logs (user_id, action, target_table, target_id) VALUES ($1,$2,$3,$4)',
      [userId, action, table, targetId]
    );
  } catch (e) {}
}

module.exports = {
  listVehicles, getVehicle, createVehicle, updateVehicle, deleteVehicle,
  listMaintenance, createMaintenance, updateMaintenance, deleteMaintenance, reorderMaintenance,
  uploadFile, deleteFile, readFile,
  listVehicleTypes, createVehicleType, updateVehicleType, deleteVehicleType,
};
