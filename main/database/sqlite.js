'use strict';

const path = require('path');
const fs   = require('fs');

let _db      = null;
let _adapter = null;

/* ── SQLite Adapter ──────────────────────────────────────────────
   Bọc better-sqlite3 để có interface giống pg Pool:
     pool.query(sql, params) → Promise<{ rows, rowCount }>
   SQLite 3.35+ hỗ trợ RETURNING nên không cần workaround.
──────────────────────────────────────────────────────────────── */
class SqliteAdapter {
  constructor(db) {
    this._db = db;
  }

  async query(sql, params = []) {
    /* ── Convert PostgreSQL → SQLite syntax ── */
    let s = sql
      .replace(/\$\d+/g, '?')           // $1,$2 → ?
      .replace(/\bILIKE\b/gi, 'LIKE')   // ILIKE → LIKE
      .replace(/\bTIMESTAMPTZ\b/gi, 'DATETIME')
      .replace(/\bNOW\(\)/gi, "datetime('now')");

    /* ── Convert boolean JS values → 0/1 ── */
    const p = params.map((v) => {
      if (v === true)  return 1;
      if (v === false) return 0;
      if (v instanceof Date) return v.toISOString();
      return v;
    });

    const upper = s.trim().toUpperCase().replace(/\s+/g, ' ');

    try {
      /* SELECT */
      if (upper.startsWith('SELECT') || upper.startsWith('WITH')) {
        const rows = this._db.prepare(s).all(...p);
        return { rows };
      }

      /* Transaction control */
      if (upper === 'BEGIN')    { this._db.prepare('BEGIN').run();    return { rows: [] }; }
      if (upper === 'COMMIT')   { this._db.prepare('COMMIT').run();   return { rows: [] }; }
      if (upper === 'ROLLBACK') { this._db.prepare('ROLLBACK').run(); return { rows: [] }; }

      /* DML — INSERT/UPDATE/DELETE (may have RETURNING) */
      const hasReturning = /\bRETURNING\b/i.test(s);
      if (hasReturning) {
        const rows = this._db.prepare(s).all(...p);
        return { rows, rowCount: rows.length };
      }

      const info = this._db.prepare(s).run(...p);
      return { rows: [], rowCount: info.changes };

    } catch (err) {
      throw new Error(`[SQLite] ${err.message}\nSQL: ${s.slice(0, 200)}`);
    }
  }

  /* Giả lập pool.connect() cho BaseRepository.transaction() */
  async connect() {
    return {
      query:   (sql, params) => this.query(sql, params),
      release: () => {},
    };
  }

  end() {} // no-op
}

/* ── init / schema ───────────────────────────────────────────── */

function _getDbPath() {
  const { app } = require('electron');
  return path.join(app.getPath('userData'), 'demo.db');
}

async function initSqliteDatabase() {
  if (_adapter) return _adapter;

  const BetterSqlite3 = require('better-sqlite3');
  const dbPath = _getDbPath();
  console.log(`[SQLite] DB: ${dbPath}`);

  _db = new BetterSqlite3(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  _runSqliteMigrations();

  _adapter = new SqliteAdapter(_db);
  return _adapter;
}

function _runSqliteMigrations() {
  _db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      filename   TEXT NOT NULL UNIQUE,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const migrDir = path.join(__dirname, 'migrations-sqlite');
  if (!fs.existsSync(migrDir)) return;

  const files   = fs.readdirSync(migrDir).filter((f) => f.endsWith('.sql')).sort();
  const applied = _db.prepare('SELECT filename FROM _migrations').all().map((r) => r.filename);

  for (const file of files) {
    if (applied.includes(file)) continue;
    console.log(`[SQLite] Migration: ${file}`);
    const sql = fs.readFileSync(path.join(migrDir, file), 'utf-8');
    _db.exec(sql);
    _db.prepare('INSERT INTO _migrations (filename) VALUES (?)').run(file);
  }
}

function getSqliteDb() {
  if (!_adapter) throw new Error('SQLite chưa khởi tạo');
  return _adapter;
}

function getRawSqliteDb() {
  return _db; // raw BetterSqlite3 instance — dùng cho batch sync
}

function closeSqliteDatabase() {
  if (_db) { _db.close(); _db = null; _adapter = null; }
}

module.exports = { initSqliteDatabase, getSqliteDb, getRawSqliteDb, closeSqliteDatabase };
