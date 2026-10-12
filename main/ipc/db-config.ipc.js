'use strict';

const { ipcMain, app } = require('electron');
const sql  = require('mssql');
const path = require('path');
const fs   = require('fs');
const { getDbConfig } = require('../database');
const response = require('../utils/response');
const logger   = require('../utils/logger');

function register() {
  // Lấy config hiện tại (ẩn password)
  ipcMain.handle('dbconfig:get', async () => {
    try {
      const config = getDbConfig();
      return response.ok({
        server:   config.server || config.host || '',
        port:     config.port,
        database: config.database,
        user:     config.user,
        password: '',
      });
    } catch (err) {
      logger.error('[DBConfig] Lỗi đọc config:', err);
      return response.fail(err.message);
    }
  });

  // Lưu config mới và restart app
  ipcMain.handle('dbconfig:set', async (_event, config) => {
    try {
      const configPath = path.join(app.getPath('userData'), 'db-config.json');
      // Giữ lại password cũ nếu request không gửi password mới
      if (!config.password && fs.existsSync(configPath)) {
        try {
          const existing = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
          if (existing.password) config = { ...config, password: existing.password };
        } catch (_) {}
      }
      // Luôn lưu với mode sqlserver
      fs.writeFileSync(configPath, JSON.stringify({ mode: 'sqlserver', ...config }, null, 2), 'utf-8');
      logger.info(`[DBConfig] Đã lưu config vào ${configPath}`);
      setTimeout(() => {
        app.relaunch();
        app.exit(0);
      }, 500);
      return response.ok({ message: 'Đã lưu, đang khởi động lại ứng dụng...' });
    } catch (err) {
      logger.error('[DBConfig] Lỗi lưu config:', err);
      return response.fail(err.message);
    }
  });

  // Kiểm tra kết nối SQL Server với config được truyền vào
  ipcMain.handle('dbconfig:test', async (_event, config) => {
    const start = Date.now();
    let pool;
    try {
      pool = await sql.connect({
        server:   config.server || config.host || 'localhost',
        port:     parseInt(config.port) || 1433,
        database: config.database,
        user:     config.user,
        password: config.password,
        options: {
          encrypt:                true,
          trustServerCertificate: true,
          enableArithAbort:       true,
        },
        pool:              { max: 1, min: 0 },
        connectionTimeout: 15000,
        requestTimeout:    15000,
      });

      const { recordset } = await pool.request()
        .query('SELECT @@VERSION AS version, @@SERVERNAME AS server_name');
      await pool.close();

      const latency  = Date.now() - start;
      const fullVer  = recordset[0]?.version || '';
      const shortVer = fullVer.split('\n')[0].trim() || 'SQL Server';

      logger.info(`[DBConfig] Test kết nối thành công: ${config.server}:${config.port} (${latency}ms)`);
      return response.ok({
        message: `Kết nối thành công! ${shortVer}`,
        latency,
      });
    } catch (err) {
      try { if (pool) await pool.close(); } catch (_) {}
      logger.warn(`[DBConfig] Test kết nối thất bại: ${err.message}`);
      return response.fail(`Kết nối thất bại: ${err.message}`);
    }
  });
}

module.exports = { register };
