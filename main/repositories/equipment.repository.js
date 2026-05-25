'use strict';

const BaseRepository = require('./base.repository');

class EquipmentRepository extends BaseRepository {
  constructor() {
    super('equipments');
  }

  /**
   * Tìm kiếm trang bị với lọc và phân trang
   * @param {Object} opts
   * @returns {{ items: Array, total: number }}
   */
  search({ keyword = '', unitId = null, status = null, page = 1, pageSize = 20 } = {}) {
    const conditions = ['1=1'];
    const params = {};

    if (keyword) {
      conditions.push(`(e.equipment_code LIKE @kw OR e.equipment_name LIKE @kw OR e.serial_number LIKE @kw)`);
      params.kw = `%${keyword}%`;
    }
    if (unitId) { conditions.push('e.unit_id = @unitId'); params.unitId = unitId; }
    if (status) { conditions.push('e.status = @status'); params.status = status; }

    const where = conditions.join(' AND ');
    const offset = (page - 1) * pageSize;

    const items = this.db.prepare(`
      SELECT e.*, u.unit_name, u.unit_code
      FROM equipments e
      LEFT JOIN units u ON u.id = e.unit_id
      WHERE ${where}
      ORDER BY e.id DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `).all(params);

    const { total } = this.db.prepare(`
      SELECT COUNT(*) as total FROM equipments e WHERE ${where}
    `).get(params);

    return { items, total, page, pageSize };
  }

  /**
   * Lấy thông tin đầy đủ của trang bị (kèm đơn vị và QR)
   * @param {number} id
   * @returns {Object|null}
   */
  findByIdFull(id) {
    const equipment = this.db.prepare(`
      SELECT e.*, u.unit_name, u.unit_code, q.qr_value
      FROM equipments e
      LEFT JOIN units u ON u.id = e.unit_id
      LEFT JOIN qr_codes q ON q.equipment_id = e.id
      WHERE e.id = ?
    `).get(id);

    if (!equipment) return null;

    // Lịch sử bảo dưỡng gần đây
    equipment.recentPlans = this.db.prepare(`
      SELECT mp.*, us.full_name as created_by_name
      FROM maintenance_plans mp
      LEFT JOIN users us ON us.id = mp.created_by
      WHERE mp.equipment_id = ?
      ORDER BY mp.created_at DESC LIMIT 5
    `).all(id);

    return equipment;
  }

  /**
   * Tìm theo QR code
   * @param {string} qrValue
   * @returns {Object|null}
   */
  findByQr(qrValue) {
    const qr = this.db.prepare('SELECT equipment_id FROM qr_codes WHERE qr_value = ?').get(qrValue);
    if (!qr) return null;
    return this.findByIdFull(qr.equipment_id);
  }

  /**
   * Thống kê trạng thái trang bị
   * @returns {Array}
   */
  getStatusStats() {
    return this.db.prepare(`
      SELECT status, COUNT(*) as count FROM equipments GROUP BY status
    `).all();
  }

  /**
   * Danh sách trang bị theo đơn vị
   * @param {number} unitId
   * @returns {Array}
   */
  findByUnit(unitId) {
    return this.db.prepare(`
      SELECT e.*, q.qr_value FROM equipments e
      LEFT JOIN qr_codes q ON q.equipment_id = e.id
      WHERE e.unit_id = ?
      ORDER BY e.equipment_code
    `).all(unitId);
  }
}

module.exports = new EquipmentRepository();
