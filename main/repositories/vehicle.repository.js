'use strict';

const BaseRepository = require('./base.repository');

class VehicleRepository extends BaseRepository {
  constructor() {
    super('vehicle');
  }

  // Override vì PK là vehicle_id, không phải id
  async findById(id) {
    const { rows } = await this.db.query(`
      SELECT v.*, vt.vehicle_type_name
      FROM vehicle v
      LEFT JOIN vehicle_type vt ON vt.vehicle_type_id = v.vehicle_type_id
      WHERE v.vehicle_id = $1
    `, [id]);
    return rows[0] || null;
  }

  async update(id, data) {
    const keys = Object.keys(data);
    if (!keys.length) return await this.findById(id);
    const set = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    const values = [...Object.values(data), id];
    const { rows } = await this.db.query(
      `UPDATE vehicle SET ${set} WHERE vehicle_id = $${values.length} RETURNING *`,
      values
    );
    return rows[0] || null;
  }

  async delete(id) {
    const { rowCount } = await this.db.query(
      'DELETE FROM vehicle WHERE vehicle_id = $1', [id]
    );
    return rowCount > 0;
  }

  async exists(id) {
    return !!(await this.findById(id));
  }

  async listWithStats({ search = '', isActive = null, typeId = null, sort = 'updated' } = {}) {
    const conditions = ['1=1'];
    const params = [];
    let idx = 1;

    if (search) {
      conditions.push(`v.vehicle_name ILIKE $${idx}`);
      params.push(`%${search}%`);
      idx++;
    }
    if (isActive !== null) {
      conditions.push(`v.is_active = $${idx}`);
      params.push(isActive);
      idx++;
    }
    if (typeId === 'none') {
      conditions.push(`v.vehicle_type_id IS NULL`);
    } else if (typeId !== null) {
      conditions.push(`v.vehicle_type_id = $${idx}`);
      params.push(typeId);
      idx++;
    }

    const where   = conditions.join(' AND ');
    const orderBy = sort === 'name'
      ? 'v.vehicle_name ASC'
      : `(
          COUNT(DISTINCT CASE WHEN em.tech_process_file_path IS NOT NULL THEN em.engine_maintenance_id END) +
          COUNT(DISTINCT CASE WHEN em.norm_ktkt_file_path   IS NOT NULL THEN em.engine_maintenance_id END)
        ) DESC, v.vehicle_name ASC`;

    const { rows } = await this.db.query(`
      SELECT v.*,
             vt.vehicle_type_name,
             COUNT(DISTINCT e.id)                                                    AS equipment_count,
             COUNT(DISTINCT em.engine_maintenance_id)                                AS maintenance_count,
             COUNT(DISTINCT CASE WHEN em.tech_process_file_path IS NOT NULL
                                 THEN em.engine_maintenance_id END)                  AS tech_file_count,
             COUNT(DISTINCT CASE WHEN em.norm_ktkt_file_path IS NOT NULL
                                 THEN em.engine_maintenance_id END)                  AS norm_file_count
      FROM vehicle v
      LEFT JOIN vehicle_type vt        ON vt.vehicle_type_id = v.vehicle_type_id
      LEFT JOIN equipments e           ON e.vehicle_id = v.vehicle_id
      LEFT JOIN engine_maintenance em  ON em.vehicle_id = v.vehicle_id
      WHERE ${where}
      GROUP BY v.vehicle_id, vt.vehicle_type_name
      ORDER BY ${orderBy}
    `, params);
    return rows;
  }

  async findByIdFull(id) {
    return this.findById(id);
  }

  async getEquipments(vehicleId) {
    const { rows } = await this.db.query(`
      SELECT e.*, un.unit_name
      FROM equipments e
      LEFT JOIN units un ON un.id = e.unit_id
      WHERE e.vehicle_id = $1
      ORDER BY e.equipment_code
    `, [vehicleId]);
    return rows;
  }
}

module.exports = new VehicleRepository();
