'use strict';

const { app, dialog } = require('electron');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const logger = require('./utils/logger');
const { initDatabase, closeDatabase, getDb } = require('./database/index');
const { createMainWindow } = require('./window-manager');
const registerAllIpcHandlers = require('./ipc/index');

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
    logger.info('[App] SQLite đã sẵn sàng');
    registerAllIpcHandlers();
    logger.info('[App] IPC handlers đã đăng ký');
    const { rows } = await getDb().query('SELECT COUNT(*) AS total FROM users');
    const needsBootstrap = Number(rows[0].total) === 0;
    mainWindow = createMainWindow();
    if (needsBootstrap) {
      mainWindow.webContents.once('did-finish-load', () => {
        mainWindow.webContents.send('app:first-run', {});
      });
    }
  } catch (err) {
    logger.error('[App] Lỗi khởi tạo SQLite:', err);
    dialog.showErrorBox(
      'Không thể mở cơ sở dữ liệu',
      `Ứng dụng không thể khởi tạo SQLite và chưa thay đổi dữ liệu hiện có.\n\n${err.message}`
    );
    app.quit();
    return;
  }

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
