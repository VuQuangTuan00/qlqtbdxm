'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function main() {
  if (!process.argv.includes('--confirm-test-db') || !process.env.QLQT_SQLITE_PATH) {
    throw new Error('Reset bị từ chối. Chỉ dùng với QLQT_SQLITE_PATH và --confirm-test-db.');
  }
  const target = path.resolve(process.env.QLQT_SQLITE_PATH);
  const tempRoot = path.resolve(os.tmpdir());
  const relative = path.relative(tempRoot, target);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('Reset chỉ được phép với database test nằm trong thư mục TEMP.');
  }
  for (const suffix of ['', '-wal', '-shm']) {
    const file = `${target}${suffix}`;
    if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  }
  console.log(`[Reset] Đã xóa database test: ${target}`);
}

try { main(); } catch (error) { console.error(`[Reset] ${error.message}`); process.exitCode = 1; }
