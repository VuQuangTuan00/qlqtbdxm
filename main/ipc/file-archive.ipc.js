'use strict';

const { ipcMain, dialog, BrowserWindow, app } = require('electron');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const authService = require('../services/auth.service');
const archiveService = require('../services/file-archive.service');
const { backupMssqlDatabase, getDbConfig } = require('../database');
const { ok, fail } = require('../utils/response');
const logger = require('../utils/logger');

function getAccessError() {
  if (!authService.requireAuth()) return 'Chưa đăng nhập';
  if (!authService.requireAdmin()) return 'Chỉ admin mới được xuất hoặc nhập file backup';
  return null;
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
          title: 'Xuất bộ chuyển máy',
          defaultPath: path.join(app.getPath('documents'), `qlqtbdxm-transfer-${timestamp}.zip`),
          filters: [{ name: 'ZIP archive', extensions: ['zip'] }],
        }
      );
      if (canceled || !filePath) return ok({ canceled: true });

      const config = getDbConfig();
      const safeDatabase = String(config.database || 'database').replace(/[<>:"/\\|?*]/g, '_');
      const backupDirectory = process.env.SQLSERVER_BACKUP_DIR || 'C:\\Tools\\SQL Sever\\MSSQL16.MSSQLSERVER\\MSSQL\\Backup';
      if (!fs.existsSync(backupDirectory) || !fs.statSync(backupDirectory).isDirectory()) {
        throw new Error(`Không tìm thấy thư mục backup SQL Server: ${backupDirectory}. Có thể cấu hình SQLSERVER_BACKUP_DIR.`);
      }
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
        return ok({ path: savedPath }, 'Đã xuất bộ chuyển máy gồm database và file');
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
      return fail(`Không tạo được bộ chuyển máy. Kiểm tra quyền BACKUP DATABASE và quyền ghi của dịch vụ SQL Server vào thư mục backup. Chi tiết: ${err.message}`);
    }
  });

  ipcMain.handle('fileArchive:import', async (event) => {
    const denied = getAccessError();
    if (denied) return fail(denied);

    try {
      const { canceled, filePaths } = await dialog.showOpenDialog(
        BrowserWindow.fromWebContents(event.sender) || undefined,
        {
          title: 'Chọn file ZIP backup',
          properties: ['openFile'],
          filters: [{ name: 'ZIP archive', extensions: ['zip'] }],
        }
      );
      if (canceled || !filePaths.length) return ok({ canceled: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupDestination = path.join(
        app.getPath('documents'),
        `qlqtbdxm-restored-${timestamp}-${randomUUID().slice(0, 8)}.bak`
      );
      const result = await archiveService.importTransferPackage(filePaths[0], backupDestination);
      logger.info(`[FileArchive] Transfer package imported: ${filePaths[0]}`);
      return ok({
        path: filePaths[0],
        databaseBackupPath: result.backupPath,
      }, result.backupPath ? 'Đã nhập file và trích xuất database .bak' : 'Đã nhập file trong ZIP');
    } catch (err) {
      logger.error('[FileArchive] Transfer import failed:', err);
      return fail(err.message);
    }
  });
}

module.exports = { register };