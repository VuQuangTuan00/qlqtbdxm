'use strict';

const BaseRepository = require('./base.repository');

class MaintenanceItemRepository extends BaseRepository {
  constructor({ tableName, idColumn }) {
    super(tableName);
    this.idColumn = idColumn;
  }

  async findById(id) {
    const { rows } = await this.db.query(
      `SELECT * FROM ${this.tableName} WHERE ${this.idColumn} = $1`, [id]
    );
    return rows[0] || null;
  }

  async update(id, data) {
    const keys = Object.keys(data);
    if (!keys.length) return this.findById(id);
    const set = keys.map((key, index) => `${key} = $${index + 1}`).join(', ');
    const values = [...Object.values(data), id];
    const { rows } = await this.db.query(
      `UPDATE ${this.tableName} SET ${set} WHERE ${this.idColumn} = $${values.length} RETURNING *`,
      values
    );
    return rows[0] || null;
  }

  async delete(id) {
    const { rowCount } = await this.db.query(
      `DELETE FROM ${this.tableName} WHERE ${this.idColumn} = $1`, [id]
    );
    return rowCount > 0;
  }

  async exists(id) {
    return !!(await this.findById(id));
  }

  async findByVehicle(vehicleId) {
    const { rows } = await this.db.query(`
      SELECT *
      FROM ${this.tableName}
      WHERE vehicle_id = $1
      ORDER BY display_order, ${this.idColumn}
    `, [vehicleId]);
    return rows;
  }

  async getMaxOrder(vehicleId) {
    const { rows } = await this.db.query(`
      SELECT COALESCE(MAX(display_order), 0) AS max_order
      FROM ${this.tableName}
      WHERE vehicle_id = $1
    `, [vehicleId]);
    return parseInt(rows[0].max_order, 10);
  }

  async reorderAll(vehicleId, orderedIds) {
    for (let index = 0; index < orderedIds.length; index++) {
      await this.db.query(`
        UPDATE ${this.tableName}
        SET display_order = $1
        WHERE ${this.idColumn} = $2 AND vehicle_id = $3
      `, [index + 1, orderedIds[index], vehicleId]);
    }
  }
}

module.exports = MaintenanceItemRepository;
