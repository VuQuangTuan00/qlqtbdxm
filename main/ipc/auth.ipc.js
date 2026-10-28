'use strict';

const { ipcMain } = require('electron');
const authService = require('../services/auth.service');
const userRepo = require('../repositories/user.repository');
const { getDb } = require('../database/index');
const { ok, fail } = require('../utils/response');
const logger = require('../utils/logger');

function register() {
  ipcMain.handle('bootstrap:status', async () => {
    try {
      return ok({ required: await authService.needsBootstrap() });
    } catch (err) {
      return fail(err.message);
    }
  });

  ipcMain.handle('bootstrap:createAdmin', async (_event, data = {}) => {
    try {
      return await authService.createFirstAdmin(data);
    } catch (err) {
      return fail(err.message);
    }
  });

  ipcMain.handle('auth:login', async (_event, { username, password } = {}) => {
    try {
      logger.ipc('auth:login', { username });
      if (!username || !password) return fail('Vui lòng nhập tên đăng nhập và mật khẩu');
      return await authService.login(username, password);
    } catch (err) {
      return fail(err.message);
    }
  });

  ipcMain.handle('auth:logout', async () => {
    try {
      logger.ipc('auth:logout');
      return await authService.logout();
    } catch (err) {
      return fail(err.message);
    }
  });

  ipcMain.handle('auth:getSession', async () => {
    try {
      return authService.getSession();
    } catch (err) {
      return fail(err.message);
    }
  });

  ipcMain.handle('auth:changePassword', async (_event, { oldPassword, newPassword } = {}) => {
    try {
      const session = authService.requireAuth();
      if (!session) return fail('Chưa đăng nhập');
      return await authService.changePassword(session.userId, oldPassword, newPassword);
    } catch (err) {
      return fail(err.message);
    }
  });

  ipcMain.handle('user:list', async (_event, opts = {}) => {
    try {
      const session = authService.requireAuth();
      if (!session) return fail('Chưa đăng nhập');
      return ok(await userRepo.listUsers(opts));
    } catch (err) {
      return fail(err.message);
    }
  });

  ipcMain.handle('user:create', async (_event, data = {}) => {
    try {
      const session = authService.requireAuth();
      if (!session) return fail('Chưa đăng nhập');
      if (!authService.requireAdmin()) return fail('Không có quyền thực hiện');

      const { username, password, full_name, role_id, unit_id } = data;
      if (!username || !password || !full_name || !role_id) return fail('Thiếu thông tin bắt buộc');

      const existing = await userRepo.findByUsername(username);
      if (existing) return fail('Tên đăng nhập đã tồn tại');

      const user = await userRepo.create({
        username: username.trim(),
        password_hash: hashPassword(password),
        full_name: full_name.trim(),
        role_id,
        unit_id: unit_id || null,
        is_active: true,
      });
      return ok(await userRepo.findByIdFull(user.id), 'Tạo người dùng thành công');
    } catch (err) {
      return fail(err.message);
    }
  });

  ipcMain.handle('user:update', async (_event, { id, data } = {}) => {
    try {
      const session = authService.requireAuth();
      if (!session) return fail('Chưa đăng nhập');
      if (!authService.requireAdmin()) return fail('Không có quyền thực hiện');

      const allowed = ['full_name', 'role_id', 'unit_id'];
      const updateData = {};
      for (const k of allowed) {
        if (data[k] !== undefined) updateData[k] = data[k];
      }

      await userRepo.update(id, updateData);
      return ok(await userRepo.findByIdFull(id), 'Cập nhật thành công');
    } catch (err) {
      return fail(err.message);
    }
  });

  ipcMain.handle('user:toggleActive', async (_event, { id } = {}) => {
    try {
      const session = authService.requireAuth();
      if (!session) return fail('Chưa đăng nhập');
      if (!authService.requireAdmin()) return fail('Không có quyền thực hiện');

      const user = await userRepo.findById(id);
      if (!user) return fail('Không tìm thấy người dùng');
      await userRepo.setActive(id, !user.is_active);
      return ok(null, user.is_active ? 'Đã vô hiệu hóa' : 'Đã kích hoạt');
    } catch (err) {
      return fail(err.message);
    }
  });

  ipcMain.handle('role:list', async () => {
    try {
      const { rows } = await getDb().query('SELECT * FROM roles ORDER BY id');
      return ok(rows);
    } catch (err) {
      return fail(err.message);
    }
  });
}

module.exports = { register };
