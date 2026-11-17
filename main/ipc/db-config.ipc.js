'use strict';

const { ipcMain, app } = require('electron');
const sql  = require('mssql');
const {
  readDbConfig,
  readDbConfigForRecovery,
  writeDbConfig,
  validateDbConfig,
} = require('../config/db-config');
const { buildMssqlConnectionOptions } = require('../database/mssql');
const authService = require('../services/auth.service');
const response = require('../utils/response');
const logger   = require('../utils/logger');

let _setupMode = false;

const ALLOWED = ['server', 'port', 'database', 'user', 'password', 'instanceName'];

function _pick(config) {
  const out = {};
  for (const key of ALLOWED) {
    if (config && config[key] !== undefined) out[key] = config[key];
  }
  return out;
}

function _withStoredPassword(config) {
  if (!config || config.password) return config;

  let stored;
  try {
    // Chỉ Main process được đọc bản runtime đã giải mã. Recovery config luôn bị lọc bí mật.
    stored = readDbConfig();
  } catch (_) {
    return config;
  }
  if (!stored || !stored.password) return config;

  const norm = (value) => String(value ?? '').trim().toLowerCase();
  const sameEndpoint = ['server', 'port', 'user', 'instanceName']
    .every((key) => norm(stored[key]) === norm(config[key]));
  return sameEndpoint ? { ...config, password: stored.password } : config;
}

function setSetupMode(enabled) {
  _setupMode = enabled === true;
}

function _authorize() {
  if (_setupMode || authService.requireAdmin()) return null;
  return response.fail('Không có quyền cấu hình database');
}

function register({ setupMode = false } = {}) {
  setSetupMode(setupMode);

  // Lấy config hiện tại (ẩn password)
  ipcMain.handle('dbconfig:get', async () => {
    try {
      const denied = _authorize();
      if (denied) return denied;
      const config = (_setupMode ? readDbConfigForRecovery() : readDbConfig()) || {};
      return response.ok({
        server:   config.server || config.host || '',
        port:     config.port,
        database: config.database || '',
        user:     config.user || '',
        password: '',
        ...(config.instanceName ? { instanceName: config.instanceName } : {}),
      });
    } catch (err) {
      logger.error('[DBConfig] Lỗi đọc config:', err);
      return response.fail(err.message);
    }
  });

  // Lưu config mới và restart app
  ipcMain.handle('dbconfig:set', async (_event, config) => {
    try {
      const denied = _authorize();
      if (denied) return denied;
      const saved = writeDbConfig({ instanceName: null, ..._pick(config) });
      logger.info('[DBConfig] Đã lưu cấu hình SQL Server');
      setTimeout(() => {
        app.relaunch();
        app.exit(0);
      }, 500);
      return response.ok({ message: 'Đã lưu, đang khởi động lại ứng dụng...', config: {
        server: saved.server,
        port: saved.port,
        database: saved.database,
        user: saved.user,
        ...(saved.instanceName ? { instanceName: saved.instanceName } : {}),
      } });
    } catch (err) {
      logger.error('[DBConfig] Lỗi lưu config:', err);
      return response.fail(err.message);
    }
  });

  // Kiểm tra kết nối SQL Server với config được truyền vào
  ipcMain.handle('dbconfig:test', async (_event, config) => {
    const denied = _authorize();
    if (denied) return denied;
    const start = Date.now();
    let pool;
    try {
      const validated = validateDbConfig({
        ..._pick(_withStoredPassword(config || {})),
        mode: 'sqlserver',
      });
      const connectionOptions = buildMssqlConnectionOptions(validated);
      connectionOptions.pool = { max: 1, min: 0 };
      connectionOptions.requestTimeout = 5000;
      pool = new sql.ConnectionPool(connectionOptions);
      await pool.connect();

      const { recordset } = await pool.request()
        .query('SELECT @@VERSION AS version, @@SERVERNAME AS server_name');
      const latency  = Date.now() - start;
      const fullVer  = recordset[0]?.version || '';
      const shortVer = fullVer.split('\n')[0].trim() || 'SQL Server';

      const endpoint = connectionOptions.port !== undefined
        ? `${connectionOptions.server}:${connectionOptions.port}`
        : connectionOptions.options.instanceName
          ? `${connectionOptions.server}\\${connectionOptions.options.instanceName}`
          : connectionOptions.server;
      logger.info(`[DBConfig] Test kết nối thành công: ${endpoint} (${latency}ms)`);
      return response.ok({
        // message: `Kết nối thành công! ${shortVer}`,
        message: `Kết nối thành công!`,
        latency,
      });
    } catch (err) {
      logger.warn(`[DBConfig] Test kết nối thất bại: ${err.message}`);
      return response.fail(`Kết nối thất bại: ${err.message}`);
    } finally {
      try { if (pool) await pool.close(); } catch (_) {}
    }
  });
}

module.exports = { register, setSetupMode };
