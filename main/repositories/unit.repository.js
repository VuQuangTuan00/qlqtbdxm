'use strict';

const BaseRepository = require('./base.repository');

class UnitRepository extends BaseRepository {
  constructor() {
    super('units');
  }

  /**
   * Lấy toàn bộ đơn vị dạng cây phân cấp
   * @returns {Array}
   */
  getTree() {
    const all = this.db.prepare(`
      SELECT u.*, p.unit_name as parent_name
      FROM units u
      LEFT JOIN units p ON p.id = u.parent_unit_id
      ORDER BY u.parent_unit_id NULLS FIRST, u.unit_name
    `).all();

    return buildTree(all, null);
  }

  /**
   * Lấy đơn vị con trực tiếp
   * @param {number|null} parentId
   * @returns {Array}
   */
  getChildren(parentId) {
    if (parentId === null) {
      return this.db.prepare('SELECT * FROM units WHERE parent_unit_id IS NULL ORDER BY unit_name').all();
    }
    return this.db.prepare('SELECT * FROM units WHERE parent_unit_id = ? ORDER BY unit_name').all(parentId);
  }

  /**
   * Tìm kiếm đơn vị
   * @param {string} search
   * @returns {Array}
   */
  search(search) {
    return this.db.prepare(`
      SELECT * FROM units WHERE unit_name LIKE ? OR unit_code LIKE ?
      ORDER BY unit_name LIMIT 50
    `).all(`%${search}%`, `%${search}%`);
  }
}

/**
 * Xây dựng cây đơn vị từ danh sách phẳng
 * @param {Array} items
 * @param {number|null} parentId
 * @returns {Array}
 */
function buildTree(items, parentId) {
  return items
    .filter((item) => item.parent_unit_id === parentId)
    .map((item) => ({
      ...item,
      children: buildTree(items, item.id),
    }));
}

module.exports = new UnitRepository();
