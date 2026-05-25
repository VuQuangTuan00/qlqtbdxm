'use strict';

const { ipcMain } = require('electron');
const unitService = require('../services/unit.service');
const authService = require('../services/auth.service');
const { fail } = require('../utils/response');
const logger = require('../utils/logger');

function register() {
  ipcMain.handle('unit:list', async (_event, opts = {}) => {
    try {
      logger.ipc('unit:list', opts);
      return await unitService.list(opts);
    } catch (err) {
      return fail(err.message);
    }
  });

  ipcMain.handle('unit:get', async (_event, { id } = {}) => {
    try {
      return await unitService.get(id);
    } catch (err) {
      return fail(err.message);
    }
  });

  ipcMain.handle('unit:tree', async () => {
    try {
      return await unitService.getTree();
    } catch (err) {
      return fail(err.message);
    }
  });

  ipcMain.handle('unit:create', async (_event, data = {}) => {
    try {
      const session = authService.requireAuth();
      if (!session) return fail('Chưa đăng nhập');
      return await unitService.create(data);
    } catch (err) {
      return fail(err.message);
    }
  });

  ipcMain.handle('unit:update', async (_event, { id, data } = {}) => {
    try {
      const session = authService.requireAuth();
      if (!session) return fail('Chưa đăng nhập');
      return await unitService.update(id, data);
    } catch (err) {
      return fail(err.message);
    }
  });

  ipcMain.handle('unit:delete', async (_event, { id } = {}) => {
    try {
      const session = authService.requireAuth();
      if (!session) return fail('Chưa đăng nhập');
      return await unitService.remove(id);
    } catch (err) {
      return fail(err.message);
    }
  });
}

module.exports = { register };
