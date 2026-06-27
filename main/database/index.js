'use strict';

/* ============================================================
   Database Router — chọn PostgreSQL hoặc SQLite theo mode
   Đọc mode từ db-config.json trong userData:
     { "mode": "sqlite" }   → Demo mode (SQLite)
     { "mode": "postgres" } → Production mode (PostgreSQL, default)
   ============================================================ */

const path = require('path');
const fs   = require('fs');

const {
  initPostgresDatabase,
  getPostgresDb,
  closePostgresDatabase,
  getDbConfig,
} = require('./postgres');

const {
  initSqliteDatabase,
  getSqliteDb,
  closeSqliteDatabase,
} = require('./sqlite');

let _mode = null; // 'postgres' | 'sqlite'

function getDbMode() {
  try {
    const { app } = require('electron');
    if (app) {
      const cfgPath = path.join(app.getPath('userData'), 'db-config.json');
      if (fs.existsSync(cfgPath)) {
        const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
        if (cfg.mode === 'sqlite') return 'sqlite';
      }
    }
  } catch (_) {}
  return 'postgres';
}

async function initDatabase() {
  _mode = getDbMode();
  if (_mode === 'sqlite') {
    console.log('[DB] Chế độ DEMO — SQLite');
    return await initSqliteDatabase();
  }
  console.log('[DB] Chế độ PRODUCTION — PostgreSQL');
  return await initPostgresDatabase();
}

function getDb() {
  if (_mode === 'sqlite') return getSqliteDb();
  return getPostgresDb();
}

async function closeDatabase() {
  if (_mode === 'sqlite') {
    closeSqliteDatabase();
  } else {
    await closePostgresDatabase();
  }
}

function isDemo() {
  return _mode === 'sqlite';
}

module.exports = { initDatabase, getDb, closeDatabase, getDbConfig, getDbMode, isDemo };
