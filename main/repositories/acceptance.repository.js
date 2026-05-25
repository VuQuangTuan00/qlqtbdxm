'use strict';

const BaseRepository = require('./base.repository');

class AcceptanceRepository extends BaseRepository {
  constructor() {
    super('acceptance_records');
  }

  /**
   * Tìm nghiệm thu theo plan
   * @param {number} planId
   * @returns {Object|null}
   */
  findByPlan(planId) {
    return this.db.prepare(`
      SELECT ar.*, u.full_name as accepted_by_name
      FROM acceptance_records ar
      LEFT JOIN users u ON u.id = ar.accepted_by
      WHERE ar.plan_id = ?
    `).get(planId) || null;
  }

  /**
   * Lấy danh sách nghiệm thu với phân trang
   * @param {Object} opts
   * @returns {{ items: Array, total: number }}
   */
  listFull({ conclusion = null, fromDate = null, toDate = null, page = 1, pageSize = 20 } = {}) {
    const conditions = ['1=1'];
    const params = {};

    if (conclusion) { conditions.push('ar.conclusion = @conclusion'); params.conclusion = conclusion; }
    if (fromDate) { conditions.push('ar.acceptance_date >= @fromDate'); params.fromDate = fromDate; }
    if (toDate) { conditions.push('ar.acceptance_date <= @toDate'); params.toDate = toDate; }

    const where = conditions.join(' AND ');
    const offset = (page - 1) * pageSize;

    const items = this.db.prepare(`
      SELECT ar.*,
             u.full_name as accepted_by_name,
             mp.plan_code, e.equipment_code, e.equipment_name
      FROM acceptance_records ar
      LEFT JOIN users u ON u.id = ar.accepted_by
      LEFT JOIN maintenance_plans mp ON mp.id = ar.plan_id
      LEFT JOIN equipments e ON e.id = mp.equipment_id
      WHERE ${where}
      ORDER BY ar.acceptance_date DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `).all(params);

    const { total } = this.db.prepare(`
      SELECT COUNT(*) as total FROM acceptance_records ar WHERE ${where}
    `).get(params);

    return { items, total, page, pageSize };
  }
}

module.exports = new AcceptanceRepository();
