'use strict';

/**
 * Script seed dữ liệu mẫu cho development
 * Usage: npm run seed
 */

const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

// Kết nối trực tiếp (không qua Electron app)
const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/qlqtbdxm.db');

// Đảm bảo thư mục tồn tại
const fs = require('fs');
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

// Chạy migrations trước
const migrationsDir = path.join(__dirname, '../main/database/migrations');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Tạo bảng migrations
db.exec(`
  CREATE TABLE IF NOT EXISTS _migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  )
`);

const applied = db.prepare('SELECT filename FROM _migrations').all().map((r) => r.filename);
const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

for (const file of files) {
  if (applied.includes(file)) { console.log(`[Skip] ${file}`); continue; }
  console.log(`[Migration] ${file}`);
  const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
  db.transaction(() => {
    db.exec(sql);
    db.prepare('INSERT INTO _migrations (filename) VALUES (?)').run(file);
  })();
}

console.log('\n[Seed] Bắt đầu seed dữ liệu mẫu...\n');

// ---- Đơn vị ----
const units = [
  { unit_code: 'BTL-XM', unit_name: 'Bộ Tư lệnh Xe Máy', parent_unit_id: null },
  { unit_code: 'F309',   unit_name: 'Quân đoàn 3',        parent_unit_id: null },
  { unit_code: 'E1-F309', unit_name: 'Trung đoàn 1 - QĐ3', parent_unit_id: 2 },
  { unit_code: 'E2-F309', unit_name: 'Trung đoàn 2 - QĐ3', parent_unit_id: 2 },
  { unit_code: 'CO1-E1',  unit_name: 'Đại đội 1 - TR1',    parent_unit_id: 3 },
];

const insertUnit = db.prepare(`
  INSERT OR IGNORE INTO units (unit_code, unit_name, parent_unit_id)
  VALUES (@unit_code, @unit_name, @parent_unit_id)
`);
for (const u of units) {
  insertUnit.run(u);
}
console.log('[Seed] Đơn vị:', db.prepare('SELECT COUNT(*) as c FROM units').get().c);

// ---- Người dùng ----
const roles = db.prepare('SELECT * FROM roles').all();
const roleMap = {};
for (const r of roles) roleMap[r.role_code] = r.id;

const users = [
  { username: 'admin',     password: 'admin123',    full_name: 'Quản Trị Viên',     role_code: 'admin',      unit_id: 1 },
  { username: 'chihuy01', password: 'password123',  full_name: 'Thiếu tá Nguyễn Văn An',  role_code: 'commander',  unit_id: 2 },
  { username: 'thokythuat1', password: 'password123', full_name: 'Hạ sĩ Trần Văn Bình', role_code: 'technician', unit_id: 3 },
  { username: 'thokythuat2', password: 'password123', full_name: 'Trung sĩ Lê Văn Cường', role_code: 'technician', unit_id: 3 },
  { username: 'kiemtra01', password: 'password123',  full_name: 'Trung úy Phạm Thị Dung', role_code: 'inspector',  unit_id: 2 },
  { username: 'baocao01',  password: 'password123',  full_name: 'Hạ sĩ Hoàng Văn Em',  role_code: 'viewer',     unit_id: 4 },
];

const insertUser = db.prepare(`
  INSERT OR IGNORE INTO users (username, password_hash, full_name, role_id, unit_id, is_active)
  VALUES (@username, @password_hash, @full_name, @role_id, @unit_id, 1)
`);

for (const u of users) {
  const hash = bcrypt.hashSync(u.password, 10);
  insertUser.run({
    username: u.username,
    password_hash: hash,
    full_name: u.full_name,
    role_id: roleMap[u.role_code],
    unit_id: u.unit_id,
  });
}
console.log('[Seed] Người dùng:', db.prepare('SELECT COUNT(*) as c FROM users').get().c);

