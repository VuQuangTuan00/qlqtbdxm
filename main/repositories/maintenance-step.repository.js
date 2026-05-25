'use strict';

const BaseRepository = require('./base.repository');

class MaintenanceStepRepository extends BaseRepository {
  constructor() {
    super('maintenance_steps');
  }

  /**
   * Lấy các bước theo loại bảo dưỡng
   * @param {string} maintenanceType
   * @returns {Array}
   */
  findByType(maintenanceType) {
    return this.db.prepare(`
      SELECT * FROM maintenance_steps
      WHERE maintenance_type = ?
      ORDER BY step_order
    `).all(maintenanceType);
  }

  /**
   * Lấy tất cả loại bảo dưỡng
   * @returns {Array}
   */
  getTypes() {
    return this.db.prepare(`
      SELECT DISTINCT maintenance_type FROM maintenance_steps ORDER BY maintenance_type
    `).all().map((r) => r.maintenance_type);
  }
}

module.exports = new MaintenanceStepRepository();
