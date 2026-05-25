'use strict';

const BaseRepository = require('./base.repository');

class UnitRepository extends BaseRepository {
  constructor() {
    super('units');
  }

  /**
   * Lấy toàn bộ đơn vị dạng cây phân cấp
   * @returns {Promise<Array>}
   */
  async getTree() {
    const { rows: all } = await this.db.query(`
      SELECT u.*, p.unit_name as parent_name
      FROM units u
      LEFT JOIN units p ON p.id = u.parent_unit_id
      ORDER BY u.parent_unit_id NULLS FIRST, u.unit_name
    `);

    return buildTree(all, null);
  }

  /**
   * Lấy đơn vị con trực tiếp
   * @param {number|null} parentId
   * @returns {Promise<Array>}
   */
  async getChildren(parentId) {
    if (parentId === null) {
      const { rows } = await this.db.query(
        'SELECT * FROM units WHERE parent_unit_id IS NULL ORDER BY unit_name'
      );
      return rows;
    }
    const { rows } = await this.db.query(
      'SELECT * FROM units WHERE parent_unit_id = $1 ORDER BY unit_name',
      [parentId]
    );
    return rows;
  }

  /**
   * Tìm kiếm đơn vị
   * @param {string} search
   * @returns {Promise<Array>}
   */
  async search(search) {
    const { rows } = await this.db.query(`
      SELECT * FROM units WHERE unit_name ILIKE $1 OR unit_code ILIKE $1
      ORDER BY unit_name LIMIT 50
    `, [`%${search}%`]);
    return rows;
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
