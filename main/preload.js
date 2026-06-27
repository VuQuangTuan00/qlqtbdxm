'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * Danh sách các kênh IPC được phép invoke (renderer → main)
 */
const ALLOWED_INVOKE_CHANNELS = [
  // Auth
  'auth:login',
  'auth:logout',
  'auth:getSession',
  'auth:changePassword',

  // Units
  'unit:list',
  'unit:get',
  'unit:create',
  'unit:update',
  'unit:delete',
  'unit:tree',

  // Equipment
  'equipment:list',
  'equipment:get',
  'equipment:create',
  'equipment:update',
  'equipment:delete',
  'equipment:search',
  'equipment:getByQr',

  // Maintenance Plans
  'plan:list',
  'plan:get',
  'plan:create',
  'plan:update',
  'plan:delete',
  'plan:approve',
  'plan:cancel',
  'plan:getSteps',

  // Maintenance Logs
  'log:list',
  'log:get',
  'log:create',
  'log:update',
  'log:updateStatus',

  // Acceptance
  'acceptance:get',
  'acceptance:create',
  'acceptance:update',

  // Reports
  'report:summary',
  'report:equipmentStatus',
  'report:maintenanceByPeriod',
  'report:overdueEquipment',

  // Users (admin)
  'user:list',
  'user:create',
  'user:update',
  'user:toggleActive',

  // Roles
  'role:list',

  // DB Config (admin only)
  'dbconfig:get',
  'dbconfig:set',
  'dbconfig:test',
  'dbconfig:getMode',

  // Sync
  'sync:fromPostgres',

  // Vehicle & Engine Maintenance (kiến trúc mới)
  'vehicle:list',
  'vehicle:get',
  'vehicle:create',
  'vehicle:update',
  'vehicle:delete',
  'engineMaintenance:list',
  'engineMaintenance:create',
  'engineMaintenance:update',
  'engineMaintenance:delete',
  'engineMaintenance:reorder',
  'engineMaintenance:uploadFile',
  'engineMaintenance:deleteFile',
  'engineMaintenance:readFile',

  // Vehicle Type
  'vehicleType:list',
  'vehicleType:create',
  'vehicleType:update',
  'vehicleType:delete',
];

/**
 * Danh sách các kênh IPC được phép subscribe (main → renderer)
 */
const ALLOWED_ON_CHANNELS = [
  'app:notification',
  'app:updateAvailable',
  'app:db-setup',
  'app:first-run',
];

/**
 * Expose API an toàn qua contextBridge
 */
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Gọi IPC handler trong main process
   * @param {string} channel
   * @param {...any} args
   * @returns {Promise<any>}
   */
  invoke: (channel, ...args) => {
    if (!ALLOWED_INVOKE_CHANNELS.includes(channel)) {
      return Promise.reject(new Error(`Kênh IPC không được phép: ${channel}`));
    }
    return ipcRenderer.invoke(channel, ...args);
  },

  /**
   * Lắng nghe sự kiện từ main process
   * @param {string} channel
   * @param {Function} callback
   */
  on: (channel, callback) => {
    if (!ALLOWED_ON_CHANNELS.includes(channel)) return;
    ipcRenderer.on(channel, (_event, ...args) => callback(...args));
  },

  /**
   * Hủy lắng nghe sự kiện
   * @param {string} channel
   * @param {Function} callback
   */
  off: (channel, callback) => {
    ipcRenderer.removeListener(channel, callback);
  },

  /**
   * Thông tin môi trường (an toàn)
   */
  env: {
    platform: process.platform,
    version: process.versions.electron,
  },
});
