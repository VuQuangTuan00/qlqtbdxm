'use strict';

const BaseRepository = require('./base.repository');

class MaintenanceLogRepository extends BaseRepository {
  constructor() {
    super('maintenance_logs');
  }

  /**
   * Lấy logs theo plan với thông tin đầy đủ
   * @param {number} planId
   * @returns {Promise<Array>}
   */
  async findByPlan(planId) {
    const { rows } = await this.db.query(`
      SELECT ml.*,
             ms.step_name, ms.step_order, ms.technical_requirement, ms.estimated_time,
             u.full_name as performed_by_name
      FROM maintenance_logs ml
      LEFT JOIN maintenance_steps ms ON ms.id = ml.step_id
      LEFT JOIN users u ON u.id = ml.performed_by
      WHERE ml.plan_id = $1
      ORDER BY ms.step_order
    `, [planId]);
    return rows;
  }

  /**
   * Lấy log theo ID đầy đủ
   * @param {number} id
   * @returns {Promise<Object|null>}
   */
  async findByIdFull(id) {
    const { rows } = await this.db.query(`
      SELECT ml.*,
             ms.step_name, ms.step_order, ms.technical_requirement,
             u.full_name as performed_by_name,
             mp.plan_code, mp.equipment_id
      FROM maintenance_logs ml
      LEFT JOIN maintenance_steps ms ON ms.id = ml.step_id
      LEFT JOIN users u ON u.id = ml.performed_by
      LEFT JOIN maintenance_plans mp ON mp.id = ml.plan_id
      WHERE ml.id = $1
    `, [id]);
    return rows[0] || null;
  }

  /**
   * Cập nhật trạng thái log
   * @param {number} id
   * @param {string} status
   * @param {Object} extra - các trường bổ sung (result, end_time, ...)
   * @returns {Promise<void>}
   */
  async updateStatus(id, status, extra = {}) {
    const fields = ['status = $1'];
    const params = [status];
    let paramIdx = 2;

    if (extra.result !== undefined) {
      fields.push(`result = $${paramIdx}`);
      params.push(extra.result);
      paramIdx++;
    }
    if (extra.note !== undefined) {
      fields.push(`note = $${paramIdx}`);
      params.push(extra.note);
      paramIdx++;
    }
    if (extra.end_time !== undefined) {
      fields.push(`end_time = $${paramIdx}`);
      params.push(extra.end_time);
      paramIdx++;
    }
    if (extra.start_time !== undefined) {
      fields.push(`start_time = $${paramIdx}`);
      params.push(extra.start_time);
      paramIdx++;
    }

    params.push(id);
    await this.db.query(
      `UPDATE maintenance_logs SET ${fields.join(', ')} WHERE id = $${paramIdx}`,
      params
    );
  }

  /**
   * Kiểm tra tất cả steps đã hoàn thành chưa
   * @param {number} planId
   * @returns {Promise<boolean>}
   */
  async allCompleted(planId) {
    const { rows } = await this.db.query(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as done
      FROM maintenance_logs WHERE plan_id = $1
    `, [planId]);
    const { total, done } = rows[0];
    return parseInt(total) > 0 && parseInt(total) === parseInt(done);
  }
}

module.exports = new MaintenanceLogRepository();
