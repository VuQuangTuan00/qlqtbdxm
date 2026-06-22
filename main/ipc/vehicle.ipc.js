'use strict';

const { ipcMain } = require('electron');
const vehicleService = require('../services/vehicle.service');
const authService    = require('../services/auth.service');
const { fail }       = require('../utils/response');

function register() {
  // ── Vehicle ──────────────────────────────────────────────────

  ipcMain.handle('vehicle:list', async (_e, opts = {}) => {
    try { return await vehicleService.listVehicles(opts); }
    catch (err) { return fail(err.message); }
  });

  ipcMain.handle('vehicle:get', async (_e, { id } = {}) => {
    try {
      if (!id) return fail('Thiếu id');
      return await vehicleService.getVehicle(id);
    } catch (err) { return fail(err.message); }
  });

  ipcMain.handle('vehicle:create', async (_e, data = {}) => {
    try {
      const session = authService.requireAuth();
      if (!session) return fail('Chưa đăng nhập');
      if (!authService.requireAdmin()) return fail('Chỉ admin mới tạo được');
      return await vehicleService.createVehicle(data, session.userId);
    } catch (err) { return fail(err.message); }
  });

  ipcMain.handle('vehicle:update', async (_e, { id, data } = {}) => {
    try {
      const session = authService.requireAuth();
      if (!session) return fail('Chưa đăng nhập');
      if (!authService.requireAdmin()) return fail('Chỉ admin mới cập nhật được');
      return await vehicleService.updateVehicle(id, data, session.userId);
    } catch (err) { return fail(err.message); }
  });

  ipcMain.handle('vehicle:delete', async (_e, { id } = {}) => {
    try {
      const session = authService.requireAuth();
      if (!session) return fail('Chưa đăng nhập');
      if (!authService.requireAdmin()) return fail('Chỉ admin mới xóa được');
      return await vehicleService.deleteVehicle(id, session.userId);
    } catch (err) { return fail(err.message); }
  });

  // ── Engine Maintenance ───────────────────────────────────────

  ipcMain.handle('engineMaintenance:list', async (_e, { vehicleId } = {}) => {
    try { return await vehicleService.listMaintenance(vehicleId); }
    catch (err) { return fail(err.message); }
  });

  ipcMain.handle('engineMaintenance:create', async (_e, data = {}) => {
    try {
      const session = authService.requireAuth();
      if (!session) return fail('Chưa đăng nhập');
      if (!authService.requireAdmin()) return fail('Chỉ admin mới thêm được');
      return await vehicleService.createMaintenance(data, session.userId);
    } catch (err) { return fail(err.message); }
  });

  ipcMain.handle('engineMaintenance:update', async (_e, { id, data } = {}) => {
    try {
      const session = authService.requireAuth();
      if (!session) return fail('Chưa đăng nhập');
      if (!authService.requireAdmin()) return fail('Chỉ admin mới sửa được');
      return await vehicleService.updateMaintenance(id, data, session.userId);
    } catch (err) { return fail(err.message); }
  });

  ipcMain.handle('engineMaintenance:delete', async (_e, { id } = {}) => {
    try {
      const session = authService.requireAuth();
      if (!session) return fail('Chưa đăng nhập');
      if (!authService.requireAdmin()) return fail('Chỉ admin mới xóa được');
      return await vehicleService.deleteMaintenance(id, session.userId);
    } catch (err) { return fail(err.message); }
  });

  ipcMain.handle('engineMaintenance:reorder', async (_e, { vehicleId, orderedIds } = {}) => {
    try {
      const session = authService.requireAuth();
      if (!session) return fail('Chưa đăng nhập');
      if (!authService.requireAdmin()) return fail('Chỉ admin mới sắp xếp được');
      return await vehicleService.reorderMaintenance(vehicleId, orderedIds, session.userId);
    } catch (err) { return fail(err.message); }
  });

  ipcMain.handle('engineMaintenance:uploadFile', async (_e, { id, tab, fileData } = {}) => {
    try {
      const session = authService.requireAuth();
      if (!session) return fail('Chưa đăng nhập');
      if (!authService.requireAdmin()) return fail('Chỉ admin mới upload được');
      return await vehicleService.uploadFile(id, tab, fileData, session.userId);
    } catch (err) { return fail(err.message); }
  });

  ipcMain.handle('engineMaintenance:deleteFile', async (_e, { id, tab } = {}) => {
    try {
      const session = authService.requireAuth();
      if (!session) return fail('Chưa đăng nhập');
      if (!authService.requireAdmin()) return fail('Chỉ admin mới xóa file được');
      return await vehicleService.deleteFile(id, tab, session.userId);
    } catch (err) { return fail(err.message); }
  });

  ipcMain.handle('engineMaintenance:readFile', async (_e, { id, tab } = {}) => {
    try {
      return await vehicleService.readFile(id, tab);
    } catch (err) { return fail(err.message); }
  });

  // ── Vehicle Type ─────────────────────────────────────────────

  ipcMain.handle('vehicleType:list', async (_e) => {
    try { return await vehicleService.listVehicleTypes(); }
    catch (err) { return fail(err.message); }
  });

  ipcMain.handle('vehicleType:create', async (_e, data = {}) => {
    try {
      const session = authService.requireAuth();
      if (!session) return fail('Chưa đăng nhập');
      if (!authService.requireAdmin()) return fail('Chỉ admin mới thêm được');
      return await vehicleService.createVehicleType(data);
    } catch (err) { return fail(err.message); }
  });

  ipcMain.handle('vehicleType:update', async (_e, { id, data } = {}) => {
    try {
      const session = authService.requireAuth();
      if (!session) return fail('Chưa đăng nhập');
      if (!authService.requireAdmin()) return fail('Chỉ admin mới sửa được');
      return await vehicleService.updateVehicleType(id, data);
    } catch (err) { return fail(err.message); }
  });

  ipcMain.handle('vehicleType:delete', async (_e, { id } = {}) => {
    try {
      const session = authService.requireAuth();
      if (!session) return fail('Chưa đăng nhập');
      if (!authService.requireAdmin()) return fail('Chỉ admin mới xóa được');
      return await vehicleService.deleteVehicleType(id);
    } catch (err) { return fail(err.message); }
  });
}

module.exports = { register };
