'use strict';

const { ipcMain } = require('electron');
const authService = require('../services/auth.service');
const userRepo = require('../repositories/user.repository');
const { getDb } = require('../database/index');
const { hashPassword } = require('../utils/hash');
const { ok, fail } = require('../utils/response');
const logger = require('../utils/logger');

function register() {
  ipcMain.handle('auth:login', async (_event, { username, password } = {}) => {
    logger.ipc('auth:login', { username });
    if (!username || !password) return fail('Vui lòng nhập tên đăng nhập và mật khẩu');
    return authService.login(username, password);
  });

  ipcMain.handle('auth:logout', async () => {
    logger.ipc('auth:logout');
    return authService.logout();
  });

  ipcMain.handle('auth:getSession', async () => {
    return authService.getSession();
  });

  ipcMain.handle('auth:changePassword', async (_event, { oldPassword, newPassword } = {}) => {
    const session = authService.requireAuth();
    if (!session) return fail('Chưa đăng nhập');
    return authService.changePassword(session.userId, oldPassword, newPassword);
  });

  ipcMain.handle('user:list', async (_event, opts = {}) => {
    const session = authService.requireAuth();
    if (!session) return fail('Chưa đăng nhập');
    return ok(userRepo.listUsers(opts));
  });

  ipcMain.handle('user:create', async (_event, data = {}) => {
    const session = authService.requireAuth();
    if (!session) return fail('Chưa đăng nhập');
    if (!authService.requireAdmin()) return fail('Không có quyền thực hiện');

    const { username, password, full_name, role_id, unit_id } = data;
    if (!username || !password || !full_name || !role_id) return fail('Thiếu thông tin bắt buộc');

    const existing = userRepo.findByUsername(username);
    if (existing) return fail('Tên đăng nhập đã tồn tại');

    const user = userRepo.create({
      username: username.trim(),
      password_hash: hashPassword(password),
      full_name: full_name.trim(),
      role_id,
      unit_id: unit_id || null,
      is_active: 1,
    });
    return ok(userRepo.findByIdFull(user.id), 'Tạo người dùng thành công');
  });

  ipcMain.handle('user:update', async (_event, { id, data } = {}) => {
    const session = authService.requireAuth();
    if (!session) return fail('Chưa đăng nhập');
    if (!authService.requireAdmin()) return fail('Không có quyền thực hiện');

    const allowed = ['full_name', 'role_id', 'unit_id'];
    const updateData = {};
    for (const k of allowed) {
      if (data[k] !== undefined) updateData[k] = data[k];
    }

    userRepo.update(id, updateData);
    return ok(userRepo.findByIdFull(id), 'Cập nhật thành công');
  });

  ipcMain.handle('user:toggleActive', async (_event, { id } = {}) => {
    const session = authService.requireAuth();
    if (!session) return fail('Chưa đăng nhập');
    if (!authService.requireAdmin()) return fail('Không có quyền thực hiện');

    const user = userRepo.findById(id);
    if (!user) return fail('Không tìm thấy người dùng');
    userRepo.setActive(id, !user.is_active);
    return ok(null, user.is_active ? 'Đã vô hiệu hóa' : 'Đã kích hoạt');
  });

  ipcMain.handle('role:list', async () => {
    const roles = getDb().prepare('SELECT * FROM roles ORDER BY id').all();
    return ok(roles);
  });
}

module.exports = { register };
