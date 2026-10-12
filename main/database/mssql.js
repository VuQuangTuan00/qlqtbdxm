'use strict';

const sql  = require('mssql');
const path = require('path');
const fs   = require('fs');
const logger = require('../utils/logger');

let _pool = null;

function getConnectionTarget(cfg) {
  const port = parseInt(cfg.port, 10);
  if (port) return `${cfg.server || cfg.host || 'localhost'}:${port}`;
  return `${cfg.server || cfg.host || 'localhost'}\\${cfg.instanceName || 'MSSQLSERVER'}`;
}

function logSqlError(stage, cfg, err) {
  const safeErr = {
    name: err?.name,
    message: err?.message,
    code: err?.code,
    number: err?.number,
    state: err?.state,
    severity: err?.severity,
    server: err?.server,
    database: err?.database,
    stack: err?.stack,
  };

  logger.error(`[MSSQL] ${stage} - target=${getConnectionTarget(cfg)} database=${cfg.database || 'N/A'} user=${cfg.user || 'N/A'}`);
  logger.error('[MSSQL] Chi tiết lỗi:', JSON.stringify(safeErr, null, 2));
  console.error(`[MSSQL] ${stage} - target=${getConnectionTarget(cfg)} database=${cfg.database || 'N/A'} user=${cfg.user || 'N/A'}`);
  console.error('[MSSQL] Chi tiết lỗi:', safeErr);
}

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
    server:       process.env.DB_SERVER   || process.env.DB_HOST || '127.20.10.3',
    instanceName: process.env.DB_INSTANCE || 'MSSQLSERVER',
    database:     process.env.DB_NAME     || 'QTCN',
    user:         process.env.DB_USER     || 'qtcn',
    password:     process.env.DB_PASSWORD || '111111',
  };
}

// ── SQL Transformation (PG → MSSQL) ──────────────────────────────

function _transformSql(sqlStr) {
  let s = sqlStr;

  // 1. Positional params $1 → @p1
  s = s.replace(/\$(\d+)/g, '@p$1');

  // 2. ILIKE → LIKE (SQL Server case-insensitive by default)
  s = s.replace(/\bILIKE\b/gi, 'LIKE');

  // 2b. CURRENT_DATE → CAST(GETDATE() AS DATE)
  s = s.replace(/\bCURRENT_DATE\b/gi, 'CAST(GETDATE() AS DATE)');

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
  const port = parseInt(cfg.port, 10);
  const useInstance = !port && cfg.instanceName;

  logger.info(`[MSSQL] Bắt đầu kết nối: ${getConnectionTarget(cfg)} / ${cfg.database} / user=${cfg.user || 'N/A'}`);
  console.log(`[MSSQL] Bắt đầu kết nối: ${getConnectionTarget(cfg)} / ${cfg.database} / user=${cfg.user || 'N/A'}`);

  try {
    _pool = await sql.connect({
      server:   cfg.server || cfg.host || '127.20.10.3',
      ...(port ? { port } : {}),
      database: cfg.database,
      user:     cfg.user,
      password: cfg.password,
      options: {
        ...(useInstance ? { instanceName: cfg.instanceName } : {}),
        encrypt:                true,
        trustServerCertificate: true,
        enableArithAbort:       true,
      },
      pool: {
        max:               10,
        min:               0,
        idleTimeoutMillis: 30000,
      },
      connectionTimeout: 15000,
      requestTimeout:    60000,
    });

    logger.info(`[MSSQL] Kết nối thành công: ${getConnectionTarget(cfg)}/${cfg.database}`);
    console.log(`[MSSQL] Kết nối thành công: ${getConnectionTarget(cfg)}/${cfg.database}`);
    await _runMigrations();
    return _pool;
  } catch (err) {
    _pool = null;
    logSqlError('connect', cfg, err);
    throw err;
  }
}

async function _runMigrations() {
  try {
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
      logger.info(`[MSSQL] Migration bắt đầu: ${file}`);
      console.log(`[MSSQL] Migration: ${file}`);
      const content = fs.readFileSync(path.join(migrDir, file), 'utf-8');

    // Split on GO batch separator (T-SQL convention)
    const batches = content.split(/^\s*GO\s*$/im).filter((b) => b.trim());

    const tx = new sql.Transaction(_pool);
    await tx.begin();
    try {
      for (const batch of batches) {
        if (!batch.trim()) continue;

        // tedious có thể phát ra NHIỀU sự kiện 'error' trong một batch (lỗi cụ thể
        // rồi tới message tổng kết như "Could not create constraint or index.
        // See previous errors."). mssql chỉ reject với lỗi CUỐI CÙNG — ta phải tự
        // bắt hết để không mất lỗi gốc thật.
        const req = new sql.Request(tx);
        const sqlErrors = [];
        req.on('error', (e) => sqlErrors.push(e.message));

        try {
          await req.query(batch);
        } catch (batchErr) {
          if (sqlErrors.length) {
            batchErr.message =
              `${batchErr.message}\n--- Toàn bộ lỗi SQL Server trong batch (theo thứ tự) ---\n` +
              sqlErrors.map((m, i) => `  [${i + 1}] ${m}`).join('\n') +
              `\n--- Batch gây lỗi ---\n${batch.trim().slice(0, 500)}`;
          }
          throw batchErr;
        }
      }
        await new sql.Request(tx).input('fn', sql.NVarChar(255), file)
          .query('INSERT INTO _migrations (filename) VALUES (@fn)');
        await tx.commit();
        logger.info(`[MSSQL] Migration hoàn tất: ${file}`);
      } catch (err) {
        // Rollback có thể tự throw lỗi thứ cấp (vd. "Transaction has been aborted"
        // khi SQL Server đã tự abort transaction do lỗi nghiêm trọng ở batch trước).
        // Bắt riêng để KHÔNG che mất lỗi gốc — lỗi gốc mới là nguyên nhân thật.
        try {
          await tx.rollback();
        } catch (rollbackErr) {
          const msg = rollbackErr?.message || 'unknown rollback error';
          logger.error('[MSSQL] Rollback thất bại (transaction đã bị server tự abort):', msg);
          console.error('[MSSQL] Rollback thất bại (transaction đã bị server tự abort):', msg);
        }
        logger.error(`[MSSQL] Migration '${file}' thất bại — lỗi gốc: ${err?.message || err}`);
        logSqlError(`migration:${file}`, getDbConfig(), err);
        throw err;
      }
    }
  } catch (err) {
    logger.error('[MSSQL] _runMigrations failed:', err?.message || err);
    logSqlError('migrations', getDbConfig(), err);
    throw err;
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