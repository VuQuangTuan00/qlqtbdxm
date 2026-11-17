'use strict';

const path = require('path');
const fs   = require('fs');
const { randomUUID } = require('crypto');
const { shell } = require('electron');

const vehicleRepo      = require('../repositories/vehicle.repository');
const engineRepo       = require('../repositories/engine-maintenance.repository');
const vehicleTypeRepo  = require('../repositories/vehicle-type.repository');
const { getDb } = require('../database/index');
const { ok, fail }      = require('../utils/response');
const logger       = require('../utils/logger');
const { deleteOrQueue } = require('./pending-file-cleanup.service');
const fileStorage = require('./file-storage.service');

const FILE_TABS = ['tech_process', 'norm_ktkt'];
const MAX_PDF_SIZE = 50 * 1024 * 1024;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

// ── Helpers file ────────────────────────────────────────────────

function _vehicleImgDir() {
  return fileStorage.ensureFolder('vehicle-images');
}

function _pdfDir() {
  return fileStorage.ensureFolder('maintenance-files');
}

function _saveFile(dir, originalName, buffer, expectedFolder) {
  const ext  = path.extname(originalName) || '';
  const base = path.basename(originalName, ext).replace(/[^a-zA-Z0-9_\-]/g, '_');
  const fname = `${base || 'file'}_${Date.now()}_${randomUUID()}${ext.toLowerCase()}`;
  const fpath = path.join(dir, fname);
  const storedPath = fileStorage.toStoredPath(fpath, expectedFolder);
  fs.writeFileSync(fpath, buffer, { flag: 'wx' });
  return { name: fname, filePath: fpath, storedPath };
}

function _deleteAbsoluteFile(filePath) {
  return filePath ? deleteOrQueue(filePath) : false;
}

function _resolveStoredPath(storedPath, expectedFolder, options) {
  if (!storedPath) return null;
  try {
    return fileStorage.resolveStoredPath(storedPath, expectedFolder, options);
  } catch (error) {
    logger.warn(`[Vehicle] Rejected file path '${storedPath}': ${error.message}`);
    return null;
  }
}

function _deleteStoredFile(storedPath, expectedFolder) {
  const absolutePath = _resolveStoredPath(storedPath, expectedFolder, { mustExist: false });
  return absolutePath ? deleteOrQueue(absolutePath) : false;
}

function _validTab(tab) {
  return FILE_TABS.includes(tab);
}

function _validatePdf(fileName, buffer) {
  if (path.extname(fileName).toLowerCase() !== '.pdf') {
    return 'Chỉ chấp nhận file PDF';
  }
  if (!buffer.length || buffer.length > MAX_PDF_SIZE) {
    return `File PDF phải có dung lượng từ 1 byte đến ${MAX_PDF_SIZE / (1024 * 1024)} MB`;
  }
  if (!buffer.subarray(0, 1024).toString('latin1').includes('%PDF-')) {
    return 'Nội dung file không đúng định dạng PDF';
  }
  return null;
}

