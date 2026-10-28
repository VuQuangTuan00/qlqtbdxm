'use strict';

const BaseRepository = require('./base.repository');

class MaintenancePlanRepository extends BaseRepository {
  constructor() {
    super('maintenance_plans');
  }

  /**
   * Tìm kiếm kế hoạch với lọc và phân trang
   * @param {Object} opts
   * @returns {Promise<{ items: Array, total: number }>}
   */
  async search({
    keyword = '',
    equipmentId = null,
    status = null,
    maintenanceType = null,
    fromDate = null,
    toDate = null,
    page = 1,
    pageSize = 20,
  } = {}) {
    const conditions = ['1=1'];
    const params = [];
    let paramIdx = 1;

    if (keyword) {
      conditions.push(`(mp.plan_code LIKE $${paramIdx} COLLATE NOCASE OR e.equipment_name LIKE $${paramIdx} COLLATE NOCASE)`);
      params.push(`%${keyword}%`);
      paramIdx++;
    }
    if (equipmentId) {
      conditions.push(`mp.equipment_id = $${paramIdx}`);
      params.push(equipmentId);
      paramIdx++;
    }
    if (status) {
      conditions.push(`mp.status = $${paramIdx}`);
      params.push(status);
      paramIdx++;
    }
    if (maintenanceType) {
      conditions.push(`mp.maintenance_type = $${paramIdx}`);
      params.push(maintenanceType);
      paramIdx++;
    }
    if (fromDate) {
      conditions.push(`mp.planned_date >= $${paramIdx}`);
      params.push(fromDate);
      paramIdx++;
    }
    if (toDate) {
      conditions.push(`mp.planned_date <= $${paramIdx}`);
      params.push(toDate);
      paramIdx++;
    }

    const where = conditions.join(' AND ');
    const offset = (page - 1) * pageSize;

    const { rows: items } = await this.db.query(`
      SELECT mp.*,
             e.equipment_code, e.equipment_name, e.model,
             u.unit_name,
             uc.full_name as created_by_name,
             ua.full_name as approved_by_name
      FROM maintenance_plans mp
      LEFT JOIN equipments e ON e.id = mp.equipment_id
      LEFT JOIN units u ON u.id = e.unit_id
      LEFT JOIN users uc ON uc.id = mp.created_by
      LEFT JOIN users ua ON ua.id = mp.approved_by
      WHERE ${where}
      ORDER BY mp.created_at DESC
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `, [...params, pageSize, offset]);

    const { rows: countRows } = await this.db.query(`
      SELECT COUNT(*) as total
      FROM maintenance_plans mp
      LEFT JOIN equipments e ON e.id = mp.equipment_id
      WHERE ${where}
    `, params);

    const total = parseInt(countRows[0].total);
    return { items, total, page, pageSize };
  }

  /**
   * Lấy thông tin đầy đủ của kế hoạch
   * @param {number} id
   * @returns {Promise<Object|null>}
   */
  async findByIdFull(id) {
    const { rows } = await this.db.query(`
      SELECT mp.*,
             e.equipment_code, e.equipment_name, e.model, e.serial_number,
             u.unit_name, u.unit_code,
             uc.full_name as created_by_name,
             ua.full_name as approved_by_name
      FROM maintenance_plans mp
      LEFT JOIN equipments e ON e.id = mp.equipment_id
      LEFT JOIN units u ON u.id = e.unit_id
      LEFT JOIN users uc ON uc.id = mp.created_by
      LEFT JOIN users ua ON ua.id = mp.approved_by
      WHERE mp.id = $1
    `, [id]);

    const plan = rows[0];
    if (!plan) return null;

    // Lấy logs
    const { rows: logs } = await this.db.query(`
      SELECT ml.*, ms.step_name, ms.step_order, ms.technical_requirement,
             u.full_name as performed_by_name
      FROM maintenance_logs ml
      LEFT JOIN maintenance_steps ms ON ms.id = ml.step_id
      LEFT JOIN users u ON u.id = ml.performed_by
      WHERE ml.plan_id = $1
      ORDER BY ms.step_order
    `, [id]);
    plan.logs = logs;

    // Lấy acceptance record
    const { rows: accRows } = await this.db.query(`
      SELECT ar.*, u.full_name as accepted_by_name
      FROM acceptance_records ar
      LEFT JOIN users u ON u.id = ar.accepted_by
      WHERE ar.plan_id = $1
    `, [id]);
    plan.acceptance = accRows[0] || null;

    return plan;
  }

  /**
   * Đếm theo trạng thái
   * @returns {Promise<Array>}
   */
  async countByStatus() {
    const { rows } = await this.db.query(
      'SELECT status, COUNT(*) as count FROM maintenance_plans GROUP BY status'
    );
    return rows;
  }

  /**
   * Lấy kế hoạch quá hạn
   * @returns {Promise<Array>}
   */
  async getOverdue() {
    const { rows } = await this.db.query(`
      SELECT mp.*, e.equipment_code, e.equipment_name
      FROM maintenance_plans mp
      LEFT JOIN equipments e ON e.id = mp.equipment_id
      WHERE mp.status IN ('pending','approved','in_progress')
        AND mp.planned_date < CURRENT_DATE
      ORDER BY mp.planned_date
    `);
    return rows;
  }

  /**
   * Cập nhật trạng thái
   * @param {number} id
   * @param {string} status
   * @param {number|null} approvedBy
   * @returns {Promise<void>}
   */
  async updateStatus(id, status, approvedBy = null) {
    if (approvedBy !== null) {
      await this.db.query(
        'UPDATE maintenance_plans SET status = $1, approved_by = $2 WHERE id = $3',
        [status, approvedBy, id]
      );
    } else {
      await this.db.query(
        'UPDATE maintenance_plans SET status = $1 WHERE id = $2',
        [status, id]
      );
    }
  }
}

module.exports = new MaintenancePlanRepository();
