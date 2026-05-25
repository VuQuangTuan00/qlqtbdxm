'use strict';

const log = require('electron-log');
const path = require('path');
const { app } = require('electron');

// Cấu hình electron-log
log.transports.file.level = process.env.LOG_LEVEL || 'info';
log.transports.console.level = process.env.NODE_ENV === 'development' ? 'debug' : 'warn';

// Đặt tên file log
log.transports.file.fileName = 'qlqtbdxm.log';

// Format log
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
log.transports.console.format = '[{h}:{i}:{s}] [{level}] {text}';

const logger = {
  error: (...args) => log.error(...args),
  warn: (...args) => log.warn(...args),
  info: (...args) => log.info(...args),
  debug: (...args) => log.debug(...args),
  verbose: (...args) => log.verbose(...args),

  /**
   * Log IPC call
   * @param {string} channel - Tên kênh IPC
   * @param {*} args - Đối số
   */
  ipc: (channel, args) => {
    log.debug(`[IPC] ${channel}`, args !== undefined ? JSON.stringify(args).slice(0, 200) : '');
  },

  /**
   * Log DB query
   * @param {string} sql - Câu lệnh SQL
   */
  db: (sql) => {
    log.debug(`[DB] ${sql.slice(0, 300)}`);
  },
};

module.exports = logger;
