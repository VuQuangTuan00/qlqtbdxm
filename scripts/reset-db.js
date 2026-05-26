'use strict';

/**
 * Script xóa và tạo lại toàn bộ database
 * Usage: npm run reset-db
 * CẢNH BÁO: Xóa toàn bộ dữ liệu!
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');
const readline = require('readline');

const pool = new Pool({
  host:     process.env.DB_HOST     || '127.0.0.1',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'qlqtbdxm',
  user:     process.env.DB_USER     || 'qlqt_user',
  password: process.env.DB_PASSWORD || 'matkhau123',
  connectionTimeoutMillis: 5000,
});

const TABLES = [
  'audit_logs', 'qr_codes', 'attachments', 'acceptance_records',
  'maintenance_logs', 'maintenance_plans', 'maintenance_steps',
  'equipments', 'users', 'roles', 'units', '_migrations',
];

async function resetDb() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const confirm = await new Promise((resolve) => {
    rl.question(
      '\nCANH BAO: Thao tac nay se XOA TOAN BO du lieu!\nNhap "XAC NHAN" de tiep tuc: ',
      (answer) => { rl.close(); resolve(answer); }
    );
  });

  if (confirm !== 'XAC NHAN') {
    console.log('Da huy.');
    process.exit(0);
  }

  const client = await pool.connect();
  try {
    console.log('\n[Reset] Dang xoa du lieu...');
    for (const table of TABLES) {
      await client.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
      console.log(`[Reset] Da xoa: ${table}`);
    }
    console.log('\n[Reset] Hoan thanh. Chay "npm run seed" de tao lai du lieu mau.\n');
  } finally {
    client.release();
    await pool.end();
  }
}

resetDb().catch((err) => {
  console.error('[Reset] Loi:', err.message);
  process.exit(1);
});
