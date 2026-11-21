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
    const orderBy = sort === 'newest'
      ? 'v.vehicle_id DESC'
      : sort === 'name'
        ? 'v.vehicle_name ASC'
        : `(ISNULL(ts.tech_file_count, 0) + ISNULL(ns.norm_file_count, 0)) DESC, v.vehicle_name ASC`;

    const { rows } = await this.db.query(`
      WITH equipment_stats AS (
        SELECT
          v.vehicle_id,
          COUNT(*) AS equipment_count
        FROM equipments e
        JOIN vehicle v ON v.vehicle_id = e.vehicle_id
        GROUP BY v.vehicle_id
      ),
      tech_stats AS (
        SELECT
          vehicle_id,
          COUNT(*) AS maintenance_count,
          SUM(CASE WHEN tech_process_file_path IS NOT NULL THEN 1 ELSE 0 END) AS tech_file_count
        FROM tech_process_maintenance
        GROUP BY vehicle_id
      ),
      norm_stats AS (
        SELECT
          vehicle_id,
          COUNT(*) AS maintenance_count,
          SUM(CASE WHEN norm_ktkt_file_path IS NOT NULL THEN 1 ELSE 0 END) AS norm_file_count
        FROM norm_ktkt_maintenance
        GROUP BY vehicle_id
      )
      SELECT
        v.vehicle_id, v.vehicle_name, v.img_name, v.img_path,
        v.is_active, v.vehicle_type_id, v.updated_at,
        vt.vehicle_type_name,
        ISNULL(es.equipment_count, 0) AS equipment_count,
        ISNULL(ts.maintenance_count, 0) + ISNULL(ns.maintenance_count, 0) AS maintenance_count,
        ISNULL(ts.tech_file_count, 0) AS tech_file_count,
        ISNULL(ns.norm_file_count, 0) AS norm_file_count
      FROM vehicle v
      LEFT JOIN vehicle_type vt ON vt.vehicle_type_id = v.vehicle_type_id
      LEFT JOIN equipment_stats es ON es.vehicle_id = v.vehicle_id
      LEFT JOIN tech_stats ts ON ts.vehicle_id = v.vehicle_id
      LEFT JOIN norm_stats ns ON ns.vehicle_id = v.vehicle_id
      WHERE ${where}
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
