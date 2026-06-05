'use strict';

const BaseRepository = require('./base.repository');

class VehicleMaintenanceStepRepository extends BaseRepository {
  constructor() {
    super('vehicle_maintenance_steps');
  }

  /**
   * Lấy tất cả bước theo loại xe và loại bảo dưỡng
   */
  async findByVehicleAndType(vehicleTypeId, maintenanceType) {
    const { rows } = await this.db.query(`
      SELECT vms.*, u.full_name as created_by_name
      FROM vehicle_maintenance_steps vms
      LEFT JOIN users u ON u.id = vms.created_by
      WHERE vms.vehicle_type_id = $1 AND vms.maintenance_type = $2
      ORDER BY vms.step_order
    `, [vehicleTypeId, maintenanceType]);
    return rows;
  }

  /**
   * Lấy tất cả bước theo loại xe (nhóm theo loại bảo dưỡng)
   */
  async findAllByVehicle(vehicleTypeId) {
    const { rows } = await this.db.query(`
      SELECT vms.*, u.full_name as created_by_name
      FROM vehicle_maintenance_steps vms
      LEFT JOIN users u ON u.id = vms.created_by
      WHERE vms.vehicle_type_id = $1
      ORDER BY vms.maintenance_type, vms.step_order
    `, [vehicleTypeId]);
    return rows;
  }

  /**
   * Lấy step_order lớn nhất trong một nhóm
   */
  async getMaxOrder(vehicleTypeId, maintenanceType) {
    const { rows } = await this.db.query(`
      SELECT COALESCE(MAX(step_order), 0) as max_order
      FROM vehicle_maintenance_steps
      WHERE vehicle_type_id = $1 AND maintenance_type = $2
    `, [vehicleTypeId, maintenanceType]);
    return parseInt(rows[0].max_order);
  }

  /**
   * Đổi thứ tự hai bước
   */
  async swapOrder(id1, id2) {
    const { rows: [s1] } = await this.db.query('SELECT step_order FROM vehicle_maintenance_steps WHERE id = $1', [id1]);
    const { rows: [s2] } = await this.db.query('SELECT step_order FROM vehicle_maintenance_steps WHERE id = $1', [id2]);
    if (!s1 || !s2) return;
    await this.db.query('UPDATE vehicle_maintenance_steps SET step_order = $1 WHERE id = $2', [s2.step_order, id1]);
    await this.db.query('UPDATE vehicle_maintenance_steps SET step_order = $1 WHERE id = $2', [s1.step_order, id2]);
  }

  /**
   * Sau khi xóa, sắp xếp lại step_order liên tục
   */
  async reorder(vehicleTypeId, maintenanceType) {
    const { rows } = await this.db.query(`
      SELECT id FROM vehicle_maintenance_steps
      WHERE vehicle_type_id = $1 AND maintenance_type = $2
      ORDER BY step_order
    `, [vehicleTypeId, maintenanceType]);
    for (let i = 0; i < rows.length; i++) {
      await this.db.query(
        'UPDATE vehicle_maintenance_steps SET step_order = $1 WHERE id = $2',
        [i + 1, rows[i].id]
      );
    }
  }
}

module.exports = new VehicleMaintenanceStepRepository();