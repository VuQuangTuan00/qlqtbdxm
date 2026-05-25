'use strict';

const { ipcMain } = require('electron');
const acceptanceService = require('../services/acceptance.service');
const authService = require('../services/auth.service');
const { fail } = require('../utils/response');

function register() {
  ipcMain.handle('acceptance:get', async (_event, { planId } = {}) => {
    if (!planId) return fail('Thiếu planId');
    return acceptanceService.get(planId);
  });

  ipcMain.handle('acceptance:create', async (_event, data = {}) => {
    const session = authService.requireAuth();
    if (!session) return fail('Chưa đăng nhập');
    if (!['admin', 'commander', 'inspector'].includes(session.roleCode)) {
      return fail('Không có quyền nghiệm thu');
    }
    return acceptanceService.create(data, session.userId);
  });

  ipcMain.handle('acceptance:update', async (_event, { id, data } = {}) => {
    const session = authService.requireAuth();
    if (!session) return fail('Chưa đăng nhập');
    return acceptanceService.update(id, data, session.userId);
  });
}

module.exports = { register };
