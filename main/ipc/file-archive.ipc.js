'use strict';

const { ipcMain, dialog, BrowserWindow, app } = require('electron');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const authService = require('../services/auth.service');
const archiveService = require('../services/file-archive.service');
const { processPendingCleanup } = require('../services/pending-file-cleanup.service');
const fileStorage = require('../services/file-storage.service');
const {
  backupMssqlDatabase,
  restoreMssqlDatabase,
  getMssqlBackupDirectory,
  getDbConfig,
} = require('../database');
const { ok, fail } = require('../utils/response');
const logger = require('../utils/logger');

function getAccessError() {
  if (!authService.requireAuth()) return 'Chưa đăng nhập';
  if (!authService.requireAdmin()) return 'Chỉ admin mới được xuất hoặc nhập file backup';
  return null;
}

async function chooseTransferPackage(event, title) {
  return dialog.showOpenDialog(
    BrowserWindow.fromWebContents(event.sender) || undefined,
    {
      title,
      properties: ['openFile'],
      filters: [{ name: 'ZIP archive', extensions: ['zip'] }],
    }
  );
}

function register() {
  ipcMain.handle('fileArchive:export', async (event) => {
    const denied = getAccessError();
    if (denied) return fail(denied);

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const { canceled, filePath } = await dialog.showSaveDialog(
        BrowserWindow.fromWebContents(event.sender) || undefined,
        {
          title: 'Sao lưu',
          defaultPath: path.join(app.getPath('documents'), `backup-${timestamp}.zip`),
          filters: [{ name: 'ZIP archive', extensions: ['zip'] }],
        }
      );
      if (canceled || !filePath) return ok({ canceled: true });

      const cleanupResult = processPendingCleanup();
      if (cleanupResult.deleted || cleanupResult.remaining) {
        logger.info(
          `[FileArchive] Dọn file tồn đọng trước backup: đã xóa ${cleanupResult.deleted}, còn lại ${cleanupResult.remaining}`
        );
      }

      const storageRoot = fileStorage.getStorageRoot();
      fileStorage.testReadWriteAccess(storageRoot);

      const config = getDbConfig();
      const safeDatabase = String(config.database || 'database').replace(/[<>:"/\\|?*]/g, '_');
      const backupDirectory = await getMssqlBackupDirectory();
      const databaseBackupPath = path.join(
        backupDirectory,
        `${safeDatabase}-${Date.now()}-${randomUUID().slice(0, 8)}.bak`
      );
      try {
        await backupMssqlDatabase(databaseBackupPath);
        const savedPath = await archiveService.exportTransferPackage(
          filePath,
          databaseBackupPath,
          config.database
        );
        logger.info(`[FileArchive] Transfer package exported: ${savedPath}`);
        return ok({ path: savedPath }, 'Đã sao lưu gồm database và file');
      } finally {
        try {
          fs.rmSync(databaseBackupPath, { force: true });
        } catch (cleanupError) {
          logger.warn(`[FileArchive] Không xóa được .bak tạm '${databaseBackupPath}': ${cleanupError.message}`);
        }
      }
    } catch (err) {
      logger.error('[FileArchive] Transfer export failed:', err);
      (err.precedingErrors || []).forEach(e => console.error(' ->', e.message))
      return fail(`Không thể sao lưu. Kiểm tra quyền kho file dùng chung, quyền BACKUP DATABASE và quyền ghi của dịch vụ SQL Server vào thư mục backup. Chi tiết: ${err.message}`);
    }
  });

  ipcMain.handle('fileArchive:restoreFiles', async (event) => {
    const denied = getAccessError();
    if (denied) return fail(denied);

    try {
      const { canceled, filePaths } = await chooseTransferPackage(event, 'Chọn ZIP để khôi phục file');
      if (canceled || !filePaths.length) return ok({ canceled: true });

      await archiveService.restoreFilesFromTransferPackage(filePaths[0]);
      logger.info(`[FileArchive] Files restored from transfer package: ${filePaths[0]}`);
      return ok({ path: filePaths[0] }, 'Đã khôi phục hình ảnh và tài liệu');
    } catch (err) {
      logger.error('[FileArchive] File restore failed:', err);
      return fail(`Không thể khôi phục file. Chi tiết: ${err.message}`);
    }
  });

  ipcMain.handle('fileArchive:restoreDatabase', async (event) => {
    const denied = getAccessError();
    if (denied) return fail(denied);

    let extractedBackupPath = '';
    try {
      const { canceled, filePaths } = await chooseTransferPackage(event, 'Chọn ZIP để khôi phục database');
      if (canceled || !filePaths.length) return ok({ canceled: true });

      const config = getDbConfig();
      const safeDatabase = String(config.database || 'database').replace(/[<>:"/\\|?*]/g, '_');
      const backupDirectory = await getMssqlBackupDirectory();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const uniqueSuffix = `${timestamp}-${randomUUID().slice(0, 8)}`;
      extractedBackupPath = path.join(
        backupDirectory,
        `.${safeDatabase}-restore-incoming-${uniqueSuffix}.bak`
      );
      const safetyBackupPath = path.join(
        backupDirectory,
        `${safeDatabase}-safety-before-restore-${uniqueSuffix}.bak`
      );

      await archiveService.extractDatabaseBackupFromTransferPackage(
        filePaths[0],
        extractedBackupPath,
      );
      const restoreResult = await restoreMssqlDatabase(extractedBackupPath, safetyBackupPath);
      logger.info(`[FileArchive] Database restored from transfer package: ${filePaths[0]}`);

      const restartTimer = setTimeout(() => {
        app.relaunch();
        app.exit(0);
      }, 500);
      restartTimer.unref?.();

      return ok({
        path: filePaths[0],
        safetyBackupPath: restoreResult.safetyBackupPath,
        restarting: true,
      }, 'Đã khôi phục database. Ứng dụng sẽ khởi động lại');
    } catch (err) {
      logger.error('[FileArchive] Database restore failed:', err);
      return fail(`Không thể khôi phục database. Chi tiết: ${err.message}`);
    } finally {
      if (extractedBackupPath) {
        try { fs.rmSync(extractedBackupPath, { force: true }); }
        catch (cleanupError) {
          logger.warn(`[FileArchive] Không xóa được .bak tạm '${extractedBackupPath}': ${cleanupError.message}`);
        }
      }
    }
  });
}

module.exports = { register };
