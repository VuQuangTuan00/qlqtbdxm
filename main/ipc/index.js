'use strict';

const logger = require('../utils/logger');

/**
 * Đăng ký tất cả IPC handlers
 */
function registerAllIpcHandlers() {
  const modules = [
    require('./auth.ipc'),
    require('./unit.ipc'),
    require('./equipment.ipc'),
    require('./maintenance-plan.ipc'),
    require('./maintenance-log.ipc'),
    require('./acceptance.ipc'),
    require('./report.ipc'),
    require('./db-config.ipc'),
    require('./vehicle-type.ipc'),
  ];

  for (const mod of modules) {
    mod.register();
  }

  logger.info('[IPC] Đã đăng ký tất cả handlers');
}

module.exports = registerAllIpcHandlers;
