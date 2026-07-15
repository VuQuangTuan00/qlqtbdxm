'use strict';

const sql  = require('mssql');
const path = require('path');
const fs   = require('fs');

let _pool = null;

// ── Config ───────────────────────────────────────────────────────

function getDbConfig() {
  try {
    const { app } = require('electron');
    if (app) {
      const cfgPath = path.join(app.getPath('userData'), 'db-config.json');
      if (fs.existsSync(cfgPath)) {
        const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
        if (cfg.mode === 'sqlserver') return cfg;
      }
    }
  } catch (_) {}

  return {
    server:   process.env.DB_SERVER   || process.env.DB_HOST || '127.0.0.1',
    port:     parseInt(process.env.DB_PORT || '1433'),
    database: process.env.DB_NAME     || 'qlqtbdxm',
    user:     process.env.DB_USER     || 'qlqt_user',
    password: process.env.DB_PASSWORD || '123456',
  };
}

// ── SQL Transformation (PG → MSSQL) ──────────────────────────────

function _transformSql(sqlStr) {
  let s = sqlStr;

  // 1. Positional params $1 → @p1
  s = s.replace(/\$(\d+)/g, '@p$1');

  // 2. ILIKE → LIKE (SQL Server case-insensitive by default)
  s = s.replace(/\bILIKE\b/gi, 'LIKE');

  // 3. INSERT INTO t (cols) VALUES (...) RETURNING *
  //    → INSERT INTO t (cols) OUTPUT INSERTED.* VALUES (...)
  s = s.replace(
    /(INSERT\s+INTO\s+\S+\s*\([^)]+\))\s+(VALUES\s*\([^)]*\))\s*RETURNING\s+\*/gi,
    '$1 OUTPUT INSERTED.* $2'
  );

  // 4. UPDATE t SET ... WHERE ... RETURNING *
  //    → UPDATE t SET ... OUTPUT INSERTED.* WHERE ...
  s = s.replace(
    /(UPDATE\s+\S+\s+SET\s+)([\s\S]+?)(\s+WHERE\s+[\s\S]+?)\s*RETURNING\s+\*\s*$/i,
    '$1$2 OUTPUT INSERTED.*$3'
  );

  // 5. LIMIT n OFFSET m → OFFSET m ROWS FETCH NEXT n ROWS ONLY
  s = s.replace(
    /\bLIMIT\s+(@p\d+|\d+)\s+OFFSET\s+(@p\d+|\d+)/gi,
    'OFFSET $2 ROWS FETCH NEXT $1 ROWS ONLY'
  );

  // 6. LIMIT n (without OFFSET) → SELECT TOP n ...
  if (!/\bOFFSET\b|\bFETCH\b/i.test(s)) {
    const m = /\bLIMIT\s+(@p\d+|\d+)\s*$/i.exec(s);
    if (m) {
      const n = m[1];
      s = s.substring(0, s.length - m[0].length).trimEnd();
      // Inject TOP n right after the first SELECT keyword
      s = s.replace(/\bSELECT\b/i, `SELECT TOP ${n}`);
    }
  }

  return s;
}

// ── Request builder ───────────────────────────────────────────────

function _makeRequest(target, params = []) {
  // target = pool or Transaction
  const req = (target instanceof sql.Transaction)
    ? new sql.Request(target)
    : target.request();

  params.forEach((val, idx) => {
    const name = `p${idx + 1}`;
    if (val === null || val === undefined) {
      req.input(name, sql.NVarChar(sql.MAX), null);
    } else if (typeof val === 'boolean') {
      req.input(name, sql.Bit, val ? 1 : 0);
    } else if (typeof val === 'number' && Number.isInteger(val)) {
      req.input(name, sql.Int, val);
    } else if (typeof val === 'number') {
      req.input(name, sql.Float, val);
    } else if (val instanceof Date) {
      req.input(name, sql.DateTime2, val);
    } else {
      req.input(name, sql.NVarChar(sql.MAX), String(val));
    }
  });

  return req;
}

