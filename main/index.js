'use strict';

const { app } = require('electron');

const logger = require('./utils/logger');
const { initDatabase, closeDatabase } = require('./database/index');
const { readDbConfig, readDbConfigForRecovery } = require('./config/db-config');
const { resolveDatabaseStartup } = require('./startup/database-startup');
const { createMainWindow } = require('./window-manager');
const registerAllIpcHandlers = require('./ipc/index');
const { processPendingCleanup } = require('./services/pending-file-cleanup.service');

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;

app.whenReady().then(async () => {
  logger.info('[App] Khởi động ứng dụng Quy trình công nghệ và định mức kinh tế - kỹ thuật...');

  const cleanupResult = processPendingCleanup();
  if (cleanupResult.deleted || cleanupResult.remaining) {
    logger.info(
      `[App] Dọn file tồn đọng: đã xóa ${cleanupResult.deleted}, còn lại ${cleanupResult.remaining}`
    );
  }

  const dbConfigIpc = require('./ipc/db-config.ipc');
  const startup = await resolveDatabaseStartup({
    readDbConfig,
    readDbConfigForRecovery,
    initDatabase,
  });

  // Handler phải tồn tại trước khi renderer setup chạy; ngoài setup/recovery chỉ admin được gọi.
  dbConfigIpc.register({ setupMode: startup.mode !== 'ready' });

  if (startup.mode === 'first-run') {
    logger.info('[App] Lần đầu khởi chạy — hiển thị màn hình nhập kết nối SQL Server');
    mainWindow = createMainWindow();
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.send('app:db-setup', {
        mode: 'first-run',
        error: '',
        config: {},
      });
    });
  } else {
    if (startup.mode === 'ready') {
      logger.info('[App] Database đã sẵn sàng');
    } else {
      logger.error('[App] Lỗi khởi tạo database:', startup.error);
      dbConfigIpc.setSetupMode(true);
    }

    // Luôn đăng ký handlers dù DB có lỗi hay không,
    // tránh "No handler registered" khi renderer gọi IPC trong lúc overlay hiển thị
    registerAllIpcHandlers();
    logger.info('[App] IPC handlers đã đăng ký');

    mainWindow = createMainWindow();

    if (startup.mode === 'recovery') {
      mainWindow.webContents.once('did-finish-load', () => {
        mainWindow.webContents.send('app:db-setup', {
          mode: 'recovery',
          error: startup.error,
          config: startup.config,
        });
      });
    }
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
