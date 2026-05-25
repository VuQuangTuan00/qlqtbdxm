'use strict';

const { getDb } = require('../database/index');

/**
 * Base repository với các thao tác CRUD cơ bản
 */
class BaseRepository {
  /**
   * @param {string} tableName - Tên bảng trong database
   */
  constructor(tableName) {
    this.tableName = tableName;
  }

  /**
   * Lấy instance database
   * @returns {import('better-sqlite3').Database}
   */
  get db() {
    return getDb();
  }

  /**
   * Tìm tất cả bản ghi
   * @param {Object} [where] - Điều kiện lọc {column: value}
   * @param {Object} [opts] - Tùy chọn {orderBy, limit, offset}
   * @returns {Array}
   */
  findAll(where = {}, opts = {}) {
    const conditions = Object.keys(where);
    let sql = `SELECT * FROM ${this.tableName}`;

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.map((k) => `${k} = @${k}`).join(' AND ');
    }

    if (opts.orderBy) sql += ` ORDER BY ${opts.orderBy}`;
    if (opts.limit) sql += ` LIMIT ${parseInt(opts.limit, 10)}`;
    if (opts.offset) sql += ` OFFSET ${parseInt(opts.offset, 10)}`;

    return this.db.prepare(sql).all(where);
  }

  /**
   * Tìm theo ID
   * @param {number} id
   * @returns {Object|null}
   */
  findById(id) {
    return this.db.prepare(`SELECT * FROM ${this.tableName} WHERE id = ?`).get(id) || null;
  }

  /**
   * Tìm một bản ghi theo điều kiện
   * @param {Object} where
   * @returns {Object|null}
   */
  findOne(where) {
    const conditions = Object.keys(where);
    if (conditions.length === 0) return null;

    const sql = `SELECT * FROM ${this.tableName} WHERE ${conditions.map((k) => `${k} = @${k}`).join(' AND ')} LIMIT 1`;
    return this.db.prepare(sql).get(where) || null;
  }

  /**
   * Tạo bản ghi mới
   * @param {Object} data
   * @returns {Object} Bản ghi đã tạo
   */
  create(data) {
    const keys = Object.keys(data);
    const sql = `INSERT INTO ${this.tableName} (${keys.join(', ')}) VALUES (${keys.map((k) => `@${k}`).join(', ')})`;
    const result = this.db.prepare(sql).run(data);
    return this.findById(result.lastInsertRowid);
  }

  /**
   * Cập nhật bản ghi
   * @param {number} id
   * @param {Object} data
   * @returns {Object|null} Bản ghi sau cập nhật
   */
  update(id, data) {
    const keys = Object.keys(data);
    if (keys.length === 0) return this.findById(id);

    const sql = `UPDATE ${this.tableName} SET ${keys.map((k) => `${k} = @${k}`).join(', ')} WHERE id = @_id`;
    this.db.prepare(sql).run({ ...data, _id: id });
    return this.findById(id);
  }

  /**
   * Xóa bản ghi
   * @param {number} id
   * @returns {boolean}
   */
  delete(id) {
    const result = this.db.prepare(`DELETE FROM ${this.tableName} WHERE id = ?`).run(id);
    return result.changes > 0;
  }

  /**
   * Đếm số bản ghi
   * @param {Object} [where]
   * @returns {number}
   */
  count(where = {}) {
    const conditions = Object.keys(where);
    let sql = `SELECT COUNT(*) as cnt FROM ${this.tableName}`;
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.map((k) => `${k} = @${k}`).join(' AND ');
    }
    return this.db.prepare(sql).get(where).cnt;
  }

  /**
   * Kiểm tra tồn tại
   * @param {number} id
   * @returns {boolean}
   */
  exists(id) {
    const row = this.db.prepare(`SELECT 1 FROM ${this.tableName} WHERE id = ? LIMIT 1`).get(id);
    return !!row;
  }

  /**
   * Thực hiện nhiều thao tác trong transaction
   * @param {Function} fn - Hàm thực hiện
   * @returns {*}
   */
  transaction(fn) {
    return this.db.transaction(fn)();
  }

  /**
   * Tìm với phân trang
   * @param {Object} [where]
   * @param {number} [page=1]
   * @param {number} [pageSize=20]
   * @param {string} [orderBy]
   * @returns {{ items: Array, total: number, page: number, pageSize: number }}
   */
  paginate(where = {}, page = 1, pageSize = 20, orderBy = 'id DESC') {
    const offset = (page - 1) * pageSize;
    const total = this.count(where);
    const items = this.findAll(where, { orderBy, limit: pageSize, offset });
    return { items, total, page, pageSize };
  }
}

module.exports = BaseRepository;
