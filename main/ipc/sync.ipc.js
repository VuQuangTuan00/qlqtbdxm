'use strict';

const { ipcMain } = require('electron');
const { syncFromSqlServer } = require('../services/sync.service');
const response = require('../utils/response');
const logger   = require('../utils/logger');

function register() {
  ipcMain.handle('sync:fromSqlServer', async (_event, mssqlConfig) => {
    try {
      logger.info('[Sync] Bắt đầu đồng bộ SQL Server → SQLite...');
      const { stats } = await syncFromSqlServer(mssqlConfig);
      const total = Object.values(stats).reduce((a, b) => a + b, 0);
      logger.info(`[Sync] Hoàn tất: ${total} bản ghi từ ${Object.keys(stats).length} bảng`);
      return response.ok(stats, `Đồng bộ thành công — ${total} bản ghi`);
    } catch (err) {
      logger.error('[Sync] Lỗi:', err);
      return response.fail(err.message);
    }
  });
}

module.exports = { register };
