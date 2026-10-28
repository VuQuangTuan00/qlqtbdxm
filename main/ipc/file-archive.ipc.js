'use strict';

const { ipcMain, dialog, BrowserWindow, app } = require('electron');
const path = require('path');
const authService = require('../services/auth.service');
const archiveService = require('../services/file-archive.service');
const { ok, fail } = require('../utils/response');
const logger = require('../utils/logger');

function getAccessError() {
  if (!authService.requireAuth()) return 'Chưa đăng nhập';
  if (!authService.requireAdmin()) return 'Chỉ admin mới được sao lưu hoặc khôi phục dữ liệu';
  return null;
}

function register() {
  ipcMain.handle('fileArchive:export', async (event) => {
    const denied = getAccessError();
    if (denied) return fail(denied);
    try {
      const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, '');
      const owner = BrowserWindow.fromWebContents(event.sender) || undefined;
      const { canceled, filePath } = await dialog.showSaveDialog(owner, {
        title: 'Sao lưu toàn bộ dữ liệu',
        defaultPath: path.join(app.getPath('documents'), `Backup_279_${timestamp}.zip`),
        filters: [{ name: 'QLQT SQLite backup', extensions: ['zip'] }],
      });
      if (canceled || !filePath) return ok({ canceled: true });
      const result = await archiveService.exportBackup(filePath);
      logger.info(`[Backup] Đã tạo và xác minh: ${result.path}`);
      return ok({ path: result.path }, 'Sao lưu database và tài liệu thành công');
    } catch (error) {
      logger.error('[Backup] Thất bại:', error);
      return fail(error.message);
    }
  });

  ipcMain.handle('fileArchive:import', async (event) => {
    const denied = getAccessError();
    if (denied) return fail(denied);
    try {
      const owner = BrowserWindow.fromWebContents(event.sender) || undefined;
      const { canceled, filePaths } = await dialog.showOpenDialog(owner, {
        title: 'Chọn gói backup SQLite',
        properties: ['openFile'],
        filters: [{ name: 'QLQT SQLite backup', extensions: ['zip'] }],
      });
      if (canceled || !filePaths.length) return ok({ canceled: true });
      const checked = await archiveService.validateBackupPackage(filePaths[0]);
      const createdAt = checked.manifest.createdAt || 'không rõ';
      const fileCount = checked.manifest.files.length;
      checked.staging && require('fs').rmSync(checked.staging, { recursive: true, force: true });
      const confirmation = await dialog.showMessageBox(owner, {
        type: 'warning',
        buttons: ['Hủy', 'Khôi phục'],
        defaultId: 0,
        cancelId: 0,
        title: 'Xác nhận khôi phục dữ liệu',
        message: 'Dữ liệu hiện tại sẽ được thay bằng gói backup đã chọn.',
        detail: `Thời điểm backup: ${createdAt}\nSố file được kiểm tra: ${fileCount}\nỨng dụng sẽ tạo một safety backup và tự hoàn tác nếu restore lỗi.`,
        noLink: true,
      });
      if (confirmation.response !== 1) return ok({ canceled: true });
      const result = await archiveService.restoreBackup(filePaths[0]);
      logger.info(`[Restore] Thành công: ${filePaths[0]}`);
      setTimeout(() => {
        app.relaunch();
        app.exit(0);
      }, 750);
      return ok(result, 'Khôi phục thành công; ứng dụng đang khởi động lại');
    } catch (error) {
      logger.error('[Restore] Thất bại:', error);
      return fail(error.message);
    }
  });
}

module.exports = { register };
