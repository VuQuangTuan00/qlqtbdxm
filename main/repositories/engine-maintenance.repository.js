'use strict';

const BaseRepository = require('./base.repository');

class EngineMaintRepository extends BaseRepository {
  constructor() {
    super('engine_maintenance');
  }

  // Override vì PK là engine_maintenance_id, không phải id
  async findById(id) {
    const { rows } = await this.db.query(
      'SELECT * FROM engine_maintenance WHERE engine_maintenance_id = $1', [id]
    );
    return rows[0] || null;
  }

  async update(id, data) {
    const keys = Object.keys(data);
    if (!keys.length) return await this.findById(id);
    const set = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    const values = [...Object.values(data), id];
    const { rows } = await this.db.query(
      `UPDATE engine_maintenance SET ${set} WHERE engine_maintenance_id = $${values.length} RETURNING *`,
      values
    );
    return rows[0] || null;
  }

  async delete(id) {
    const { rowCount } = await this.db.query(
      'DELETE FROM engine_maintenance WHERE engine_maintenance_id = $1', [id]
    );
    return rowCount > 0;
  }

  async exists(id) {
    return !!(await this.findById(id));
  }

  async findByVehicle(vehicleId) {
    const { rows } = await this.db.query(`
      SELECT em.*
      FROM engine_maintenance em
      WHERE em.vehicle_id = $1
      ORDER BY em.display_order, em.engine_maintenance_id
    `, [vehicleId]);
    return rows;
  }

  async getMaxOrder(vehicleId) {
    const { rows } = await this.db.query(`
      SELECT COALESCE(MAX(display_order), 0) AS max_order
      FROM engine_maintenance
      WHERE vehicle_id = $1
    `, [vehicleId]);
    return parseInt(rows[0].max_order);
  }

  async reorderAll(vehicleId, orderedIds) {
    for (let i = 0; i < orderedIds.length; i++) {
      await this.db.query(
        `UPDATE engine_maintenance
         SET display_order = $1
         WHERE engine_maintenance_id = $2 AND vehicle_id = $3`,
        [i + 1, orderedIds[i], vehicleId]
      );
    }
  }
}

module.exports = new EngineMaintRepository();
