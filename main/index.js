'use strict';

const { app, ipcMain } = require('electron');
const path = require('path');


// Load env
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const logger = require('./utils/logger');
const { initDatabase, closeDatabase } = require('./database/index');
const { createMainWindow } = require('./window-manager');
const registerAllIpcHandlers = require('./ipc/index');

// Đơn instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;

app.whenReady().then(async () => {
  logger.info('[App] Khởi động ứng dụng QLQT Bảo Dưỡng Xe Máy...');

  try {
    await initDatabase();
    logger.info('[App] Database đã sẵn sàng');
  } catch (err) {
    logger.error('[App] Lỗi khởi tạo database:', err);
    app.quit();
    return;
  }

  registerAllIpcHandlers();
  logger.info('[App] IPC handlers đã đăng ký');

  mainWindow = createMainWindow();

  app.on('activate', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      mainWindow = createMainWindow();
    }
  });
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async (e) => {
  e.preventDefault();
  await closeDatabase();
  logger.info('[App] Ứng dụng đã đóng');
  app.exit(0);
});

process.on('uncaughtException', (err) => {
  logger.error('[App] Lỗi không xử lý được:', err);
});

process.on('unhandledRejection', (reason) => {
  logger.error('[App] Promise rejection không xử lý:', reason);
});
