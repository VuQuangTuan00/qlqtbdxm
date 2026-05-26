'use strict';

const { ipcMain } = require('electron');
const acceptanceService = require('../services/acceptance.service');
const authService = require('../services/auth.service');
const { fail } = require('../utils/response');

function register() {
  ipcMain.handle('acceptance:get', async (_event, { planId } = {}) => {
    try {
      if (!planId) return fail('Thiếu planId');
      return await acceptanceService.get(planId);
    } catch (err) {
      return fail(err.message);
    }
  });

  ipcMain.handle('acceptance:create', async (_event, data = {}) => {
    try {
      const session = authService.requireAuth();
      if (!session) return fail('Chưa đăng nhập');
      if (!['admin', 'commander', 'inspector'].includes(session.roleCode)) {
        return fail('Không có quyền nghiệm thu');
      }
      return await acceptanceService.create(data, session.userId);
    } catch (err) {
      return fail(err.message);
    }
  });

  ipcMain.handle('acceptance:update', async (_event, { id, data } = {}) => {
    try {
      const session = authService.requireAuth();
      if (!session) return fail('Chưa đăng nhập');
      return await acceptanceService.update(id, data, session.userId);
    } catch (err) {
      return fail(err.message);
    }
  });
}

module.exports = { register };
