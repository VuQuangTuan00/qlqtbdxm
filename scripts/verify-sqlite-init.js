'use strict';

const path = require('path');
const { initDatabase, getDb, closeDatabase } = require('../main/database');

async function main() {
  const databasePath = process.argv[2] ? path.resolve(process.argv[2]) : null;
  if (!databasePath) throw new Error('Thiếu đường dẫn database cần kiểm tra');
  await initDatabase({ databasePath });
  const db = getDb();
  const migrations = (await db.query(
    'SELECT filename, checksum, applied_at FROM _migrations ORDER BY filename'
  )).rows;
  const integrity = db.raw.pragma('integrity_check', { simple: true });
  const foreignKeys = db.raw.pragma('foreign_key_check');
  const counts = {};
  for (const table of ['users', 'units', 'vehicle', 'equipments', 'maintenance_plans']) {
    counts[table] = Number((await db.query(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n);
  }
  console.log(JSON.stringify({ databasePath, integrity, foreignKeys, migrations, counts }, null, 2));
}

main()
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
