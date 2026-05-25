'use strict';

const { ipcMain } = require('electron');
const authService = require('../services/auth.service');
const { getDb } = require('../database/index');
const { ok, fail } = require('../utils/response');

function register() {
  ipcMain.handle('report:summary', async () => {
    const session = authService.requireAuth();
    if (!session) return fail('Chưa đăng nhập');

    const db = getDb();
    const summary = {
      totalEquipments: db.prepare('SELECT COUNT(*) as c FROM equipments').get().c,
      activeEquipments: db.prepare("SELECT COUNT(*) as c FROM equipments WHERE status = 'active'").get().c,
      maintenanceEquipments: db.prepare("SELECT COUNT(*) as c FROM equipments WHERE status = 'maintenance'").get().c,
      totalPlans: db.prepare('SELECT COUNT(*) as c FROM maintenance_plans').get().c,
      pendingPlans: db.prepare("SELECT COUNT(*) as c FROM maintenance_plans WHERE status = 'pending'").get().c,
      inProgressPlans: db.prepare("SELECT COUNT(*) as c FROM maintenance_plans WHERE status = 'in_progress'").get().c,
      completedPlans: db.prepare("SELECT COUNT(*) as c FROM maintenance_plans WHERE status = 'completed'").get().c,
      overduePlans: db.prepare(`
        SELECT COUNT(*) as c FROM maintenance_plans
        WHERE status IN ('pending','approved','in_progress') AND planned_date < date('now')
      `).get().c,
      totalUnits: db.prepare('SELECT COUNT(*) as c FROM units').get().c,
      totalUsers: db.prepare('SELECT COUNT(*) as c FROM users WHERE is_active = 1').get().c,
    };

    return ok(summary);
  });

  ipcMain.handle('report:equipmentStatus', async () => {
    const session = authService.requireAuth();
    if (!session) return fail('Chưa đăng nhập');

    const db = getDb();
    const byStatus = db.prepare(`
      SELECT status, COUNT(*) as count FROM equipments GROUP BY status
    `).all();

    const byUnit = db.prepare(`
      SELECT u.unit_name, COUNT(e.id) as total,
             SUM(CASE WHEN e.status = 'active' THEN 1 ELSE 0 END) as active,
             SUM(CASE WHEN e.status = 'maintenance' THEN 1 ELSE 0 END) as maintenance
      FROM equipments e
      LEFT JOIN units u ON u.id = e.unit_id
      GROUP BY e.unit_id
      ORDER BY total DESC
    `).all();

    return ok({ byStatus, byUnit });
  });

  ipcMain.handle('report:maintenanceByPeriod', async (_event, { fromDate, toDate } = {}) => {
    const session = authService.requireAuth();
    if (!session) return fail('Chưa đăng nhập');

    const db = getDb();
    const params = [];
    let where = '1=1';

    if (fromDate) { where += ' AND mp.planned_date >= ?'; params.push(fromDate); }
    if (toDate) { where += ' AND mp.planned_date <= ?'; params.push(toDate); }

    const plans = db.prepare(`
      SELECT mp.maintenance_type, mp.status, COUNT(*) as count
      FROM maintenance_plans mp
      WHERE ${where}
      GROUP BY mp.maintenance_type, mp.status
      ORDER BY mp.maintenance_type
    `).all(...params);

    const completedPlans = db.prepare(`
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
    `).all(...params);

    return ok({ plans, completedPlans });
  });

  ipcMain.handle('report:overdueEquipment', async () => {
    const session = authService.requireAuth();
    if (!session) return fail('Chưa đăng nhập');

    const db = getDb();
    const overdue = db.prepare(`
      SELECT mp.plan_code, mp.planned_date, mp.maintenance_type, mp.status,
             e.equipment_code, e.equipment_name,
             u.unit_name
      FROM maintenance_plans mp
      LEFT JOIN equipments e ON e.id = mp.equipment_id
      LEFT JOIN units u ON u.id = e.unit_id
      WHERE mp.status IN ('pending','approved','in_progress')
        AND mp.planned_date < date('now')
      ORDER BY mp.planned_date ASC
    `).all();

    return ok(overdue);
  });
}

module.exports = { register };