// ---- Trang bị ----
const equipments = [
  { equipment_code: 'XM-ZIL-001', equipment_name: 'Xe ô tô ZIL-131',    model: 'ZIL-131',    serial_number: 'ZIL-001-2015', year_of_manufacture: 2015, unit_id: 3, status: 'active' },
  { equipment_code: 'XM-ZIL-002', equipment_name: 'Xe ô tô ZIL-131',    model: 'ZIL-131',    serial_number: 'ZIL-002-2016', year_of_manufacture: 2016, unit_id: 3, status: 'maintenance' },
  { equipment_code: 'XM-BTR-001', equipment_name: 'Xe bọc thép BTR-80',  model: 'BTR-80',     serial_number: 'BTR-001-2018', year_of_manufacture: 2018, unit_id: 4, status: 'active' },
  { equipment_code: 'XM-GAZ-001', equipment_name: 'Xe ô tô GAZ-66',      model: 'GAZ-66',     serial_number: 'GAZ-001-2014', year_of_manufacture: 2014, unit_id: 4, status: 'active' },
  { equipment_code: 'XM-URAL-001', equipment_name: 'Xe URAL-4320',       model: 'URAL-4320',  serial_number: 'URAL-001-2019', year_of_manufacture: 2019, unit_id: 5, status: 'active' },
  { equipment_code: 'XM-URAL-002', equipment_name: 'Xe URAL-4320',       model: 'URAL-4320',  serial_number: 'URAL-002-2020', year_of_manufacture: 2020, unit_id: 5, status: 'inactive' },
];

const insertEquip = db.prepare(`
  INSERT OR IGNORE INTO equipments (equipment_code, equipment_name, model, serial_number, year_of_manufacture, unit_id, status)
  VALUES (@equipment_code, @equipment_name, @model, @serial_number, @year_of_manufacture, @unit_id, @status)
`);
const insertQr = db.prepare(`
  INSERT OR IGNORE INTO qr_codes (equipment_id, qr_value) VALUES (?, ?)
`);

for (const e of equipments) {
  insertEquip.run(e);
  const eq = db.prepare('SELECT id FROM equipments WHERE equipment_code = ?').get(e.equipment_code);
  if (eq) {
    insertQr.run(eq.id, `QLQT-${eq.id}-${Buffer.from(e.serial_number).toString('hex').slice(0, 8).toUpperCase()}`);
  }
}
console.log('[Seed] Trang bị:', db.prepare('SELECT COUNT(*) as c FROM equipments').get().c);

