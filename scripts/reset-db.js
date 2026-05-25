'use strict';

/**
 * Script reset database - xóa và tạo lại
 * Usage: npm run reset-db
 * CẢNH BÁO: Xóa toàn bộ dữ liệu!
 */

const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/qlqtbdxm.db');

if (!fs.existsSync(dbPath)) {
  console.log('[Reset] Database không tồn tại, không cần reset.');
  process.exit(0);
}

// Xác nhận
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question(`\n⚠️  CẢNH BÁO: Xóa toàn bộ dữ liệu tại ${dbPath}?\nGõ "XAC-NHAN" để tiếp tục: `, (answer) => {
  rl.close();
  if (answer !== 'XAC-NHAN') {
    console.log('[Reset] Đã hủy.');
    process.exit(0);
  }

  try {
    fs.unlinkSync(dbPath);
    // Xóa WAL files nếu có
    ['-wal', '-shm'].forEach((ext) => {
      const f = dbPath + ext;
      if (fs.existsSync(f)) fs.unlinkSync(f);
    });
    console.log('[Reset] Database đã được xóa.');
    console.log('[Reset] Chạy "npm run seed" để tạo lại dữ liệu mẫu.');
  } catch (err) {
    console.error('[Reset] Lỗi:', err.message);
    process.exit(1);
  }
});
