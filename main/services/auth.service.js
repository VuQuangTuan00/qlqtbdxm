'use strict';

const userRepo = require('../repositories/user.repository');
const { hashPassword, comparePassword } = require('../utils/hash');
const { ok, fail } = require('../utils/response');
const logger = require('../utils/logger');
const { getDb } = require('../database/index');

/** Session lưu trong bộ nhớ main process */
let _session = null;

/**
 * Đăng nhập
 * @param {string} username
 * @param {string} password
 * @returns {{ success: boolean, data?: Object, error?: string }}
 */
function login(username, password) {
  const user = userRepo.findByUsername(username);

  if (!user) {
    logger.warn(`[Auth] Đăng nhập thất bại - không tìm thấy: ${username}`);
    return fail('Tên đăng nhập hoặc mật khẩu không đúng');
  }

  if (!user.is_active) {
    return fail('Tài khoản đã bị vô hiệu hóa');
  }

  const valid = comparePassword(password, user.password_hash);
  if (!valid) {
    logger.warn(`[Auth] Đăng nhập thất bại - sai mật khẩu: ${username}`);
    return fail('Tên đăng nhập hoặc mật khẩu không đúng');
  }

  // Tạo session
  _session = {
    userId: user.id,
    username: user.username,
    fullName: user.full_name,
    roleCode: user.role_code,
    roleName: user.role_name,
    unitId: user.unit_id,
    unitName: user.unit_name,
    loginAt: new Date().toISOString(),
  };

  // Ghi audit log
  try {
    getDb().prepare(`
      INSERT INTO audit_logs (user_id, action, target_table, target_id)
      VALUES (?, 'login', 'users', ?)
    `).run(user.id, user.id);
  } catch (e) {
    logger.warn('[Auth] Lỗi ghi audit log:', e.message);
  }

  logger.info(`[Auth] Đăng nhập thành công: ${username} (${user.role_code})`);
  return ok(_session);
}

/**
 * Đăng xuất
 */
function logout() {
  if (_session) {
    logger.info(`[Auth] Đăng xuất: ${_session.username}`);
    try {
      getDb().prepare(`
        INSERT INTO audit_logs (user_id, action, target_table, target_id)
        VALUES (?, 'logout', 'users', ?)
      `).run(_session.userId, _session.userId);
    } catch (e) {}
  }
  _session = null;
  return ok(null, 'Đã đăng xuất');
}

/**
 * Lấy session hiện tại
 * @returns {{ success: boolean, data: Object|null }}
 */
function getSession() {
  return ok(_session);
}

/**
 * Yêu cầu đăng nhập (middleware cho IPC)
 * @returns {Object|null} Session nếu đã đăng nhập, null nếu chưa
 */
function requireAuth() {
  return _session;
}

/**
 * Yêu cầu quyền admin
 * @returns {boolean}
 */
function requireAdmin() {
  return _session && _session.roleCode === 'admin';
}

/**
 * Đổi mật khẩu
 * @param {number} userId
 * @param {string} oldPassword
 * @param {string} newPassword
 * @returns {{ success: boolean }}
 */
function changePassword(userId, oldPassword, newPassword) {
  const user = userRepo.findById(userId);
  if (!user) return fail('Không tìm thấy người dùng');

  if (!comparePassword(oldPassword, user.password_hash)) {
    return fail('Mật khẩu cũ không đúng');
  }

  if (newPassword.length < 6) {
    return fail('Mật khẩu mới phải ít nhất 6 ký tự');
  }

  userRepo.updatePassword(userId, hashPassword(newPassword));
  logger.info(`[Auth] Đổi mật khẩu: userId=${userId}`);
  return ok(null, 'Đổi mật khẩu thành công');
}

module.exports = { login, logout, getSession, requireAuth, requireAdmin, changePassword };
