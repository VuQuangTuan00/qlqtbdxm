'use strict';

const BaseRepository = require('./base.repository');

class VehicleTypeRepository extends BaseRepository {
  constructor() {
    super('vehicle_type');
  }

  async findById(id) {
    const { rows } = await this.db.query(
      'SELECT * FROM vehicle_type WHERE vehicle_type_id = $1', [id]
    );
    return rows[0] || null;
  }

  async update(id, data) {
    const keys = Object.keys(data);
    if (!keys.length) return await this.findById(id);
    const set    = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    const values = [...Object.values(data), id];
    const { rows } = await this.db.query(
      `UPDATE vehicle_type SET ${set} WHERE vehicle_type_id = $${values.length} RETURNING *`,
      values
    );
    return rows[0] || null;
  }

  async delete(id) {
    const { rowCount } = await this.db.query(
      'DELETE FROM vehicle_type WHERE vehicle_type_id = $1', [id]
    );
    return rowCount > 0;
  }

  async exists(id) {
    return !!(await this.findById(id));
  }

  async findAll() {
    const { rows } = await this.db.query(
      'SELECT * FROM vehicle_type ORDER BY vehicle_type_name'
    );
    return rows;
  }
}

module.exports = new VehicleTypeRepository();
