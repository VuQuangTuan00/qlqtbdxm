'use strict';

/**
 * Script seed dữ liệu mẫu cho PostgreSQL
 * Usage: npm run seed
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host:     process.env.DB_HOST     || '127.0.0.1',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'qlqtbdxm',
  user:     process.env.DB_USER     || 'qlqt_user',
  password: process.env.DB_PASSWORD || '111111',
  connectionTimeoutMillis: 5000,
});

async function seed() {
  const client = await pool.connect();
  try {
    // ---- Migrations ----
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMP DEFAULT NOW()
      )
    `);

    const migrationsDir = path.join(__dirname, '../main/database/migrations');
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    const { rows: appliedRows } = await client.query('SELECT filename FROM _migrations');
    const applied = appliedRows.map((r) => r.filename);

    for (const file of files) {
      if (applied.includes(file)) {
        console.log(`[Skip migration] ${file}`);
        continue;
      }
      console.log(`[Migration] ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }

    console.log('\n[Seed] Bắt đầu seed dữ liệu mẫu...\n');

    // ---- Đơn vị ----
    const units = [
      { code: 'D1',   name: 'Tiểu Đoàn 1',        parent: null },
      { code: 'D2',     name: 'Tiểu Đoàn 2',               parent: null },
      { code: 'D3',  name: 'Tiểu Đoàn 3',        parent: null },
      { code: 'HCKT',  name: 'Hậu Cần - Kỹ Thuật',        parent: null},
      { code: 'CT',   name: 'Chính Trị',  parent: null },
      { code: 'TM',   name: 'Tham Mưu',  parent: null },
    ];

    const unitIds = {};
    for (const u of units) {
      const parentId = u.parent ? unitIds[u.parent] : null;
      const { rows } = await client.query(
        `INSERT INTO units (unit_code, unit_name, parent_unit_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (unit_code) DO UPDATE SET unit_name = EXCLUDED.unit_name
         RETURNING id`,
        [u.code, u.name, parentId]
      );
      unitIds[u.code] = rows[0].id;
    }
    const { rows: [{ n: unitCount }] } = await client.query('SELECT COUNT(*) as n FROM units');
    console.log('[Seed] Đơn vị:', unitCount);

    // ---- Vai trò ----
    const roles = [
      ['admin',      'Quản trị viên'],
      ['commander',  'Chỉ huy'],
      ['technician', 'Thợ kỹ thuật'],
      ['inspector',  'Kiểm tra'],
      ['viewer',     'Xem báo cáo'],
    ];
    const roleIds = {};
    for (const [code, name] of roles) {
      const { rows } = await client.query(
        `INSERT INTO roles (role_code, role_name) VALUES ($1, $2)
         ON CONFLICT (role_code) DO UPDATE SET role_name = EXCLUDED.role_name
         RETURNING id`,
        [code, name]
      );
      roleIds[code] = rows[0].id;
    }

    // ---- Người dùng ----
    const users = [
      { username: 'admin',       password: '111111',   full_name: 'Quản Trị Viên',            role: 'admin',      unit: 'D1' },
      { username: 'chihuy01',    password: '111111',    full_name: 'Thiếu tá Vũ Quang Tuấn',   role: 'commander',  unit: 'D2' },
      { username: 'thuchien1',   password: '111111',    full_name: 'Hạ sĩ Nguyễn Đức Anh',     role: 'technician', unit: 'D3' },
      { username: 'thuchien2',   password: '111111',    full_name: 'Trung úy Tạ Đỗ Tiến Đạt',   role: 'technician', unit: 'TM' },
      { username: 'nghiemthu1',  password: '111111',    full_name: 'Trung úy Nguyễn Gia Anh',  role: 'inspector',  unit: 'HCKT' },
      { username: 'baocao01',    password: '111111',    full_name: 'Hạ sĩ Phạm Văn Chiến',      role: 'viewer',     unit: 'CT' },
    ];

    const userIds = {};
    for (const u of users) {
      const hash = await bcrypt.hash(u.password, 10);
      const { rows } = await client.query(
        `INSERT INTO users (username, password_hash, full_name, role_id, unit_id, is_active)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (username) DO UPDATE SET full_name = EXCLUDED.full_name
         RETURNING id`,
        [u.username, hash, u.full_name, roleIds[u.role], unitIds[u.unit]]
      );
      userIds[u.username] = rows[0].id;
    }
    const { rows: [{ n: userCount }] } = await client.query('SELECT COUNT(*) as n FROM users');
    console.log('[Seed] Người dùng:', userCount);

    // ---- Trang bị ---- 
    const equipments = [
      { code: 'KAMAZ-65525',  name: 'Xe Tải KAMAZ 65525',    model: 'KAMAZ-65525',   sn: 'KAMAZ-65525-2015',  year: 2015, unit: 'D3', status: 'active' },
      { code: 'MS-20S',  name: 'Xe Bắc Cầu MS-20S',    model: 'MS-20S',   sn: 'MS-20S-2016',  year: 2016, unit: 'HCKT', status: 'maintenance' },
      { code: 'GSP-55',  name: 'Phà Vượt Sông GSP-55', model: 'GSP-55',    sn: 'GSP-55-2018',  year: 2018, unit: 'HCKT', status: 'active' },
      { code: 'PMP',  name: 'Xe Cầu Phao PMP',     model: 'PMP',    sn: 'PMP-2014',  year: 2014, unit: 'HCKT', status: 'active' },
      { code: 'PZM-2', name: 'Máy Đào Hào PZM-2',       model: 'PZM-2', sn: 'PZM-2-2019', year: 2019, unit: 'HCKT', status: 'active' },
      { code: 'EOV-4421', name: 'Máy Xúc EOV-4421',       model: 'EOV-4421', sn: 'EOV-4421-2020', year: 2020, unit: 'HCKT', status: 'inactive' },
    ];

    const equipIds = {};
    for (const e of equipments) {
      const { rows } = await client.query(
        `INSERT INTO equipments (equipment_code, equipment_name, model, serial_number, year_of_manufacture, unit_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (equipment_code) DO UPDATE SET status = EXCLUDED.status
         RETURNING id`,
        [e.code, e.name, e.model, e.sn, e.year, unitIds[e.unit], e.status]
      );
      const eqId = rows[0].id;
      equipIds[e.code] = eqId;
      const qrValue = `QLQT-${eqId}-${Buffer.from(e.sn).toString('hex').slice(0, 8).toUpperCase()}`;
      await client.query(
        `INSERT INTO qr_codes (equipment_id, qr_value) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [eqId, qrValue]
      );
    }
    const { rows: [{ n: eqCount }] } = await client.query('SELECT COUNT(*) as n FROM equipments');
    console.log('[Seed] Trang bị:', eqCount);

    // ---- Bước quy trình bảo dưỡng ----
    const steps = [
      { type: 'dinh_ky',  order: 1,  name: 'Kiểm tra tổng quát',                 req: 'Kiểm tra ngoại quan, rò rỉ dầu mỡ',                  time: 30 },
      { type: 'dinh_ky',  order: 2,  name: 'Kiểm tra và thay dầu động cơ',        req: 'Dầu 15W40, đúng tiêu chuẩn nhà sản xuất',            time: 45 },
      { type: 'dinh_ky',  order: 3,  name: 'Thay lọc dầu',                        req: 'Lọc dầu chính hãng',                                  time: 20 },
      { type: 'dinh_ky',  order: 4,  name: 'Kiểm tra hệ thống phanh',             req: 'Má phanh ≥ 4mm, dầu phanh đầy mức',                  time: 30 },
      { type: 'dinh_ky',  order: 5,  name: 'Kiểm tra áp suất lốp',               req: 'Áp suất theo quy định ±0.2 bar',                      time: 15 },
      { type: 'dinh_ky',  order: 6,  name: 'Kiểm tra hệ thống điện',             req: 'Acquy đủ điện, dây điện không rò rỉ',                 time: 25 },
      { type: 'dinh_ky',  order: 7,  name: 'Tra dầu mỡ truyền động',             req: 'Theo bảng bôi trơn',                                  time: 40 },
      { type: 'dinh_ky',  order: 8,  name: 'Kiểm tra đèn tín hiệu',              req: 'Tất cả đèn hoạt động đúng',                          time: 15 },
      { type: 'dinh_ky',  order: 9,  name: 'Vệ sinh và hoàn thiện',              req: 'Sạch, gọn, đẹp',                                     time: 20 },
      { type: 'dinh_ky',  order: 10, name: 'Chạy thử và nghiệm thu',             req: 'Xe hoạt động ổn định, không có tiếng kêu bất thường', time: 30 },
      { type: 'dot_xuat', order: 1,  name: 'Xác định nguyên nhân hư hỏng',       req: 'Ghi chép đầy đủ triệu chứng',                        time: 30 },
      { type: 'dot_xuat', order: 2,  name: 'Tháo lắp và kiểm tra chi tiết',      req: 'Theo quy trình kỹ thuật',                             time: 60 },
      { type: 'dot_xuat', order: 3,  name: 'Thay thế chi tiết hư hỏng',          req: 'Chi tiết đúng chủng loại',                            time: 90 },
      { type: 'dot_xuat', order: 4,  name: 'Lắp ráp và kiểm tra',               req: 'Lắp đúng moment xiết',                                time: 60 },
      { type: 'dot_xuat', order: 5,  name: 'Chạy thử và bàn giao',              req: 'Hết hư hỏng, hoạt động bình thường',                  time: 30 },
      { type: 'sua_chua', order: 1,  name: 'Tiếp nhận và lập phiếu sửa chữa',   req: 'Ghi đầy đủ tình trạng ban đầu',                      time: 30 },
      { type: 'sua_chua', order: 2,  name: 'Tháo rã tổng thành',                req: 'Theo trình tự kỹ thuật',                              time: 120 },
      { type: 'sua_chua', order: 3,  name: 'Kiểm tra và phân loại chi tiết',     req: 'Đo đạc theo tiêu chuẩn kỹ thuật',                    time: 90 },
      { type: 'sua_chua', order: 4,  name: 'Sửa chữa và phục hồi chi tiết',      req: 'Đạt kích thước sửa chữa',                            time: 180 },
      { type: 'sua_chua', order: 5,  name: 'Lắp ráp tổng thành',               req: 'Moment xiết theo quy định',                           time: 120 },
      { type: 'sua_chua', order: 6,  name: 'Chạy rà và điều chỉnh',            req: 'Theo quy trình rà trơn',                              time: 120 },
      { type: 'sua_chua', order: 7,  name: 'Nghiệm thu kỹ thuật',              req: 'Đạt tất cả chỉ tiêu kỹ thuật',                       time: 60 },
      { type: 'kiem_tra', order: 1,  name: 'Kiểm tra hồ sơ kỹ thuật',          req: 'Hồ sơ đầy đủ, không thất lạc',                       time: 20 },
      { type: 'kiem_tra', order: 2,  name: 'Kiểm tra ngoại quan',               req: 'Không có hư hỏng ngoại quan',                        time: 20 },
      { type: 'kiem_tra', order: 3,  name: 'Kiểm tra thông số kỹ thuật',        req: 'Theo bảng thông số',                                  time: 45 },
      { type: 'kiem_tra', order: 4,  name: 'Ghi kết quả và báo cáo',           req: 'Ghi đầy đủ, chính xác',                               time: 20 },
    ];

    for (const s of steps) {
      await client.query(
        `INSERT INTO maintenance_steps (maintenance_type, step_order, step_name, technical_requirement, estimated_time)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING`,
        [s.type, s.order, s.name, s.req, s.time]
      );
    }
    const { rows: [{ n: stepCount }] } = await client.query('SELECT COUNT(*) as n FROM maintenance_steps');
    console.log('[Seed] Bước quy trình:', stepCount);

    // ---- Kế hoạch mẫu (hoàn thành) ----
    const adminId = userIds['admin'];
    const cmdId   = userIds['chihuy01'];
    const eq1Id   = equipIds['KAMAZ-65525'];
    const eq2Id   = equipIds['PMP'];

    const { rows: [existPlan1] } = await client.query(
      `SELECT id FROM maintenance_plans WHERE plan_code = $1`, ['KH-202401-0001']
    );
    if (!existPlan1) {
      const { rows: [plan1] } = await client.query(
        `INSERT INTO maintenance_plans (plan_code, equipment_id, maintenance_type, planned_date, created_by, approved_by, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        ['KH-202401-0001', eq1Id, 'dinh_ky', '2024-01-15', adminId, cmdId, 'completed']
      );
      const { rows: dinhKySteps } = await client.query(
        `SELECT * FROM maintenance_steps WHERE maintenance_type = 'dinh_ky' ORDER BY step_order`
      );
      for (const s of dinhKySteps) {
        await client.query(
          `INSERT INTO maintenance_logs (plan_id, step_id, performed_by, start_time, end_time, status, result)
           VALUES ($1, $2, $3, $4, $5, 'completed', 'Đạt yêu cầu kỹ thuật')`,
          [plan1.id, s.id, adminId, '2024-01-15 08:00:00', '2024-01-15 12:00:00']
        );
      }
      await client.query(
        `INSERT INTO acceptance_records (plan_id, accepted_by, acceptance_date, conclusion, note)
         VALUES ($1, $2, $3, $4, $5)`,
        [plan1.id, cmdId, '2024-01-15', 'dat', 'Xe đạt yêu cầu kỹ thuật sau bảo dưỡng định kỳ']
      );
      console.log('[Seed] Kế hoạch mẫu (hoàn thành): OK');
    }

    const { rows: [existPlan2] } = await client.query(
      `SELECT id FROM maintenance_plans WHERE plan_code = $1`, ['KH-202412-0002']
    );
    if (!existPlan2) {
      await client.query(
        `INSERT INTO maintenance_plans (plan_code, equipment_id, maintenance_type, planned_date, created_by, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['KH-202412-0002', eq2Id, 'dot_xuat', '2024-12-01', adminId, 'in_progress']
      );
      console.log('[Seed] Kế hoạch mẫu (đang thực hiện): OK');
    }

    console.log('\n[Seed] Hoàn thành! Dữ liệu mẫu đã được tạo.');
    console.log('\nTài khoản đăng nhập:');
    console.log('  admin      / 1111111   (Quản trị viên)');

  } catch (err) {
    console.error('[Seed] Lỗi:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
