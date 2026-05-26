'use strict';

const { ipcMain } = require('electron');
const authService = require('../services/auth.service');
const { getDb } = require('../database/index');
const { ok, fail } = require('../utils/response');

function register() {
  ipcMain.handle('report:summary', async () => {
    try {
      const session = authService.requireAuth();
      if (!session) return fail('Chưa đăng nhập');

      const db = getDb();
      const [
        r1, r2, r3, r4, r5, r6, r7, r8, r9, r10
      ] = await Promise.all([
        db.query('SELECT COUNT(*) as c FROM equipments'),
        db.query("SELECT COUNT(*) as c FROM equipments WHERE status = 'active'"),
        db.query("SELECT COUNT(*) as c FROM equipments WHERE status = 'maintenance'"),
        db.query('SELECT COUNT(*) as c FROM maintenance_plans'),
        db.query("SELECT COUNT(*) as c FROM maintenance_plans WHERE status = 'pending'"),
        db.query("SELECT COUNT(*) as c FROM maintenance_plans WHERE status = 'in_progress'"),
        db.query("SELECT COUNT(*) as c FROM maintenance_plans WHERE status = 'completed'"),
        db.query(`
          SELECT COUNT(*) as c FROM maintenance_plans
          WHERE status IN ('pending','approved','in_progress') AND planned_date < CURRENT_DATE
        `),
        db.query('SELECT COUNT(*) as c FROM units'),
        db.query('SELECT COUNT(*) as c FROM users WHERE is_active = true'),
      ]);

      const summary = {
        totalEquipments: parseInt(r1.rows[0].c),
        activeEquipments: parseInt(r2.rows[0].c),
        maintenanceEquipments: parseInt(r3.rows[0].c),
        totalPlans: parseInt(r4.rows[0].c),
        pendingPlans: parseInt(r5.rows[0].c),
        inProgressPlans: parseInt(r6.rows[0].c),
        completedPlans: parseInt(r7.rows[0].c),
        overduePlans: parseInt(r8.rows[0].c),
        totalUnits: parseInt(r9.rows[0].c),
        totalUsers: parseInt(r10.rows[0].c),
      };

      return ok(summary);
    } catch (err) {
      return fail(err.message);
    }
  });

  ipcMain.handle('report:equipmentStatus', async () => {
    try {
      const session = authService.requireAuth();
      if (!session) return fail('Chưa đăng nhập');

      const db = getDb();
      const [byStatusRes, byUnitRes] = await Promise.all([
        db.query('SELECT status, COUNT(*) as count FROM equipments GROUP BY status'),
        db.query(`
          SELECT u.unit_name, COUNT(e.id) as total,
                 SUM(CASE WHEN e.status = 'active' THEN 1 ELSE 0 END) as active,
                 SUM(CASE WHEN e.status = 'maintenance' THEN 1 ELSE 0 END) as maintenance
          FROM equipments e
          LEFT JOIN units u ON u.id = e.unit_id
          GROUP BY e.unit_id, u.unit_name
          ORDER BY total DESC
        `),
      ]);

      return ok({ byStatus: byStatusRes.rows, byUnit: byUnitRes.rows });
    } catch (err) {
      return fail(err.message);
    }
  });

  ipcMain.handle('report:maintenanceByPeriod', async (_event, { fromDate, toDate } = {}) => {
    try {
      const session = authService.requireAuth();
      if (!session) return fail('Chưa đăng nhập');

      const db = getDb();
      const conditions = ['1=1'];
      const params = [];
      let paramIdx = 1;

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

      const [plansRes, completedRes] = await Promise.all([
        db.query(`
          SELECT mp.maintenance_type, mp.status, COUNT(*) as count
          FROM maintenance_plans mp
          WHERE ${where}
          GROUP BY mp.maintenance_type, mp.status
          ORDER BY mp.maintenance_type
        `, params),
        db.query(`
          SELECT mp.plan_code, e.equipment_code, e.equipment_name,
                 mp.planned_date, mp.maintenance_type,
                 ar.conclusion, ar.accepted_by,
                 u.full_name as accepted_by_name
          FROM maintenance_plans mp
          LEFT JOIN equipments e ON e.id = mp.equipment_id
          LEFT JOIN acceptance_records ar ON ar.plan_id = mp.id
          LEFT JOIN users u ON u.id = ar.accepted_by
          WHERE mp.status = 'completed' AND ${where}
          ORDER BY mp.planned_date DESC
          LIMIT 50
        `, params),
      ]);

      return ok({ plans: plansRes.rows, completedPlans: completedRes.rows });
    } catch (err) {
      return fail(err.message);
    }
  });

  ipcMain.handle('report:overdueEquipment', async () => {
    try {
      const session = authService.requireAuth();
      if (!session) return fail('Chưa đăng nhập');

      const { rows: overdue } = await getDb().query(`
        SELECT mp.plan_code, mp.planned_date, mp.maintenance_type, mp.status,
               e.equipment_code, e.equipment_name,
               u.unit_name
        FROM maintenance_plans mp
        LEFT JOIN equipments e ON e.id = mp.equipment_id
        LEFT JOIN units u ON u.id = e.unit_id
        WHERE mp.status IN ('pending','approved','in_progress')
          AND mp.planned_date < CURRENT_DATE
        ORDER BY mp.planned_date ASC
      `);

      return ok(overdue);
    } catch (err) {
      return fail(err.message);
    }
  });
}

module.exports = { register };
