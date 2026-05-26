'use strict';

const { ipcMain } = require('electron');
const logService = require('../services/maintenance-log.service');
const authService = require('../services/auth.service');
const { fail } = require('../utils/response');

function register() {
  ipcMain.handle('log:list', async (_event, { planId } = {}) => {
    try {
      if (!planId) return fail('Thiếu planId');
      return await logService.list(planId);
    } catch (err) {
      return fail(err.message);
    }
  });

  ipcMain.handle('log:get', async (_event, { id } = {}) => {
    try {
      return await logService.get(id);
    } catch (err) {
      return fail(err.message);
    }
  });

  ipcMain.handle('log:create', async (_event, data = {}) => {
    try {
      const session = authService.requireAuth();
      if (!session) return fail('Chưa đăng nhập');
      return await logService.create(data, session.userId);
    } catch (err) {
      return fail(err.message);
    }
  });

  ipcMain.handle('log:update', async (_event, { id, data } = {}) => {
    try {
      const session = authService.requireAuth();
      if (!session) return fail('Chưa đăng nhập');
      return await logService.update(id, data, session.userId);
    } catch (err) {
      return fail(err.message);
    }
  });

  ipcMain.handle('log:updateStatus', async (_event, { id, status, extra } = {}) => {
    try {
      const session = authService.requireAuth();
      if (!session) return fail('Chưa đăng nhập');
      return await logService.updateStatus(id, status, extra || {}, session.userId);
    } catch (err) {
      return fail(err.message);
    }
  });
}

module.exports = { register };
