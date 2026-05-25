'use strict';

const { ipcMain } = require('electron');
const equipmentService = require('../services/equipment.service');
const authService = require('../services/auth.service');
const { fail } = require('../utils/response');
const logger = require('../utils/logger');

function register() {
  ipcMain.handle('equipment:list', async (_event, opts = {}) => {
    logger.ipc('equipment:list', opts);
    return equipmentService.list(opts);
  });

  ipcMain.handle('equipment:get', async (_event, { id } = {}) => {
    return equipmentService.get(id);
  });

  ipcMain.handle('equipment:search', async (_event, opts = {}) => {
    return equipmentService.search(opts);
  });

  ipcMain.handle('equipment:create', async (_event, data = {}) => {
    const session = authService.requireAuth();
    if (!session) return fail('Chưa đăng nhập');
    return equipmentService.create(data, session.userId);
  });

  ipcMain.handle('equipment:update', async (_event, { id, data } = {}) => {
    const session = authService.requireAuth();
    if (!session) return fail('Chưa đăng nhập');
    return equipmentService.update(id, data, session.userId);
  });

  ipcMain.handle('equipment:delete', async (_event, { id } = {}) => {
    const session = authService.requireAuth();
    if (!session) return fail('Chưa đăng nhập');
    return equipmentService.remove(id, session.userId);
  });

  ipcMain.handle('equipment:getByQr', async (_event, { qrValue } = {}) => {
    return equipmentService.getByQr(qrValue);
  });
}

module.exports = { register };
