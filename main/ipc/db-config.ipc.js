'use strict';

const { ipcMain, app } = require('electron');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
const { getDbConfig } = require('../database');
const response = require('../utils/response');
const logger = require('../utils/logger');

function register() {
  // Lấy config hiện tại (ẩn password)
  ipcMain.handle('dbconfig:get', async () => {
    try {
      const config = getDbConfig();
      return response.success({
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.user,
        password: '',
      });
    } catch (err) {
      logger.error('[DBConfig] Lỗi đọc config:', err);
      return response.error(err.message);
    }
  });

  // Lưu config mới và restart app
  ipcMain.handle('dbconfig:set', async (_event, config) => {
    try {
      const configPath = path.join(app.getPath('userData'), 'db-config.json');
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
      logger.info(`[DBConfig] Đã lưu config vào ${configPath}`);
      setTimeout(() => {
        app.relaunch();
        app.exit(0);
      }, 500);
      return response.success({ message: 'Đã lưu, đang khởi động lại ứng dụng...' });
    } catch (err) {
      logger.error('[DBConfig] Lỗi lưu config:', err);
      return response.error(err.message);
    }
  });

  // Kiểm tra kết nối với config được truyền vào
  ipcMain.handle('dbconfig:test', async (_event, config) => {
    const start = Date.now();
    const testPool = new Pool({
      host: config.host,
      port: parseInt(config.port) || 5432,
      database: config.database,
      user: config.user,
      password: config.password,
      max: 1,
      connectionTimeoutMillis: 5000,
    });

    try {
      const client = await testPool.connect();
      const { rows } = await client.query('SELECT version()');
      client.release();
      await testPool.end();
      const latency = Date.now() - start;
      const version = rows[0]?.version?.split(' ').slice(0, 2).join(' ') || 'PostgreSQL';
      logger.info(`[DBConfig] Test kết nối thành công: ${config.host}:${config.port} (${latency}ms)`);
      return response.success({
        message: `Kết nối thành công! ${version}`,
        latency,
      });
    } catch (err) {
      try { await testPool.end(); } catch (_) {}
      logger.warn(`[DBConfig] Test kết nối thất bại: ${err.message}`);
      return response.error(`Kết nối thất bại: ${err.message}`);
    }
  });
}

module.exports = { register };
