'use strict';

const { ipcMain } = require('electron');
const logService = require('../services/maintenance-log.service');
const authService = require('../services/auth.service');
const { fail } = require('../utils/response');

function register() {
  ipcMain.handle('log:list', async (_event, { planId } = {}) => {
    if (!planId) return fail('Thiếu planId');
    return logService.list(planId);
  });

  ipcMain.handle('log:get', async (_event, { id } = {}) => {
    return logService.get(id);
  });

  ipcMain.handle('log:create', async (_event, data = {}) => {
    const session = authService.requireAuth();
    if (!session) return fail('Chưa đăng nhập');
    return logService.create(data, session.userId);
  });

  ipcMain.handle('log:update', async (_event, { id, data } = {}) => {
    const session = authService.requireAuth();
    if (!session) return fail('Chưa đăng nhập');
    return logService.update(id, data, session.userId);
  });

  ipcMain.handle('log:updateStatus', async (_event, { id, status, extra } = {}) => {
    const session = authService.requireAuth();
    if (!session) return fail('Chưa đăng nhập');
    return logService.updateStatus(id, status, extra || {}, session.userId);
  });
}

module.exports = { register };