// ---- Bước quy trình bảo dưỡng ----
const steps = [
  // Định kỳ
  { maintenance_type: 'dinh_ky', step_order: 1,  step_name: 'Kiểm tra tổng quát',              technical_requirement: 'Kiểm tra ngoại quan, rò rỉ dầu mỡ', estimated_time: 30 },
  { maintenance_type: 'dinh_ky', step_order: 2,  step_name: 'Kiểm tra và thay dầu động cơ',    technical_requirement: 'Dầu 15W40, đúng tiêu chuẩn nhà sản xuất', estimated_time: 45 },
  { maintenance_type: 'dinh_ky', step_order: 3,  step_name: 'Thay lọc dầu',                    technical_requirement: 'Lọc dầu chính hãng', estimated_time: 20 },
  { maintenance_type: 'dinh_ky', step_order: 4,  step_name: 'Kiểm tra hệ thống phanh',         technical_requirement: 'Má phanh ≥ 4mm, dầu phanh đầy mức', estimated_time: 30 },
  { maintenance_type: 'dinh_ky', step_order: 5,  step_name: 'Kiểm tra áp suất lốp',            technical_requirement: 'Áp suất theo quy định nhà sản xuất ±0.2 bar', estimated_time: 15 },
  { maintenance_type: 'dinh_ky', step_order: 6,  step_name: 'Kiểm tra hệ thống điện',          technical_requirement: 'Acquy đủ điện, dây điện không rò rỉ', estimated_time: 25 },
  { maintenance_type: 'dinh_ky', step_order: 7,  step_name: 'Kiểm tra và tra dầu mỡ truyền động', technical_requirement: 'Theo bảng bôi trơn', estimated_time: 40 },
  { maintenance_type: 'dinh_ky', step_order: 8,  step_name: 'Kiểm tra đèn tín hiệu',           technical_requirement: 'Tất cả đèn hoạt động đúng', estimated_time: 15 },
  { maintenance_type: 'dinh_ky', step_order: 9,  step_name: 'Vệ sinh và hoàn thiện',           technical_requirement: 'Sạch, gọn, đẹp', estimated_time: 20 },
  { maintenance_type: 'dinh_ky', step_order: 10, step_name: 'Chạy thử và nghiệm thu',          technical_requirement: 'Xe hoạt động ổn định, không có tiếng kêu bất thường', estimated_time: 30 },

  // Đột xuất
  { maintenance_type: 'dot_xuat', step_order: 1, step_name: 'Xác định nguyên nhân hư hỏng',    technical_requirement: 'Ghi chép đầy đủ triệu chứng', estimated_time: 30 },
  { maintenance_type: 'dot_xuat', step_order: 2, step_name: 'Tháo lắp và kiểm tra chi tiết',   technical_requirement: 'Theo quy trình kỹ thuật', estimated_time: 60 },
  { maintenance_type: 'dot_xuat', step_order: 3, step_name: 'Thay thế chi tiết hư hỏng',       technical_requirement: 'Chi tiết đúng chủng loại', estimated_time: 90 },
  { maintenance_type: 'dot_xuat', step_order: 4, step_name: 'Lắp ráp và kiểm tra',             technical_requirement: 'Lắp đúng moment xiết', estimated_time: 60 },
  { maintenance_type: 'dot_xuat', step_order: 5, step_name: 'Chạy thử và bàn giao',            technical_requirement: 'Hết hư hỏng, hoạt động bình thường', estimated_time: 30 },

  // Sửa chữa lớn
  { maintenance_type: 'sua_chua', step_order: 1, step_name: 'Tiếp nhận và lập phiếu sửa chữa', technical_requirement: 'Ghi đầy đủ tình trạng ban đầu', estimated_time: 30 },
  { maintenance_type: 'sua_chua', step_order: 2, step_name: 'Tháo rã tổng thành',              technical_requirement: 'Theo trình tự kỹ thuật', estimated_time: 120 },
  { maintenance_type: 'sua_chua', step_order: 3, step_name: 'Kiểm tra và phân loại chi tiết',  technical_requirement: 'Đo đạc theo tiêu chuẩn kỹ thuật', estimated_time: 90 },
  { maintenance_type: 'sua_chua', step_order: 4, step_name: 'Sửa chữa và phục hồi chi tiết',   technical_requirement: 'Đạt kích thước sửa chữa', estimated_time: 180 },
  { maintenance_type: 'sua_chua', step_order: 5, step_name: 'Lắp ráp tổng thành',              technical_requirement: 'Moment xiết theo quy định', estimated_time: 120 },
  { maintenance_type: 'sua_chua', step_order: 6, step_name: 'Chạy rà và điều chỉnh',           technical_requirement: 'Theo quy trình rà trơn', estimated_time: 120 },
  { maintenance_type: 'sua_chua', step_order: 7, step_name: 'Nghiệm thu kỹ thuật',             technical_requirement: 'Đạt tất cả chỉ tiêu kỹ thuật', estimated_time: 60 },

  // Kiểm tra
  { maintenance_type: 'kiem_tra', step_order: 1, step_name: 'Kiểm tra hồ sơ kỹ thuật',        technical_requirement: 'Hồ sơ đầy đủ, không thất lạc', estimated_time: 20 },
  { maintenance_type: 'kiem_tra', step_order: 2, step_name: 'Kiểm tra ngoại quan',             technical_requirement: 'Không có hư hỏng ngoại quan', estimated_time: 20 },
  { maintenance_type: 'kiem_tra', step_order: 3, step_name: 'Kiểm tra thông số kỹ thuật',      technical_requirement: 'Theo bảng thông số', estimated_time: 45 },
  { maintenance_type: 'kiem_tra', step_order: 4, step_name: 'Ghi kết quả và báo cáo',         technical_requirement: 'Ghi đầy đủ, chính xác', estimated_time: 20 },
];

