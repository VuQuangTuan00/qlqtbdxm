'use strict';

const BaseRepository = require('./base.repository');

class AcceptanceRepository extends BaseRepository {
  constructor() {
    super('acceptance_records');
  }

  /**
   * Tìm nghiệm thu theo plan
   * @param {number} planId
   * @returns {Promise<Object|null>}
   */
  async findByPlan(planId) {
    const { rows } = await this.db.query(`
      SELECT ar.*, u.full_name as accepted_by_name
      FROM acceptance_records ar
      LEFT JOIN users u ON u.id = ar.accepted_by
      WHERE ar.plan_id = $1
    `, [planId]);
    return rows[0] || null;
  }

  /**
   * Lấy danh sách nghiệm thu với phân trang
   * @param {Object} opts
   * @returns {Promise<{ items: Array, total: number }>}
   */
  async listFull({ conclusion = null, fromDate = null, toDate = null, page = 1, pageSize = 20 } = {}) {
    const conditions = ['1=1'];
    const params = [];
    let paramIdx = 1;

    if (conclusion) {
      conditions.push(`ar.conclusion = $${paramIdx}`);
      params.push(conclusion);
      paramIdx++;
    }
    if (fromDate) {
      conditions.push(`ar.acceptance_date >= $${paramIdx}`);
      params.push(fromDate);
      paramIdx++;
    }
    if (toDate) {
      conditions.push(`ar.acceptance_date <= $${paramIdx}`);
      params.push(toDate);
      paramIdx++;
    }

    const where = conditions.join(' AND ');
    const offset = (page - 1) * pageSize;

    const { rows: items } = await this.db.query(`
      SELECT ar.*,
             u.full_name as accepted_by_name,
             mp.plan_code, e.equipment_code, e.equipment_name
      FROM acceptance_records ar
      LEFT JOIN users u ON u.id = ar.accepted_by
      LEFT JOIN maintenance_plans mp ON mp.id = ar.plan_id
      LEFT JOIN equipments e ON e.id = mp.equipment_id
      WHERE ${where}
      ORDER BY ar.acceptance_date DESC
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `, [...params, pageSize, offset]);

    const { rows: countRows } = await this.db.query(`
      SELECT COUNT(*) as total FROM acceptance_records ar WHERE ${where}
    `, params);

    const total = parseInt(countRows[0].total);
    return { items, total, page, pageSize };
  }
}

module.exports = new AcceptanceRepository();