function _validateImage(fileName, buffer) {
  const extension = path.extname(fileName).toLowerCase();
  if (!['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(extension)) {
    return 'Chỉ chấp nhận ảnh JPG, PNG, GIF hoặc WEBP';
  }
  if (!buffer.length || buffer.length > MAX_IMAGE_SIZE) {
    return `Ảnh phải có dung lượng từ 1 byte đến ${MAX_IMAGE_SIZE / (1024 * 1024)} MB`;
  }

  const isJpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  const gifHeader = buffer.subarray(0, 6).toString('ascii');
  const isGif = gifHeader === 'GIF87a' || gifHeader === 'GIF89a';
  const isWebp = buffer.length >= 12
    && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  const signatureMatches = extension === '.png' ? isPng
    : ['.jpg', '.jpeg'].includes(extension) ? isJpeg
      : extension === '.gif' ? isGif
        : isWebp;

  return signatureMatches ? null : 'Nội dung file không đúng định dạng ảnh';
}

function _resolveVehicle(v) {
  if (!v) return v;
  const resolved = v.img_path ? _resolveStoredPath(v.img_path, 'vehicle-images') : null;
  return { ...v, img_url: resolved ? fileStorage.toFileUrl(resolved) : null };
}

// ── Vehicle CRUD ────────────────────────────────────────────────

async function listVehicles(opts = {}) {
  const rows = await vehicleRepo.listWithStats(opts);
  return ok(rows.map(_resolveVehicle));
}

async function getVehicle(id) {
  const v = await vehicleRepo.findByIdFull(id);
  if (!v) return fail('Không tìm thấy loại xe');
  v.equipments = await vehicleRepo.getEquipments(id);
  return ok(_resolveVehicle(v));
}

async function createVehicle(data, userId) {
  const { vehicle_name, img_name, img_buffer } = data;
  if (!vehicle_name?.trim()) return fail('Thiếu tên xe');

  let savedImgName = null;
  let savedImgPath = null;
  if (img_name && img_buffer) {
    const buf   = Buffer.from(img_buffer);
    const validationError = _validateImage(img_name, buf);
    if (validationError) return fail(validationError);
    const saved = _saveFile(_vehicleImgDir(), img_name, buf, 'vehicle-images');
    savedImgName = saved.name;
    savedImgPath = saved.storedPath;
  }

  let v;
  try {
    v = await vehicleRepo.create({
      vehicle_name: vehicle_name.trim(),
      img_name:     savedImgName,
      img_path:     savedImgPath,
      is_active:    true,
    });
  } catch (error) {
    _deleteStoredFile(savedImgPath, 'vehicle-images');
    throw error;
  }

  await _audit(userId, 'create', 'vehicle', v.vehicle_id);
  logger.info(`[Vehicle] Tạo: ${vehicle_name}`);
  return ok(_resolveVehicle(await vehicleRepo.findByIdFull(v.vehicle_id)), 'Thêm thành công!');
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

  let replacementPath = null;
  let oldPathToDelete = null;
  if (remove_img) {
    oldPathToDelete = existing.img_path;
    updateData.img_name = null;
    updateData.img_path = null;
  } else if (img_name && img_buffer) {
    const buf   = Buffer.from(img_buffer);
    const validationError = _validateImage(img_name, buf);
    if (validationError) return fail(validationError);
    const saved = _saveFile(_vehicleImgDir(), img_name, buf, 'vehicle-images');
    replacementPath = saved.filePath;
    oldPathToDelete = existing.img_path;
    updateData.img_name = saved.name;
    updateData.img_path = saved.storedPath;
  }

  try {
    await vehicleRepo.update(id, updateData);
  } catch (error) {
    _deleteAbsoluteFile(replacementPath);
    throw error;
  }
  _deleteStoredFile(oldPathToDelete, 'vehicle-images');
  await _audit(userId, 'update', 'vehicle', id);
  return ok(_resolveVehicle(await vehicleRepo.findByIdFull(id)), 'Cập nhật thành công');
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
  await vehicleRepo.delete(id);
  for (const item of items) {
    _deleteStoredFile(item.tech_process_file_path, 'maintenance-files');
    _deleteStoredFile(item.norm_ktkt_file_path, 'maintenance-files');
  }
  _deleteStoredFile(v.img_path, 'vehicle-images');
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
  await engineRepo.delete(id);
  _deleteStoredFile(item.tech_process_file_path, 'maintenance-files');
  _deleteStoredFile(item.norm_ktkt_file_path, 'maintenance-files');
  return ok(null, 'Xóa hạng mục thành công');
}

async function reorderMaintenance(vehicleId, orderedIds, userId) {
  if (!Array.isArray(orderedIds) || !orderedIds.length) return fail('Danh sách id không hợp lệ');
  await engineRepo.reorderAll(vehicleId, orderedIds);
  return ok(null, 'Sắp xếp lại thành công');
}

// ── File operations ─────────────────────────────────────────────

async function uploadFile(id, tab, fileData, userId) {
  if (!_validTab(tab)) return fail('Tab tài liệu không hợp lệ');
  const item = await engineRepo.findById(id);
  if (!item) return fail('Không tìm thấy hạng mục');

  const { file_name, file_buffer } = fileData || {};
  if (!file_name || !file_buffer) return fail('Thiếu dữ liệu file');

  const oldPath = tab === 'tech_process' ? item.tech_process_file_path : item.norm_ktkt_file_path;
  const buf   = Buffer.from(file_buffer);
  const validationError = _validatePdf(file_name, buf);
  if (validationError) return fail(validationError);

  const saved = _saveFile(_pdfDir(), file_name, buf, 'maintenance-files');
  const storedPath = saved.storedPath;

  const updateData = tab === 'tech_process'
    ? { tech_process_file_name: saved.name, tech_process_file_path: storedPath }
    : { norm_ktkt_file_name: saved.name, norm_ktkt_file_path: storedPath };

  try {
    await engineRepo.update(id, updateData);
  } catch (error) {
    _deleteAbsoluteFile(saved.filePath);
    throw error;
  }
  _deleteStoredFile(oldPath, 'maintenance-files');
  return ok({ file_name: saved.name }, 'Upload thành công');
}

async function deleteFile(id, tab, userId) {
  if (!_validTab(tab)) return fail('Tab tài liệu không hợp lệ');
  const item = await engineRepo.findById(id);
  if (!item) return fail('Không tìm thấy hạng mục');

  const filePath = tab === 'tech_process' ? item.tech_process_file_path : item.norm_ktkt_file_path;
  const resolvedPath = filePath
    ? _resolveStoredPath(filePath, 'maintenance-files', { mustExist: false })
    : null;
  if (filePath && !resolvedPath) return fail('Đường dẫn file không hợp lệ');

  const updateData = tab === 'tech_process'
    ? { tech_process_file_name: null, tech_process_file_path: null }
    : { norm_ktkt_file_name: null, norm_ktkt_file_path: null };

  await engineRepo.update(id, updateData);
  _deleteAbsoluteFile(resolvedPath);
  return ok(null, 'Đã xóa file');
}

async function readFile(id, tab) {
  if (!_validTab(tab)) return fail('Tab tài liệu không hợp lệ');
  const item = await engineRepo.findById(id);
  if (!item) return fail('Không tìm thấy hạng mục');

  const filePath = tab === 'tech_process' ? item.tech_process_file_path : item.norm_ktkt_file_path;
  const fileName = tab === 'tech_process' ? item.tech_process_file_name : item.norm_ktkt_file_name;

  if (!filePath) return fail('Chưa có file');
  const absPath = _resolveStoredPath(filePath, 'maintenance-files');
  if (!absPath || !fs.existsSync(absPath)) return fail('File không tồn tại trên đĩa hoặc đường dẫn không hợp lệ');

  const buffer = fs.readFileSync(absPath);
  return ok({ base64: buffer.toString('base64'), file_name: fileName });
}

async function openFile(id, tab) {
  if (!_validTab(tab)) return fail('Tab tài liệu không hợp lệ');
  const item = await engineRepo.findById(id);
  if (!item) return fail('Không tìm thấy hạng mục');

  const filePath = tab === 'tech_process' ? item.tech_process_file_path : item.norm_ktkt_file_path;
  if (!filePath) return fail('Chưa có file');

  const absPath = _resolveStoredPath(filePath, 'maintenance-files');
  if (!absPath || !fs.existsSync(absPath)) return fail('File không tồn tại trong kho file dùng chung');

  const openError = await shell.openPath(absPath);
  return openError ? fail(`Không mở được file: ${openError}`) : ok(null, 'Đã mở file bằng ứng dụng mặc định');
}

// ── Vehicle Type CRUD ───────────────────────────────────────────

async function listVehicleTypes() {
  return ok(await vehicleTypeRepo.findAll());
}

async function createVehicleType(data) {
  const { vehicle_type_name } = data;
  if (!vehicle_type_name?.trim()) return fail('Thiếu tên');
  const item = await vehicleTypeRepo.create({ vehicle_type_name: vehicle_type_name.trim() });
  return ok(item, 'Đã thêm phân loại cho xe');
}

async function updateVehicleType(id, data) {
  if (!(await vehicleTypeRepo.exists(id))) return fail('Không tìm thấy phân loại');
  const { vehicle_type_name } = data;
  if (!vehicle_type_name?.trim()) return fail('Thiếu tên');
  const item = await vehicleTypeRepo.update(id, { vehicle_type_name: vehicle_type_name.trim() });
  return ok(item, 'Cập nhật thành công');
}

async function deleteVehicleType(id) {
  if (!(await vehicleTypeRepo.exists(id))) return fail('Không tìm thấy phân loại');
  await vehicleTypeRepo.delete(id);
  return ok(null, 'Đã xóa phân loại');
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
  uploadFile, deleteFile, readFile, openFile,
  listVehicleTypes, createVehicleType, updateVehicleType, deleteVehicleType,
};
