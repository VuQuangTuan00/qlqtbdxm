'use strict';

const BaseRepository = require('./base.repository');

class UserRepository extends BaseRepository {
  constructor() {
    super('users');
  }

  /**
   * Tìm user theo username (kèm thông tin role và unit)
   * @param {string} username
   * @returns {Promise<Object|null>}
   */
  async findByUsername(username) {
    const { rows } = await this.db.query(`
      SELECT u.*, r.role_code, r.role_name, un.unit_name, un.unit_code
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      LEFT JOIN units un ON un.id = u.unit_id
      WHERE u.username = $1
    `, [username]);
    return rows[0] || null;
  }

  /**
   * Tìm user theo ID kèm thông tin đầy đủ
   * @param {number} id
   * @returns {Promise<Object|null>}
   */
  async findByIdFull(id) {
    const { rows } = await this.db.query(`
      SELECT u.id, u.username, u.full_name, u.is_active, u.created_at,
             r.id as role_id, r.role_code, r.role_name,
             un.id as unit_id, un.unit_name, un.unit_code
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      LEFT JOIN units un ON un.id = u.unit_id
      WHERE u.id = $1
    `, [id]);
    return rows[0] || null;
  }

  /**
   * Lấy danh sách user với phân trang và tìm kiếm
   * @param {Object} opts
   * @returns {Promise<{ items: Array, total: number }>}
   */
  async listUsers({ search = '', unitId = null, roleId = null, page = 1, pageSize = 20 } = {}) {
    const conditions = ['1=1'];
    const params = [];
    let paramIdx = 1;

    if (search) {
      conditions.push(`(u.username ILIKE $${paramIdx} OR u.full_name ILIKE $${paramIdx})`);
      params.push(`%${search}%`);
      paramIdx++;
    }
    if (unitId) {
      conditions.push(`u.unit_id = $${paramIdx}`);
      params.push(unitId);
      paramIdx++;
    }
    if (roleId) {
      conditions.push(`u.role_id = $${paramIdx}`);
      params.push(roleId);
      paramIdx++;
    }

    const where = conditions.join(' AND ');
    const offset = (page - 1) * pageSize;

    const itemsParams = [...params, pageSize, offset];
    const { rows: items } = await this.db.query(`
      SELECT u.id, u.username, u.full_name, u.is_active, u.created_at,
             r.role_code, r.role_name,
             un.unit_name, un.unit_code
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      LEFT JOIN units un ON un.id = u.unit_id
      WHERE ${where}
      ORDER BY u.id DESC
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `, itemsParams);

    const { rows: countRows } = await this.db.query(`
      SELECT COUNT(*) as total FROM users u WHERE ${where}
    `, params);

    const total = parseInt(countRows[0].total);
    return { items, total, page, pageSize };
  }

  /**
   * Cập nhật mật khẩu
   * @param {number} id
   * @param {string} passwordHash
   * @returns {Promise<void>}
   */
  async updatePassword(id, passwordHash) {
    await this.db.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [passwordHash, id]
    );
  }

  /**
   * Bật/tắt trạng thái active
   * @param {number} id
   * @param {boolean} isActive
   * @returns {Promise<void>}
   */
  async setActive(id, isActive) {
    await this.db.query(
      'UPDATE users SET is_active = $1 WHERE id = $2',
      [isActive, id]
    );
  }
}

module.exports = new UserRepository();
