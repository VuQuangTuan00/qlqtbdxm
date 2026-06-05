'use strict';

const { ipcMain } = require('electron');
const vehicleService = require('../services/vehicle-type.service');
const authService = require('../services/auth.service');
const { fail } = require('../utils/response');

function register() {
  // ---- Vehicle Types ----

  ipcMain.handle('vehicleType:list', async (_e, opts = {}) => {
    try {
      return await vehicleService.listTypes(opts);
    } catch (err) { return fail(err.message); }
  });

  ipcMain.handle('vehicleType:get', async (_e, { id } = {}) => {
    try {
      if (!id) return fail('Thiếu id');
      return await vehicleService.getType(id);
    } catch (err) { return fail(err.message); }
  });

  ipcMain.handle('vehicleType:create', async (_e, data = {}) => {
    try {
      const session = authService.requireAuth();
      if (!session) return fail('Chưa đăng nhập');
      if (!authService.requireAdmin()) return fail('Chỉ admin mới tạo được');
      return await vehicleService.createType(data, session.userId);
    } catch (err) { return fail(err.message); }
  });

  ipcMain.handle('vehicleType:update', async (_e, { id, data } = {}) => {
    try {
      const session = authService.requireAuth();
      if (!session) return fail('Chưa đăng nhập');
      if (!authService.requireAdmin()) return fail('Chỉ admin mới cập nhật được');
      return await vehicleService.updateType(id, data, session.userId);
    } catch (err) { return fail(err.message); }
  });

  ipcMain.handle('vehicleType:delete', async (_e, { id } = {}) => {
    try {
      const session = authService.requireAuth();
      if (!session) return fail('Chưa đăng nhập');
      if (!authService.requireAdmin()) return fail('Chỉ admin mới xóa được');
      return await vehicleService.deleteType(id, session.userId);
    } catch (err) { return fail(err.message); }
  });

  // ---- Vehicle Maintenance Steps ----

  ipcMain.handle('vehicleStep:list', async (_e, { vehicleTypeId, maintenanceType } = {}) => {
    try {
      return await vehicleService.listSteps(vehicleTypeId, maintenanceType);
    } catch (err) { return fail(err.message); }
  });

  ipcMain.handle('vehicleStep:create', async (_e, data = {}) => {
    try {
      const session = authService.requireAuth();
      if (!session) return fail('Chưa đăng nhập');
      if (!authService.requireAdmin()) return fail('Chỉ admin mới thêm bước được');
      return await vehicleService.createStep(data, session.userId);
    } catch (err) { return fail(err.message); }
  });

  ipcMain.handle('vehicleStep:update', async (_e, { id, data } = {}) => {
    try {
      const session = authService.requireAuth();
      if (!session) return fail('Chưa đăng nhập');
      if (!authService.requireAdmin()) return fail('Chỉ admin mới sửa bước được');
      return await vehicleService.updateStep(id, data, session.userId);
    } catch (err) { return fail(err.message); }
  });

  ipcMain.handle('vehicleStep:delete', async (_e, { id } = {}) => {
    try {
      const session = authService.requireAuth();
      if (!session) return fail('Chưa đăng nhập');
      if (!authService.requireAdmin()) return fail('Chỉ admin mới xóa bước được');
      return await vehicleService.deleteStep(id, session.userId);
    } catch (err) { return fail(err.message); }
  });

  ipcMain.handle('vehicleStep:reorder', async (_e, { vehicleTypeId, maintenanceType, orderedIds } = {}) => {
    try {
      const session = authService.requireAuth();
      if (!session) return fail('Chưa đăng nhập');
      if (!authService.requireAdmin()) return fail('Chỉ admin mới sắp xếp được');
      return await vehicleService.reorderSteps(vehicleTypeId, maintenanceType, orderedIds, session.userId);
    } catch (err) { return fail(err.message); }
  });
}

module.exports = { register };