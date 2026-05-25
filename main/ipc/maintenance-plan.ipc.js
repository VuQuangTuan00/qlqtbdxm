'use strict';

const { ipcMain } = require('electron');
const planService = require('../services/maintenance-plan.service');
const authService = require('../services/auth.service');
const { fail } = require('../utils/response');
const logger = require('../utils/logger');

function register() {
  ipcMain.handle('plan:list', async (_event, opts = {}) => {
    logger.ipc('plan:list', opts);
    return planService.list(opts);
  });

  ipcMain.handle('plan:get', async (_event, { id } = {}) => {
    return planService.get(id);
  });

  ipcMain.handle('plan:getSteps', async (_event, { maintenanceType } = {}) => {
    return planService.getSteps(maintenanceType);
  });

  ipcMain.handle('plan:create', async (_event, data = {}) => {
    const session = authService.requireAuth();
    if (!session) return fail('Chưa đăng nhập');
    return planService.create(data, session.userId);
  });

  ipcMain.handle('plan:update', async (_event, { id, data } = {}) => {
    const session = authService.requireAuth();
    if (!session) return fail('Chưa đăng nhập');
    return planService.update(id, data, session.userId);
  });

  ipcMain.handle('plan:approve', async (_event, { id } = {}) => {
    const session = authService.requireAuth();
    if (!session) return fail('Chưa đăng nhập');
    if (!['admin', 'commander'].includes(session.roleCode)) {
      return fail('Không có quyền phê duyệt');
    }
    return planService.approve(id, session.userId);
  });

  ipcMain.handle('plan:cancel', async (_event, { id } = {}) => {
    const session = authService.requireAuth();
    if (!session) return fail('Chưa đăng nhập');
    return planService.cancel(id, session.userId);
  });

  ipcMain.handle('plan:delete', async (_event, { id } = {}) => {
    const session = authService.requireAuth();
    if (!session) return fail('Chưa đăng nhập');
    return planService.remove(id, session.userId);
  });
}

module.exports = { register };
