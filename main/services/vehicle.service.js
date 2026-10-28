'use strict';

const path = require('path');
const fs   = require('fs');
const { app, shell } = require('electron');

const vehicleRepo      = require('../repositories/vehicle.repository');
const engineRepo       = require('../repositories/engine-maintenance.repository');
const vehicleTypeRepo  = require('../repositories/vehicle-type.repository');
const { getDb } = require('../database/index');
const { ok, fail }      = require('../utils/response');
const logger       = require('../utils/logger');

// ── Helpers file ────────────────────────────────────────────────

function _ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function _userDataPath() {
  if (process.env.NODE_ENV === 'test' && process.env.QLQT_USER_DATA_PATH) {
    return path.resolve(process.env.QLQT_USER_DATA_PATH);
  }
  return app.getPath('userData');
}

function _vehicleImgDir() {
  return _ensureDir(path.join(_userDataPath(), 'vehicle-images'));
}

function _pdfDir() {
  return _ensureDir(path.join(_userDataPath(), 'maintenance-files'));
}

function _saveFile(dir, originalName, buffer) {
  const ext  = path.extname(originalName) || '';
  const base = path.basename(originalName, ext).replace(/[^a-zA-Z0-9_\-]/g, '_');
  const fname = `${base}_${Date.now()}${ext}`;
  const fpath = path.join(dir, fname);
  fs.writeFileSync(fpath, buffer);
  return { name: fname, filePath: fpath };
}

function _isSupportedImage(buffer, extension) {
  const hex = buffer.subarray(0, 12).toString('hex');
  if (['.jpg', '.jpeg'].includes(extension)) return hex.startsWith('ffd8ff');
  if (extension === '.png') return hex.startsWith('89504e470d0a1a0a');
  if (extension === '.gif') return buffer.subarray(0, 4).toString('ascii') === 'GIF8';
  if (extension === '.webp') return buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  return false;
}

function _isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

function _deleteFile(filePath) {
  try {
    const abs = _resolveFilePath(filePath);
    if (abs && fs.existsSync(abs)) fs.unlinkSync(abs);
  } catch (e) {}
}

function _resolveFilePath(p, fallbackFolder) {
  if (!p) return null;
  const userDataPath = _userDataPath();
  const normalizedPath = p.replace(/[\\/]/g, path.sep);
  const storedPath = path.isAbsolute(normalizedPath) ? path.resolve(normalizedPath) : path.resolve(userDataPath, normalizedPath);
  if (storedPath !== userDataPath && !_isInside(userDataPath, storedPath)) return null;
  if (fs.existsSync(storedPath) || !fallbackFolder) return storedPath;

  const fileName = path.basename(normalizedPath);
  const candidatePaths = [
    path.join(userDataPath, 'uploads', fileName),
    path.join(userDataPath, fallbackFolder, fileName),
  ];
  return candidatePaths.find((candidate) => fs.existsSync(candidate)) || storedPath;
}

function _storePath(absolutePath) {
  if (!absolutePath) return null;
  const userDataPath = _userDataPath();
  if (!_isInside(userDataPath, absolutePath)) throw new Error('File nằm ngoài thư mục dữ liệu ứng dụng');
  return path.relative(userDataPath, absolutePath).split(path.sep).join('/');
}

