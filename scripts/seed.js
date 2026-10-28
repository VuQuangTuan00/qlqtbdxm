'use strict';

const path = require('path');
const { initDatabase, getDb, closeDatabase } = require('../main/database');
const { hashPassword } = require('../main/utils/hash');

async function main() {
  if (!process.argv.includes('--confirm-test-data') || !process.env.QLQT_SQLITE_PATH) {
    throw new Error('Chỉ seed database test: đặt QLQT_SQLITE_PATH và thêm --confirm-test-data.');
  }
  const username = process.env.SEED_ADMIN_USERNAME;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!username || !password || password.length < 8) {
    throw new Error('Cần SEED_ADMIN_USERNAME và SEED_ADMIN_PASSWORD (ít nhất 8 ký tự); không có mật khẩu mặc định.');
  }
  const databasePath = path.resolve(process.env.QLQT_SQLITE_PATH);
  await initDatabase({ databasePath });
  const db = getDb();
  const { rows } = await db.query('SELECT COUNT(*) AS total FROM users');
  if (Number(rows[0].total) > 0) throw new Error('Database đã có user; seed dừng để tránh ghi đè.');
  await db.transaction(async () => {
    const { rows: roles } = await db.query("SELECT id FROM roles WHERE role_code = 'admin'");
    await db.query(
      'INSERT INTO users (username, password_hash, full_name, role_id, is_active) VALUES ($1,$2,$3,$4,1)',
      [username, hashPassword(password), process.env.SEED_ADMIN_FULL_NAME || 'Quản trị viên thử nghiệm', roles[0].id]
    );
  });
  console.log(`[Seed] Đã tạo dữ liệu test tại ${databasePath}`);
  await closeDatabase();
}

main().catch(async (error) => {
  console.error(`[Seed] ${error.message}`);
  try { await closeDatabase(); } catch (_) {}
  process.exitCode = 1;
});
