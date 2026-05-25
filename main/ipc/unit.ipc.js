'use strict';

const { ipcMain } = require('electron');
const unitService = require('../services/unit.service');
const authService = require('../services/auth.service');
const { fail } = require('../utils/response');
const logger = require('../utils/logger');

function register() {
  ipcMain.handle('unit:list', async (_event, opts = {}) => {
    logger.ipc('unit:list', opts);
    return unitService.list(opts);
  });

  ipcMain.handle('unit:get', async (_event, { id } = {}) => {
    return unitService.get(id);
  });

  ipcMain.handle('unit:tree', async () => {
    return unitService.getTree();
  });

  ipcMain.handle('unit:create', async (_event, data = {}) => {
    const session = authService.requireAuth();
    if (!session) return fail('Chưa đăng nhập');
    return unitService.create(data);
  });

  ipcMain.handle('unit:update', async (_event, { id, data } = {}) => {
    const session = authService.requireAuth();
    if (!session) return fail('Chưa đăng nhập');
    return unitService.update(id, data);
  });

  ipcMain.handle('unit:delete', async (_event, { id } = {}) => {
    const session = authService.requireAuth();
    if (!session) return fail('Chưa đăng nhập');
    return unitService.remove(id);
  });
}

module.exports = { register };
