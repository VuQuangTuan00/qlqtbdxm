'use strict';

const BaseRepository = require('./base.repository');

class UserRepository extends BaseRepository {
  constructor() {
    super('users');
  }

  /**
   * Tìm user theo username (kèm thông tin role và unit)
   * @param {string} username
   * @returns {Object|null}
   */
  findByUsername(username) {
    return this.db.prepare(`
      SELECT u.*, r.role_code, r.role_name, un.unit_name, un.unit_code
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      LEFT JOIN units un ON un.id = u.unit_id
      WHERE u.username = ?
    `).get(username) || null;
  }

  /**
   * Tìm user theo ID kèm thông tin đầy đủ
   * @param {number} id
   * @returns {Object|null}
   */
  findByIdFull(id) {
    return this.db.prepare(`
      SELECT u.id, u.username, u.full_name, u.is_active, u.created_at,
             r.id as role_id, r.role_code, r.role_name,
             un.id as unit_id, un.unit_name, un.unit_code
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      LEFT JOIN units un ON un.id = u.unit_id
      WHERE u.id = ?
    `).get(id) || null;
  }

  /**
   * Lấy danh sách user với phân trang và tìm kiếm
   * @param {Object} opts
   * @returns {{ items: Array, total: number }}
   */
  listUsers({ search = '', unitId = null, roleId = null, page = 1, pageSize = 20 } = {}) {
    const conditions = ['1=1'];
    const params = {};

    if (search) {
      conditions.push(`(u.username LIKE @search OR u.full_name LIKE @search)`);
      params.search = `%${search}%`;
    }
    if (unitId) { conditions.push('u.unit_id = @unitId'); params.unitId = unitId; }
    if (roleId) { conditions.push('u.role_id = @roleId'); params.roleId = roleId; }

    const where = conditions.join(' AND ');
    const offset = (page - 1) * pageSize;

    const items = this.db.prepare(`
      SELECT u.id, u.username, u.full_name, u.is_active, u.created_at,
             r.role_code, r.role_name,
             un.unit_name, un.unit_code
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      LEFT JOIN units un ON un.id = u.unit_id
      WHERE ${where}
      ORDER BY u.id DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `).all(params);

    const { total } = this.db.prepare(`
      SELECT COUNT(*) as total FROM users u WHERE ${where}
    `).get(params);

    return { items, total, page, pageSize };
  }

  /**
   * Cập nhật mật khẩu
   * @param {number} id
   * @param {string} passwordHash
   */
  updatePassword(id, passwordHash) {
    this.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, id);
  }

  /**
   * Bật/tắt trạng thái active
   * @param {number} id
   * @param {boolean} isActive
   */
  setActive(id, isActive) {
    this.db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(isActive ? 1 : 0, id);
  }
}

module.exports = new UserRepository();
