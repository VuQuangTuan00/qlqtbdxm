'use strict';

const BaseRepository = require('./base.repository');

class VehicleTypeRepository extends BaseRepository {
  constructor() {
    super('vehicle_types');
  }

  /**
   * Lấy tất cả loại xe kèm số lượng bước quy trình
   */
  async listWithStats({ search = '', isActive = null } = {}) {
    const conditions = ['1=1'];
    const params = [];
    let idx = 1;

    if (search) {
      conditions.push(`(vt.type_code ILIKE $${idx} OR vt.type_name ILIKE $${idx} OR vt.manufacturer ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }
    if (isActive !== null) {
      conditions.push(`vt.is_active = $${idx}`);
      params.push(isActive);
      idx++;
    }

    const where = conditions.join(' AND ');
    const { rows } = await this.db.query(`
      SELECT vt.*,
             u.full_name as created_by_name,
             COUNT(DISTINCT e.id) as equipment_count,
             COUNT(DISTINCT vms.id) as step_count
      FROM vehicle_types vt
      LEFT JOIN users u ON u.id = vt.created_by
      LEFT JOIN equipments e ON e.vehicle_type_id = vt.id
      LEFT JOIN vehicle_maintenance_steps vms ON vms.vehicle_type_id = vt.id
      WHERE ${where}
      GROUP BY vt.id, u.full_name
      ORDER BY vt.type_code
    `, params);
    return rows;
  }

  /**
   * Lấy chi tiết một loại xe
   */
  async findByIdFull(id) {
    const { rows } = await this.db.query(`
      SELECT vt.*, u.full_name as created_by_name
      FROM vehicle_types vt
      LEFT JOIN users u ON u.id = vt.created_by
      WHERE vt.id = $1
    `, [id]);
    return rows[0] || null;
  }

  /**
   * Lấy trang bị thuộc loại xe này
   */
  async getEquipments(vehicleTypeId) {
    const { rows } = await this.db.query(`
      SELECT e.*, un.unit_name
      FROM equipments e
      LEFT JOIN units un ON un.id = e.unit_id
      WHERE e.vehicle_type_id = $1
      ORDER BY e.equipment_code
    `, [vehicleTypeId]);
    return rows;
  }
}

module.exports = new VehicleTypeRepository();