async function _execQuery(target, sqlStr, params = []) {
  const transformed = _transformSql(sqlStr);
  const req         = _makeRequest(target, params);
  const result      = await req.query(transformed);
  return {
    rows:     result.recordset     || [],
    rowCount: result.rowsAffected?.[0] ?? 0,
  };
}

// ── Init & Migrations ─────────────────────────────────────────────

async function initMssqlDatabase() {
  if (_pool) return _pool;

  const cfg = getDbConfig();

  _pool = await sql.connect({
    server:   cfg.server || cfg.host || '127.0.0.1',
    port:     parseInt(cfg.port) || 1433,
    database: cfg.database,
    user:     cfg.user,
    password: cfg.password,
    options: {
      encrypt:                false,
      trustServerCertificate: true,
      enableArithAbort:       true,
    },
    pool: {
      max:               10,
      min:               0,
      idleTimeoutMillis: 30000,
    },
    connectionTimeout: 5000,
    requestTimeout:    60000,
  });

  console.log(`[MSSQL] Kết nối thành công: ${cfg.server || cfg.host}:${cfg.port}/${cfg.database}`);
  await _runMigrations();
  return _pool;
}

async function _runMigrations() {
  // Create migration tracking table
  await _pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = '_migrations' AND schema_id = SCHEMA_ID('dbo'))
    CREATE TABLE _migrations (
      id         INT IDENTITY(1,1) PRIMARY KEY,
      filename   NVARCHAR(255) NOT NULL UNIQUE,
      applied_at DATETIME2 DEFAULT GETDATE()
    )
  `);

  const migrDir = path.join(__dirname, 'migrations-mssql');
  if (!fs.existsSync(migrDir)) return;

  const files = fs.readdirSync(migrDir).filter((f) => f.endsWith('.sql')).sort();
  const { recordset } = await _pool.request().query('SELECT filename FROM _migrations');
  const applied = new Set(recordset.map((r) => r.filename));

  for (const file of files) {
    if (applied.has(file)) continue;
    console.log(`[MSSQL] Migration: ${file}`);
    const content = fs.readFileSync(path.join(migrDir, file), 'utf-8');

    // Split on GO batch separator (T-SQL convention)
    const batches = content.split(/^\s*GO\s*$/im).filter((b) => b.trim());

    const tx = new sql.Transaction(_pool);
    await tx.begin();
    try {
      for (const batch of batches) {
        if (batch.trim()) await new sql.Request(tx).query(batch);
      }
      await new sql.Request(tx).input('fn', sql.NVarChar(255), file)
        .query('INSERT INTO _migrations (filename) VALUES (@fn)');
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }
}

// ── pg-compatible DB interface ────────────────────────────────────

function getMssqlDb() {
  if (!_pool) throw new Error('SQL Server chưa khởi tạo');

  return {
    // Simple query (no transaction)
    query: (sqlStr, params = []) => _execQuery(_pool, sqlStr, params),

    // Transaction-aware client (mirrors pg's pool.connect() API)
    connect: async () => {
      const tx = new sql.Transaction(_pool);
      let txStarted = false;

      return {
        query: async (sqlStr, params = []) => {
          const cmd = sqlStr.trim().toUpperCase();

          if (cmd === 'BEGIN') {
            await tx.begin();
            txStarted = true;
            return { rows: [], rowCount: 0 };
          }
          if (cmd === 'COMMIT') {
            await tx.commit();
            txStarted = false;
            return { rows: [], rowCount: 0 };
          }
          if (cmd === 'ROLLBACK') {
            if (txStarted) await tx.rollback();
            txStarted = false;
            return { rows: [], rowCount: 0 };
          }

          return _execQuery(tx, sqlStr, params);
        },
        release: async () => {
          // no-op: tx has been committed or rolled back already
        },
      };
    },
  };
}

async function closeMssqlDatabase() {
  if (_pool) {
    await _pool.close();
    _pool = null;
  }
}

module.exports = {
  initMssqlDatabase,
  getMssqlDb,
  closeMssqlDatabase,
  getDbConfig,
};
