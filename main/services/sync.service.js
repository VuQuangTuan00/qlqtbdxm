'use strict';

const { Pool } = require('pg');

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
 * Đồng bộ toàn bộ dữ liệu từ PostgreSQL vào SQLite.
 * Chỉ gọi khi app đang ở chế độ Demo (SQLite).
 * @param {object} pgConfig - { host, port, database, user, password }
 * @returns {{ stats: Record<string, number> }}
 */
async function syncFromPostgres(pgConfig) {
  const { getRawSqliteDb } = require('../database/sqlite');
  const rawDb = getRawSqliteDb();
  if (!rawDb) {
    throw new Error('SQLite chưa được khởi tạo. Ứng dụng phải đang ở chế độ Demo.');
  }

  const pool = new Pool({
    host:                   pgConfig.host,
    port:                   parseInt(pgConfig.port) || 5432,
    database:               pgConfig.database,
    user:                   pgConfig.user,
    password:               pgConfig.password,
    max:                    1,
    connectionTimeoutMillis: 10000,
    statement_timeout:       60000,
  });

  let client;
  try {
    client = await pool.connect();
  } catch (err) {
    await pool.end().catch(() => {});
    throw new Error(`Không thể kết nối PostgreSQL: ${err.message}`);
  }

  rawDb.pragma('foreign_keys = OFF');

  const stats = {};

  try {
    /* ── 1. Xóa toàn bộ dữ liệu cũ trong SQLite (thứ tự ngược FK) ── */
    rawDb.transaction(() => {
      for (const name of [...SYNC_TABLES].reverse()) {
        try {
          rawDb.prepare(`DELETE FROM "${name}"`).run();
        } catch (_) {
          // bảng có thể không tồn tại — bỏ qua
        }
      }
    })();

    /* ── 2. Kéo dữ liệu từng bảng từ PostgreSQL và chèn vào SQLite ── */
    for (const name of SYNC_TABLES) {
      let rows;
      try {
        ({ rows } = await client.query(`SELECT * FROM "${name}" ORDER BY 1`));
      } catch (err) {
        // Bảng có thể không tồn tại ở PG (vd: schema cũ hơn)
        console.warn(`[Sync] Bảng "${name}" không tồn tại ở PG — bỏ qua`);
        stats[name] = 0;
        continue;
      }

      stats[name] = rows.length;
      if (!rows.length) continue;

      const cols = Object.keys(rows[0]);
      const ph   = cols.map(() => '?').join(', ');
      const sql  = [
        `INSERT OR REPLACE INTO "${name}"`,
        `(${cols.map((c) => `"${c}"`).join(', ')})`,
        `VALUES (${ph})`,
      ].join(' ');

      rawDb.transaction(() => {
        const stmt = rawDb.prepare(sql);
        for (const row of rows) {
          const vals = cols.map((col) => {
            const v = row[col];
            if (v === null || v === undefined) return null;
            if (typeof v === 'boolean')         return v ? 1 : 0;
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
    try { client.release(); } catch (_) {}
    await pool.end().catch(() => {});
  }
}

module.exports = { syncFromPostgres };
