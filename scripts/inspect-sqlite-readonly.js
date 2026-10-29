'use strict';

const path = require('path');
const Database = require('better-sqlite3');

const databasePath = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (!databasePath) {
  console.error('Usage: electron scripts/inspect-sqlite-readonly.js <database-path>');
  process.exit(2);
}

const db = new Database(databasePath, { readonly: true, fileMustExist: true });
try {
  const count = (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
  const result = {
    databasePath,
    integrity: db.pragma('integrity_check', { simple: true }),
    foreignKeys: db.pragma('foreign_key_check'),
    migrations: db.prepare('SELECT filename, checksum, applied_at FROM _migrations ORDER BY filename').all(),
    counts: {
      users: count('users'),
      units: count('units'),
      vehicles: count('vehicle'),
      equipments: count('equipments'),
      plans: count('maintenance_plans'),
    },
  };
  console.log(JSON.stringify(result, null, 2));
} finally {
  db.close();
}
process.exit(0);
