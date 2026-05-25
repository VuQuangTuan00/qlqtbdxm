'use strict';

const BaseRepository = require('./base.repository');

class MaintenanceLogRepository extends BaseRepository {
  constructor() {
    super('maintenance_logs');
  }

  /**
   * Lấy logs theo plan với thông tin đầy đủ
   * @param {number} planId
   * @returns {Array}
   */
  findByPlan(planId) {
    return this.db.prepare(`
      SELECT ml.*,
             ms.step_name, ms.step_order, ms.technical_requirement, ms.estimated_time,
             u.full_name as performed_by_name
      FROM maintenance_logs ml
      LEFT JOIN maintenance_steps ms ON ms.id = ml.step_id
      LEFT JOIN users u ON u.id = ml.performed_by
      WHERE ml.plan_id = ?
      ORDER BY ms.step_order
    `).all(planId);
  }

  /**
   * Lấy log theo ID đầy đủ
   * @param {number} id
   * @returns {Object|null}
   */
  findByIdFull(id) {
    return this.db.prepare(`
      SELECT ml.*,
             ms.step_name, ms.step_order, ms.technical_requirement,
             u.full_name as performed_by_name,
             mp.plan_code, mp.equipment_id
      FROM maintenance_logs ml
      LEFT JOIN maintenance_steps ms ON ms.id = ml.step_id
      LEFT JOIN users u ON u.id = ml.performed_by
      LEFT JOIN maintenance_plans mp ON mp.id = ml.plan_id
      WHERE ml.id = ?
    `).get(id) || null;
  }

  /**
   * Cập nhật trạng thái log
   * @param {number} id
   * @param {string} status
   * @param {Object} extra - các trường bổ sung (result, end_time, ...)
   */
  updateStatus(id, status, extra = {}) {
    const fields = ['status = @status'];
    const params = { status, _id: id };

    if (extra.result !== undefined) { fields.push('result = @result'); params.result = extra.result; }
    if (extra.note !== undefined) { fields.push('note = @note'); params.note = extra.note; }
    if (extra.end_time !== undefined) { fields.push('end_time = @end_time'); params.end_time = extra.end_time; }
    if (extra.start_time !== undefined) { fields.push('start_time = @start_time'); params.start_time = extra.start_time; }

    this.db.prepare(`UPDATE maintenance_logs SET ${fields.join(', ')} WHERE id = @_id`).run(params);
  }

  /**
   * Kiểm tra tất cả steps đã hoàn thành chưa
   * @param {number} planId
   * @returns {boolean}
   */
  allCompleted(planId) {
    const result = this.db.prepare(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as done
      FROM maintenance_logs WHERE plan_id = ?
    `).get(planId);
    return result.total > 0 && result.total === result.done;
  }
}

module.exports = new MaintenanceLogRepository();
