'use strict';

const { getDb } = require('../database/index');

/**
 * Base repository với các thao tác CRUD cơ bản (async/await, pg)
 */
class BaseRepository {
  /**
   * @param {string} tableName - Tên bảng trong database
   */
  constructor(tableName) {
    this.tableName = tableName;
  }

  /**
   * Lấy pool instance
   */
  get db() {
    return getDb();
  }

  /**
   * Tìm tất cả bản ghi
   * @param {Object} [conditions] - Điều kiện lọc {column: value}
   * @param {Object} [options] - Tùy chọn {orderBy, order, limit, offset}
   * @returns {Promise<Array>}
   */
  async findAll(conditions = {}, options = {}) {
    const { orderBy = 'id', order = 'ASC', limit, offset } = options;
    const keys = Object.keys(conditions);
    let sql = `SELECT * FROM ${this.tableName}`;
    const values = [];

    if (keys.length) {
      const where = keys.map((k, i) => `${k} = $${i + 1}`).join(' AND ');
      sql += ` WHERE ${where}`;
      values.push(...Object.values(conditions));
    }

    sql += ` ORDER BY ${orderBy} ${order}`;
    if (limit) { sql += ` LIMIT $${values.length + 1}`; values.push(limit); }
    if (offset) { sql += ` OFFSET $${values.length + 1}`; values.push(offset); }

    const { rows } = await this.db.query(sql, values);
    return rows;
  }

  /**
   * Tìm theo ID
   * @param {number} id
   * @returns {Promise<Object|null>}
   */
  async findById(id) {
    const { rows } = await this.db.query(
      `SELECT * FROM ${this.tableName} WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  }

  /**
   * Tìm một bản ghi theo điều kiện
   * @param {Object} conditions
   * @returns {Promise<Object|null>}
   */
  async findOne(conditions = {}) {
    const keys = Object.keys(conditions);
    if (!keys.length) return null;

    const where = keys.map((k, i) => `${k} = $${i + 1}`).join(' AND ');
    const { rows } = await this.db.query(
      `SELECT * FROM ${this.tableName} WHERE ${where} LIMIT 1`,
      Object.values(conditions)
    );
    return rows[0] || null;
  }

  /**
   * Tạo bản ghi mới
   * @param {Object} data
   * @returns {Promise<Object>} Bản ghi đã tạo
   */
  async create(data) {
    const keys = Object.keys(data);
    const cols = keys.join(', ');
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const values = Object.values(data);

    const { rows } = await this.db.query(
      `INSERT INTO ${this.tableName} (${cols}) VALUES (${placeholders}) RETURNING *`,
      values
    );
    return rows[0];
  }

  /**
   * Cập nhật bản ghi
   * @param {number} id
   * @param {Object} data
   * @returns {Promise<Object|null>} Bản ghi sau cập nhật
   */
  async update(id, data) {
    const keys = Object.keys(data);
    if (!keys.length) return await this.findById(id);

    const set = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    const values = [...Object.values(data), id];

    const { rows } = await this.db.query(
      `UPDATE ${this.tableName} SET ${set} WHERE id = $${values.length} RETURNING *`,
      values
    );
    return rows[0] || null;
  }

  /**
   * Xóa bản ghi
   * @param {number} id
   * @returns {Promise<boolean>}
   */
  async delete(id) {
    const { rowCount } = await this.db.query(
      `DELETE FROM ${this.tableName} WHERE id = $1`,
      [id]
    );
    return rowCount > 0;
  }

  /**
   * Đếm số bản ghi
   * @param {Object} [conditions]
   * @returns {Promise<number>}
   */
  async count(conditions = {}) {
    const keys = Object.keys(conditions);
    let sql = `SELECT COUNT(*) as n FROM ${this.tableName}`;
    const values = [];

    if (keys.length) {
      const where = keys.map((k, i) => `${k} = $${i + 1}`).join(' AND ');
      sql += ` WHERE ${where}`;
      values.push(...Object.values(conditions));
    }

    const { rows } = await this.db.query(sql, values);
    return parseInt(rows[0].n);
  }

  /**
   * Kiểm tra tồn tại theo điều kiện
   * @param {Object|number} conditions - Object conditions hoặc id
   * @returns {Promise<boolean>}
   */
  async exists(conditions = {}) {
    if (typeof conditions === 'number' || typeof conditions === 'string') {
      const row = await this.findById(conditions);
      return !!row;
    }
    return (await this.count(conditions)) > 0;
  }

  /**
   * Tìm với phân trang
   * @param {Object} [opts]
   * @returns {Promise<{ rows: Array, total: number, page: number, limit: number, totalPages: number }>}
   */
  async paginate({ page = 1, limit = 20, conditions = {}, orderBy = 'id', order = 'ASC' } = {}) {
    const offset = (page - 1) * limit;
    const total = await this.count(conditions);
    const rows = await this.findAll(conditions, { orderBy, order, limit, offset });
    return { rows, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Thực hiện nhiều thao tác trong transaction
   * @param {Function} fn - Nhận client làm tham số
   * @returns {Promise<*>}
   */
  async transaction(fn) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = BaseRepository;
