'use strict';

const BaseRepository = require('./base.repository');

class MaintenancePlanRepository extends BaseRepository {
  constructor() {
    super('maintenance_plans');
  }

  /**
   * Tìm kiếm kế hoạch với lọc và phân trang
   * @param {Object} opts
   * @returns {{ items: Array, total: number }}
   */
  search({
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
    const params = {};

    if (keyword) {
      conditions.push('(mp.plan_code LIKE @kw OR e.equipment_name LIKE @kw)');
      params.kw = `%${keyword}%`;
    }
    if (equipmentId) { conditions.push('mp.equipment_id = @equipmentId'); params.equipmentId = equipmentId; }
    if (status) { conditions.push('mp.status = @status'); params.status = status; }
    if (maintenanceType) { conditions.push('mp.maintenance_type = @maintenanceType'); params.maintenanceType = maintenanceType; }
    if (fromDate) { conditions.push('mp.planned_date >= @fromDate'); params.fromDate = fromDate; }
    if (toDate) { conditions.push('mp.planned_date <= @toDate'); params.toDate = toDate; }

    const where = conditions.join(' AND ');
    const offset = (page - 1) * pageSize;

    const items = this.db.prepare(`
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
      LIMIT ${pageSize} OFFSET ${offset}
    `).all(params);

    const { total } = this.db.prepare(`
      SELECT COUNT(*) as total
      FROM maintenance_plans mp
      LEFT JOIN equipments e ON e.id = mp.equipment_id
      WHERE ${where}
    `).get(params);

    return { items, total, page, pageSize };
  }

  /**
   * Lấy thông tin đầy đủ của kế hoạch
   * @param {number} id
   * @returns {Object|null}
   */
  findByIdFull(id) {
    const plan = this.db.prepare(`
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
      WHERE mp.id = ?
    `).get(id);

    if (!plan) return null;

    // Lấy logs
    plan.logs = this.db.prepare(`
      SELECT ml.*, ms.step_name, ms.step_order, ms.technical_requirement,
             u.full_name as performed_by_name
      FROM maintenance_logs ml
      LEFT JOIN maintenance_steps ms ON ms.id = ml.step_id
      LEFT JOIN users u ON u.id = ml.performed_by
      WHERE ml.plan_id = ?
      ORDER BY ms.step_order
    `).all(id);

    // Lấy acceptance record
    plan.acceptance = this.db.prepare(`
      SELECT ar.*, u.full_name as accepted_by_name
      FROM acceptance_records ar
      LEFT JOIN users u ON u.id = ar.accepted_by
      WHERE ar.plan_id = ?
    `).get(id) || null;

    return plan;
  }

  /**
   * Đếm theo trạng thái
   * @returns {Array}
   */
  countByStatus() {
    return this.db.prepare(`
      SELECT status, COUNT(*) as count FROM maintenance_plans GROUP BY status
    `).all();
  }

  /**
   * Lấy kế hoạch quá hạn
   * @returns {Array}
   */
  getOverdue() {
    return this.db.prepare(`
      SELECT mp.*, e.equipment_code, e.equipment_name
      FROM maintenance_plans mp
      LEFT JOIN equipments e ON e.id = mp.equipment_id
      WHERE mp.status IN ('pending','approved','in_progress')
        AND mp.planned_date < date('now')
      ORDER BY mp.planned_date
    `).all();
  }

  /**
   * Cập nhật trạng thái
   * @param {number} id
   * @param {string} status
   * @param {number|null} approvedBy
   */
  updateStatus(id, status, approvedBy = null) {
    if (approvedBy !== null) {
      this.db.prepare('UPDATE maintenance_plans SET status = ?, approved_by = ? WHERE id = ?')
        .run(status, approvedBy, id);
    } else {
      this.db.prepare('UPDATE maintenance_plans SET status = ? WHERE id = ?').run(status, id);
    }
  }
}

module.exports = new MaintenancePlanRepository();