const insertStep = db.prepare(`
  INSERT OR IGNORE INTO maintenance_steps (maintenance_type, step_order, step_name, technical_requirement, estimated_time)
  VALUES (@maintenance_type, @step_order, @step_name, @technical_requirement, @estimated_time)
`);
for (const s of steps) insertStep.run(s);
console.log('[Seed] Bước quy trình:', db.prepare('SELECT COUNT(*) as c FROM maintenance_steps').get().c);

// ---- Kế hoạch mẫu ----
const adminUser = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
const cmdUser   = db.prepare("SELECT id FROM users WHERE username = 'chihuy01'").get();
const equip1    = db.prepare("SELECT id FROM equipments WHERE equipment_code = 'XM-ZIL-001'").get();
const equip2    = db.prepare("SELECT id FROM equipments WHERE equipment_code = 'XM-ZIL-002'").get();

if (adminUser && equip1) {
  const planExists = db.prepare("SELECT id FROM maintenance_plans WHERE plan_code = 'KH-202401-0001'").get();
  if (!planExists) {
    const plan = db.prepare(`
      INSERT INTO maintenance_plans (plan_code, equipment_id, maintenance_type, planned_date, created_by, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('KH-202401-0001', equip1.id, 'dinh_ky', '2024-01-15', adminUser.id, 'completed');

    const planId = plan.lastInsertRowid;
    const dinhKySteps = db.prepare("SELECT * FROM maintenance_steps WHERE maintenance_type = 'dinh_ky' ORDER BY step_order").all();

    for (const step of dinhKySteps) {
      db.prepare(`
        INSERT INTO maintenance_logs (plan_id, step_id, performed_by, start_time, end_time, status, result)
        VALUES (?, ?, ?, ?, ?, 'completed', 'Đạt yêu cầu kỹ thuật')
      `).run(planId, step.id, adminUser.id, '2024-01-15 08:00:00', '2024-01-15 12:00:00');
    }

    // Acceptance
    db.prepare(`
      INSERT INTO acceptance_records (plan_id, accepted_by, acceptance_date, conclusion, note)
      VALUES (?, ?, ?, 'dat', 'Xe đạt yêu cầu kỹ thuật sau bảo dưỡng định kỳ')
    `).run(planId, cmdUser ? cmdUser.id : adminUser.id, '2024-01-15');
    console.log('[Seed] Kế hoạch mẫu (hoàn thành) đã tạo');
  }
}

if (adminUser && equip2) {
  const planExists2 = db.prepare("SELECT id FROM maintenance_plans WHERE plan_code = 'KH-202412-0002'").get();
  if (!planExists2) {
    db.prepare(`
      INSERT INTO maintenance_plans (plan_code, equipment_id, maintenance_type, planned_date, created_by, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('KH-202412-0002', equip2.id, 'dot_xuat', '2024-12-01', adminUser.id, 'in_progress');
    console.log('[Seed] Kế hoạch mẫu (đang thực hiện) đã tạo');
  }
}

console.log('\n[Seed] Hoàn thành! Dữ liệu mẫu đã được tạo.');
console.log('\nTài khoản đăng nhập mẫu:');
console.log('  admin       / admin123');
console.log('  chihuy01    / password123');
console.log('  thokythuat1 / password123');
console.log('  kiemtra01   / password123\n');

db.close();
