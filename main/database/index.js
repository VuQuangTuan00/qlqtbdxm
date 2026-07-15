'use strict';

/* ============================================================
   Database Router — chọn SQL Server hoặc SQLite theo mode
   Đọc mode từ db-config.json trong userData:
     { "mode": "sqlite" }     → Demo mode (SQLite)
     { "mode": "sqlserver" }  → Production mode (SQL Server, default)
   ============================================================ */

const path = require('path');
const fs   = require('fs');

const {
  initMssqlDatabase,
  getMssqlDb,
  closeMssqlDatabase,
  getDbConfig,
} = require('./mssql');

const {
  initSqliteDatabase,
  getSqliteDb,
  closeSqliteDatabase,
} = require('./sqlite');

let _mode = null; // 'sqlserver' | 'sqlite'

function getDbMode() {
  try {
    const { app } = require('electron');
    if (app) {
      const cfgPath = path.join(app.getPath('userData'), 'db-config.json');
      if (fs.existsSync(cfgPath)) {
        const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
        if (cfg.mode === 'sqlite')    return 'sqlite';
        if (cfg.mode === 'sqlserver') return 'sqlserver';
      }
    }
  } catch (_) {}
  return 'sqlserver';
}

async function initDatabase() {
  _mode = getDbMode();
  if (_mode === 'sqlite') {
    console.log('[DB] Chế độ DEMO — SQLite');
    return await initSqliteDatabase();
  }
  console.log('[DB] Chế độ PRODUCTION — SQL Server');
  return await initMssqlDatabase();
}

function getDb() {
  if (_mode === 'sqlite') return getSqliteDb();
  return getMssqlDb();
}

async function closeDatabase() {
  if (_mode === 'sqlite') {
    closeSqliteDatabase();
  } else {
    await closeMssqlDatabase();
  }
}

function isDemo() {
  return _mode === 'sqlite';
}

module.exports = { initDatabase, getDb, closeDatabase, getDbConfig, getDbMode, isDemo };
