'use strict';

const BaseRepository = require('./base.repository');

class MaintenanceStepRepository extends BaseRepository {
  constructor() {
    super('maintenance_steps');
  }

  /**
   * Lấy các bước theo loại bảo dưỡng
   * @param {string} maintenanceType
   * @returns {Promise<Array>}
   */
  async findByType(maintenanceType) {
    const { rows } = await this.db.query(`
      SELECT * FROM maintenance_steps
      WHERE maintenance_type = $1
      ORDER BY step_order
    `, [maintenanceType]);
    return rows;
  }

  /**
   * Lấy tất cả loại bảo dưỡng
   * @returns {Promise<Array>}
   */
  async getTypes() {
    const { rows } = await this.db.query(
      'SELECT DISTINCT maintenance_type FROM maintenance_steps ORDER BY maintenance_type'
    );
    return rows.map((r) => r.maintenance_type);
  }
}

module.exports = new MaintenanceStepRepository();
