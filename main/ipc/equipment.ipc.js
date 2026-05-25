'use strict';

const { ipcMain } = require('electron');
const equipmentService = require('../services/equipment.service');
const authService = require('../services/auth.service');
const { fail } = require('../utils/response');
const logger = require('../utils/logger');

function register() {
  ipcMain.handle('equipment:list', async (_event, opts = {}) => {
    try {
      logger.ipc('equipment:list', opts);
      return await equipmentService.list(opts);
    } catch (err) {
      return fail(err.message);
    }
  });

  ipcMain.handle('equipment:get', async (_event, { id } = {}) => {
    try {
      return await equipmentService.get(id);
    } catch (err) {
      return fail(err.message);
    }
  });

  ipcMain.handle('equipment:search', async (_event, opts = {}) => {
    try {
      return await equipmentService.search(opts);
    } catch (err) {
      return fail(err.message);
    }
  });

  ipcMain.handle('equipment:create', async (_event, data = {}) => {
    try {
      const session = authService.requireAuth();
      if (!session) return fail('Chưa đăng nhập');
      return await equipmentService.create(data, session.userId);
    } catch (err) {
      return fail(err.message);
    }
  });

  ipcMain.handle('equipment:update', async (_event, { id, data } = {}) => {
    try {
      const session = authService.requireAuth();
      if (!session) return fail('Chưa đăng nhập');
      return await equipmentService.update(id, data, session.userId);
    } catch (err) {
      return fail(err.message);
    }
  });

  ipcMain.handle('equipment:delete', async (_event, { id } = {}) => {
    try {
      const session = authService.requireAuth();
      if (!session) return fail('Chưa đăng nhập');
      return await equipmentService.remove(id, session.userId);
    } catch (err) {
      return fail(err.message);
    }
  });

  ipcMain.handle('equipment:getByQr', async (_event, { qrValue } = {}) => {
    try {
      return await equipmentService.getByQr(qrValue);
    } catch (err) {
      return fail(err.message);
    }
  });
}

module.exports = { register };
