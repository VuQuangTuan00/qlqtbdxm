'use strict';

const { ipcMain } = require('electron');
const authService = require('../services/auth.service');
const reportService = require('../services/report.service');
const { fail } = require('../utils/response');

function withAuthentication(handler) {
  return async (_event, payload) => {
    if (!authService.requireAuth()) return fail('Chưa đăng nhập');
    return handler(payload);
  };
}

function register() {
  ipcMain.handle('report:summary', withAuthentication(() => reportService.summary()));
  ipcMain.handle('report:equipmentStatus', withAuthentication(() => reportService.equipmentStatus()));
  ipcMain.handle('report:maintenanceByPeriod', withAuthentication((payload) => reportService.maintenanceByPeriod(payload)));
  ipcMain.handle('report:overdueEquipment', withAuthentication(() => reportService.overdueEquipment()));
}

module.exports = { register };
