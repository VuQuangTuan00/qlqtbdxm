'use strict';

const { ipcMain } = require('electron');
const logService = require('../services/maintenance-log.service');
const authService = require('../services/auth.service');
const { fail } = require('../utils/response');

function register() {
  ipcMain.handle('log:list', async (_event, { planId } = {}) => {
    try {
      const session = authService.requireAuth();
      if (!session) return fail('Chưa đăng nhập');
      if (!planId) return fail('Thiếu planId');
      return await logService.list(planId);
    } catch (err) {
      return fail(err.message);
    }
  });

  ipcMain.handle('log:get', async (_event, { id } = {}) => {
    try {
      const session = authService.requireAuth();
      if (!session) return fail('Chưa đăng nhập');
      return await logService.get(id);
    } catch (err) {
      return fail(err.message);
    }
  });

  ipcMain.handle('log:create', async (_event, data = {}) => {
    try {
      const session = authService.requireAuth();
      if (!session) return fail('Chưa đăng nhập');
      if (!['admin', 'technician', 'commander'].includes(session.roleCode)) {
        return fail('Không có quyền thực hiện bảo dưỡng');
      }
      return await logService.create(data, session.userId);
    } catch (err) {
      return fail(err.message);
    }
  });

  ipcMain.handle('log:update', async (_event, { id, data } = {}) => {
    try {
      const session = authService.requireAuth();
      if (!session) return fail('Chưa đăng nhập');
      if (!['admin', 'technician', 'commander'].includes(session.roleCode)) {
        return fail('Không có quyền cập nhật bảo dưỡng');
      }
      return await logService.update(id, data, session.userId);
    } catch (err) {
      return fail(err.message);
    }
  });

  ipcMain.handle('log:updateStatus', async (_event, { id, status, extra } = {}) => {
    try {
      const session = authService.requireAuth();
      if (!session) return fail('Chưa đăng nhập');
      if (!['admin', 'technician', 'commander'].includes(session.roleCode)) {
        return fail('Không có quyền cập nhật trạng thái bảo dưỡng');
      }
      return await logService.updateStatus(id, status, extra || {}, session.userId);
    } catch (err) {
      return fail(err.message);
    }
  });
}

module.exports = { register };