function _resolveVehicle(v) {
  if (v && v.img_path) v.img_path = _resolveFilePath(v.img_path, 'vehicle-images');
  return v;
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
    const ext = path.extname(img_name).toLowerCase();
    if (!['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) return fail('Ảnh không đúng định dạng hỗ trợ');
    if (buf.length > 10 * 1024 * 1024) return fail('Ảnh không được vượt quá 10 MB');
    if (!_isSupportedImage(buf, ext)) return fail('Nội dung file ảnh không khớp định dạng');
    const saved = _saveFile(_vehicleImgDir(), img_name, buf);
    savedImgName = saved.name;
    savedImgPath = _storePath(saved.filePath);
  }

  let v;
  try {
    v = await vehicleRepo.create({
      vehicle_name: vehicle_name.trim(),
      img_name: savedImgName,
      img_path: savedImgPath,
      is_active: true,
    });
  } catch (error) {
    if (savedImgPath) _deleteFile(savedImgPath);
    throw error;
  }

  await _audit(userId, 'create', 'vehicle', v.vehicle_id);
  logger.info(`[Vehicle] Tạo: ${vehicle_name}`);
  return ok(_resolveVehicle(await vehicleRepo.findByIdFull(v.vehicle_id)), 'Tạo loại xe thành công');
}

async function updateVehicle(id, data, userId) {
  const existing = await vehicleRepo.findById(id);
  if (!existing) return fail('Không tìm thấy loại xe');

  const { vehicle_name, is_active, vehicle_type_id, img_name, img_buffer, remove_img } = data;

  const updateData = {};
  let newFilePath = null;
  let oldFilePath = null;
  if (vehicle_name    !== undefined) updateData.vehicle_name    = vehicle_name.trim();
  if (is_active       !== undefined) updateData.is_active       = is_active;
  if (vehicle_type_id !== undefined) updateData.vehicle_type_id = vehicle_type_id || null;
  updateData.updated_at = new Date();

  if (remove_img) {
    oldFilePath = existing.img_path;
    updateData.img_name = null;
    updateData.img_path = null;
  } else if (img_name && img_buffer) {
    const buf   = Buffer.from(img_buffer);
    const ext = path.extname(img_name).toLowerCase();
    if (!['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) return fail('Ảnh không đúng định dạng hỗ trợ');
    if (buf.length > 10 * 1024 * 1024) return fail('Ảnh không được vượt quá 10 MB');
    if (!_isSupportedImage(buf, ext)) return fail('Nội dung file ảnh không khớp định dạng');
    const saved = _saveFile(_vehicleImgDir(), img_name, buf);
    newFilePath = saved.filePath;
    oldFilePath = existing.img_path;
    updateData.img_name = saved.name;
    updateData.img_path = _storePath(saved.filePath);
  }

  try {
    await vehicleRepo.update(id, updateData);
  } catch (error) {
    if (newFilePath) _deleteFile(newFilePath);
    throw error;
  }
  if (oldFilePath) _deleteFile(oldFilePath);
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
    _deleteFile(item.tech_process_file_path);
    _deleteFile(item.norm_ktkt_file_path);
  }
  _deleteFile(v.img_path);
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
  _deleteFile(item.tech_process_file_path);
  _deleteFile(item.norm_ktkt_file_path);
  return ok(null, 'Xóa hạng mục thành công');
}

async function reorderMaintenance(vehicleId, orderedIds, userId) {
  if (!Array.isArray(orderedIds) || !orderedIds.length) return fail('Danh sách id không hợp lệ');
  await getDb().transaction(async () => engineRepo.reorderAll(vehicleId, orderedIds));
  return ok(null, 'Sắp xếp lại thành công');
}

// ── File operations ─────────────────────────────────────────────

async function uploadFile(id, tab, fileData, userId) {
  const item = await engineRepo.findById(id);
  if (!item) return fail('Không tìm thấy hạng mục');

  const { file_name, file_buffer } = fileData;
  if (!file_name || !file_buffer) return fail('Thiếu dữ liệu file');

  if (!['tech_process', 'norm_ktkt'].includes(tab)) return fail('Loại tài liệu không hợp lệ');
  const oldPath = tab === 'tech_process' ? item.tech_process_file_path : item.norm_ktkt_file_path;

  const buf   = Buffer.from(file_buffer);
  if (path.extname(file_name).toLowerCase() !== '.pdf' || buf.subarray(0, 5).toString('ascii') !== '%PDF-') {
    return fail('Chỉ chấp nhận tài liệu PDF hợp lệ');
  }
  if (buf.length > 25 * 1024 * 1024) return fail('Tài liệu không được vượt quá 25 MB');
  const saved = _saveFile(_pdfDir(), file_name, buf);
  const storedPath = _storePath(saved.filePath);

  const updateData = tab === 'tech_process'
    ? { tech_process_file_name: saved.name, tech_process_file_path: storedPath }
    : { norm_ktkt_file_name: saved.name, norm_ktkt_file_path: storedPath };

  try {
    await engineRepo.update(id, updateData);
  } catch (error) {
    _deleteFile(saved.filePath);
    throw error;
  }
  _deleteFile(oldPath);
  return ok({ file_name: saved.name }, 'Upload thành công');
}

async function deleteFile(id, tab, userId) {
  const item = await engineRepo.findById(id);
  if (!item) return fail('Không tìm thấy hạng mục');
  if (!['tech_process', 'norm_ktkt'].includes(tab)) return fail('Loại tài liệu không hợp lệ');

  const filePath = tab === 'tech_process' ? item.tech_process_file_path : item.norm_ktkt_file_path;
  const updateData = tab === 'tech_process'
    ? { tech_process_file_name: null, tech_process_file_path: null }
    : { norm_ktkt_file_name: null, norm_ktkt_file_path: null };

  await engineRepo.update(id, updateData);
  _deleteFile(filePath);
  return ok(null, 'Đã xóa file');
}

async function readFile(id, tab) {
  const item = await engineRepo.findById(id);
  if (!item) return fail('Không tìm thấy hạng mục');
  if (!['tech_process', 'norm_ktkt'].includes(tab)) return fail('Loại tài liệu không hợp lệ');

  const filePath = tab === 'tech_process' ? item.tech_process_file_path : item.norm_ktkt_file_path;
  const fileName = tab === 'tech_process' ? item.tech_process_file_name : item.norm_ktkt_file_name;

  if (!filePath) return fail('Chưa có file');
  const absPath = _resolveFilePath(filePath, 'maintenance-files');
  if (!absPath || !fs.existsSync(absPath)) return fail('File không tồn tại trên đĩa');

  const buffer = fs.readFileSync(absPath);
  return ok({ base64: buffer.toString('base64'), file_name: fileName });
}

async function openFile(id, tab) {
  const item = await engineRepo.findById(id);
  if (!item) return fail('Không tìm thấy hạng mục');
  if (!['tech_process', 'norm_ktkt'].includes(tab)) return fail('Loại tài liệu không hợp lệ');

  const filePath = tab === 'tech_process' ? item.tech_process_file_path : item.norm_ktkt_file_path;
  if (!filePath) return fail('Chưa có file');

  const absPath = _resolveFilePath(filePath, 'maintenance-files');
  if (!absPath || !fs.existsSync(absPath)) return fail('File không tồn tại trong uploads hoặc maintenance-files');

  const openError = await shell.openPath(absPath);
  return openError ? fail(`Không mở được file: ${openError}`) : ok(null, 'Đã mở file bằng ứng dụng mặc định');
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
  uploadFile, deleteFile, readFile, openFile,
  listVehicleTypes, createVehicleType, updateVehicleType, deleteVehicleType,
};
