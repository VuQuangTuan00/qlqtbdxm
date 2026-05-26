'use strict';

const { ipcMain } = require('electron');
const planService = require('../services/maintenance-plan.service');
const authService = require('../services/auth.service');
const { fail } = require('../utils/response');
const logger = require('../utils/logger');

function register() {
  ipcMain.handle('plan:list', async (_event, opts = {}) => {
    try {
      logger.ipc('plan:list', opts);
      return await planService.list(opts);
    } catch (err) {
      return fail(err.message);
    }
  });

  ipcMain.handle('plan:get', async (_event, { id } = {}) => {
    try {
      return await planService.get(id);
    } catch (err) {
      return fail(err.message);
    }
  });

  ipcMain.handle('plan:getSteps', async (_event, { maintenanceType } = {}) => {
    try {
      return await planService.getSteps(maintenanceType);
    } catch (err) {
      return fail(err.message);
    }
  });

  ipcMain.handle('plan:create', async (_event, data = {}) => {
    try {
      const session = authService.requireAuth();
      if (!session) return fail('Chưa đăng nhập');
      return await planService.create(data, session.userId);
    } catch (err) {
      return fail(err.message);
    }
  });

  ipcMain.handle('plan:update', async (_event, { id, data } = {}) => {
    try {
      const session = authService.requireAuth();
      if (!session) return fail('Chưa đăng nhập');
      return await planService.update(id, data, session.userId);
    } catch (err) {
      return fail(err.message);
    }
  });

  ipcMain.handle('plan:approve', async (_event, { id } = {}) => {
    try {
      const session = authService.requireAuth();
      if (!session) return fail('Chưa đăng nhập');
      if (!['admin', 'commander'].includes(session.roleCode)) {
        return fail('Không có quyền phê duyệt');
      }
      return await planService.approve(id, session.userId);
    } catch (err) {
      return fail(err.message);
    }
  });

  ipcMain.handle('plan:cancel', async (_event, { id } = {}) => {
    try {
      const session = authService.requireAuth();
      if (!session) return fail('Chưa đăng nhập');
      return await planService.cancel(id, session.userId);
    } catch (err) {
      return fail(err.message);
    }
  });

  ipcMain.handle('plan:delete', async (_event, { id } = {}) => {
    try {
      const session = authService.requireAuth();
      if (!session) return fail('Chưa đăng nhập');
      return await planService.remove(id, session.userId);
    } catch (err) {
      return fail(err.message);
    }
  });
}

module.exports = { register };
