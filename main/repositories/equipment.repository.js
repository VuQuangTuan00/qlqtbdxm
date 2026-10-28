'use strict';

const BaseRepository = require('./base.repository');

class EquipmentRepository extends BaseRepository {
  constructor() {
    super('equipments');
  }

  /**
   * Tìm kiếm trang bị với lọc và phân trang
   * @param {Object} opts
   * @returns {Promise<{ items: Array, total: number }>}
   */
  async search({ keyword = '', unitId = null, status = null, page = 1, pageSize = 20 } = {}) {
    const conditions = ['1=1'];
    const params = [];
    let paramIdx = 1;

    if (keyword) {
      conditions.push(`(e.equipment_code LIKE $${paramIdx} COLLATE NOCASE OR e.equipment_name LIKE $${paramIdx} COLLATE NOCASE OR e.serial_number LIKE $${paramIdx} COLLATE NOCASE)`);
      params.push(`%${keyword}%`);
      paramIdx++;
    }
    if (unitId) {
      conditions.push(`e.unit_id = $${paramIdx}`);
      params.push(unitId);
      paramIdx++;
    }
    if (status) {
      conditions.push(`e.status = $${paramIdx}`);
      params.push(status);
      paramIdx++;
    }

    const where = conditions.join(' AND ');
    const offset = (page - 1) * pageSize;

    const { rows: items } = await this.db.query(`
      SELECT e.*, u.unit_name, u.unit_code
      FROM equipments e
      LEFT JOIN units u ON u.id = e.unit_id
      WHERE ${where}
      ORDER BY e.id DESC
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `, [...params, pageSize, offset]);

    const { rows: countRows } = await this.db.query(`
      SELECT COUNT(*) as total FROM equipments e WHERE ${where}
    `, params);

    const total = parseInt(countRows[0].total);
    return { items, total, page, pageSize };
  }

  /**
   * Lấy thông tin đầy đủ của trang bị (kèm đơn vị và QR)
   * @param {number} id
   * @returns {Promise<Object|null>}
   */
  async findByIdFull(id) {
    const { rows } = await this.db.query(`
      SELECT e.*, u.unit_name, u.unit_code, q.qr_value
      FROM equipments e
      LEFT JOIN units u ON u.id = e.unit_id
      LEFT JOIN qr_codes q ON q.equipment_id = e.id
      WHERE e.id = $1
    `, [id]);

    const equipment = rows[0];
    if (!equipment) return null;

    // Lịch sử bảo dưỡng gần đây
    const { rows: recentPlans } = await this.db.query(`
      SELECT mp.*, us.full_name as created_by_name
      FROM maintenance_plans mp
      LEFT JOIN users us ON us.id = mp.created_by
      WHERE mp.equipment_id = $1
      ORDER BY mp.created_at DESC LIMIT 5
    `, [id]);

    equipment.recentPlans = recentPlans;
    return equipment;
  }

  /**
   * Tìm theo QR code
   * @param {string} qrValue
   * @returns {Promise<Object|null>}
   */
  async findByQr(qrValue) {
    const { rows } = await this.db.query(
      'SELECT equipment_id FROM qr_codes WHERE qr_value = $1',
      [qrValue]
    );
    if (!rows[0]) return null;
    return this.findByIdFull(rows[0].equipment_id);
  }

  /**
   * Thống kê trạng thái trang bị
   * @returns {Promise<Array>}
   */
  async getStatusStats() {
    const { rows } = await this.db.query(
      'SELECT status, COUNT(*) as count FROM equipments GROUP BY status'
    );
    return rows;
  }

  /**
   * Danh sách trang bị theo đơn vị
   * @param {number} unitId
   * @returns {Promise<Array>}
   */
  async findByUnit(unitId) {
    const { rows } = await this.db.query(`
      SELECT e.*, q.qr_value FROM equipments e
      LEFT JOIN qr_codes q ON q.equipment_id = e.id
      WHERE e.unit_id = $1
      ORDER BY e.equipment_code
    `, [unitId]);
    return rows;
  }
}

module.exports = new EquipmentRepository();
