'use strict';

const sql = require('mssql');

// Thứ tự INSERT theo FK dependency (DELETE theo thứ tự ngược lại)
const SYNC_TABLES = [
  'units',
  'roles',
  'vehicle_type',
  'users',
  'vehicle',
  'equipments',
  'maintenance_steps',
  'maintenance_plans',
  'maintenance_logs',
  'acceptance_records',
  'attachments',
  'qr_codes',
  'audit_logs',
  'engine_maintenance',
];

/**
 * Đồng bộ toàn bộ dữ liệu từ SQL Server vào SQLite.
 * Chỉ gọi khi app đang ở chế độ Demo (SQLite).
 * @param {object} mssqlConfig - { server, port, database, user, password }
 */
async function syncFromSqlServer(mssqlConfig) {
  const { getRawSqliteDb } = require('../database/sqlite');
  const rawDb = getRawSqliteDb();
  if (!rawDb) {
    throw new Error('SQLite chưa được khởi tạo. Ứng dụng phải đang ở chế độ Demo.');
  }

  let pool;
  try {
    pool = await sql.connect({
      server:   mssqlConfig.server || mssqlConfig.host || '127.0.0.1',
      port:     parseInt(mssqlConfig.port) || 1433,
      database: mssqlConfig.database,
      user:     mssqlConfig.user,
      password: mssqlConfig.password,
      options: {
        encrypt:                false,
        trustServerCertificate: true,
        enableArithAbort:       true,
      },
      pool:              { max: 1, min: 0 },
      connectionTimeout: 10000,
      requestTimeout:    60000,
    });
  } catch (err) {
    throw new Error(`Không thể kết nối SQL Server: ${err.message}`);
  }

  rawDb.pragma('foreign_keys = OFF');
  const stats = {};

  try {
    /* ── 1. Xóa toàn bộ dữ liệu cũ trong SQLite (thứ tự ngược FK) ── */
    rawDb.transaction(() => {
      for (const name of [...SYNC_TABLES].reverse()) {
        try {
          rawDb.prepare(`DELETE FROM "${name}"`).run();
        } catch (_) {}
      }
    })();

    /* ── 2. Kéo dữ liệu từng bảng từ SQL Server và chèn vào SQLite ── */
    for (const name of SYNC_TABLES) {
      let rows;
      try {
        const result = await pool.request()
          .query(`SELECT * FROM "${name}" ORDER BY (SELECT NULL)`);
        rows = result.recordset;
      } catch (err) {
        console.warn(`[Sync] Bảng "${name}" không tồn tại ở SQL Server — bỏ qua`);
        stats[name] = 0;
        continue;
      }

      stats[name] = rows.length;
      if (!rows.length) continue;

      const cols = Object.keys(rows[0]);
      const ph   = cols.map(() => '?').join(', ');
      const insertSql = [
        `INSERT OR REPLACE INTO "${name}"`,
        `(${cols.map((c) => `"${c}"`).join(', ')})`,
        `VALUES (${ph})`,
      ].join(' ');

      rawDb.transaction(() => {
        const stmt = rawDb.prepare(insertSql);
        for (const row of rows) {
          const vals = cols.map((col) => {
            const v = row[col];
            if (v === null || v === undefined) return null;
            if (typeof v === 'boolean')        return v ? 1 : 0;
            if (v instanceof Date)             return v.toISOString();
            return v;
          });
          stmt.run(...vals);
        }
      })();
    }

    return { stats };

  } finally {
    rawDb.pragma('foreign_keys = ON');
    try { await pool.close(); } catch (_) {}
  }
}

module.exports = { syncFromSqlServer };
