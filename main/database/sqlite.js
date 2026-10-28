'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { runMigrations } = require('./migration-runner');

let database = null;
let databasePath = null;
let maintenanceMode = false;

function getDefaultDatabasePath() {
  if (process.env.QLQT_SQLITE_PATH) return path.resolve(process.env.QLQT_SQLITE_PATH);
  const { app } = require('electron');
  return path.join(app.getPath('userData'), 'data', 'app.sqlite');
}

function normalizeValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value === undefined ? null : value;
}

function bindSql(sql, params = []) {
  const values = [];
  const text = String(sql).replace(/\$(\d+)/g, (_match, rawIndex) => {
    const index = Number(rawIndex) - 1;
    if (index < 0 || index >= params.length) throw new Error(`Thiếu tham số SQL $${rawIndex}`);
    values.push(normalizeValue(params[index]));
    return '?';
  });
  return { text, values };
}

function execute(rawDb, sql, params = []) {
  if (maintenanceMode) throw new Error('Database đang sao lưu hoặc khôi phục; vui lòng thử lại sau');
  const command = String(sql).trim().replace(/;\s*$/, '');
  const upper = command.toUpperCase();
  if (upper === 'BEGIN') {
    rawDb.exec('BEGIN IMMEDIATE');
    return { rows: [], rowCount: 0 };
  }
  if (upper === 'COMMIT' || upper === 'ROLLBACK') {
    rawDb.exec(upper);
    return { rows: [], rowCount: 0 };
  }
  const { text, values } = bindSql(command, params);
  const statement = rawDb.prepare(text);
  if (statement.reader) {
    const rows = statement.all(...values);
    return { rows, rowCount: rows.length };
  }
  const result = statement.run(...values);
  return { rows: [], rowCount: result.changes, lastInsertRowid: result.lastInsertRowid };
}

function createInterface(rawDb) {
  return {
    query: async (sql, params = []) => execute(rawDb, sql, params),
    connect: async () => ({ query: async (sql, params = []) => execute(rawDb, sql, params), release: () => {} }),
    transaction: async (fn) => {
      rawDb.exec('BEGIN IMMEDIATE');
      try {
        const result = await fn(createInterface(rawDb));
        rawDb.exec('COMMIT');
        return result;
      } catch (error) {
        if (rawDb.inTransaction) rawDb.exec('ROLLBACK');
        throw error;
      }
    },
    raw: rawDb,
  };
}

function initSqliteDatabase(options = {}) {
  if (database) return createInterface(database);
  databasePath = path.resolve(options.databasePath || getDefaultDatabasePath());
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  database = new Database(databasePath);
  database.pragma('foreign_keys = ON');
  database.pragma('busy_timeout = 5000');
  const journalMode = database.pragma('journal_mode = WAL', { simple: true });
  if (String(journalMode).toLowerCase() !== 'wal') {
    database.close();
    database = null;
    throw new Error(`Không thể bật SQLite WAL (giá trị nhận được: ${journalMode})`);
  }
  if (database.pragma('foreign_keys', { simple: true }) !== 1) {
    database.close();
    database = null;
    throw new Error('Không thể bật kiểm tra khóa ngoại SQLite');
  }
  try {
    runMigrations(database, options.migrationDir);
  } catch (error) {
    database.close();
    database = null;
    throw error;
  }
  return createInterface(database);
}

function getSqliteDb() {
  if (!database) throw new Error('SQLite chưa khởi tạo');
  return createInterface(database);
}

function closeSqliteDatabase() {
  if (!database) return;
  if (database.inTransaction) database.exec('ROLLBACK');
  database.close();
  database = null;
}

async function backupSqliteDatabase(destinationPath) {
  if (!database) throw new Error('SQLite chưa khởi tạo');
  const destination = path.resolve(destinationPath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  await database.backup(destination);
  const check = new Database(destination, { fileMustExist: true });
  try {
    check.pragma('journal_mode = DELETE');
    const integrity = check.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') throw new Error(`SQLite integrity_check thất bại: ${integrity}`);
  } finally {
    check.close();
  }
  for (const suffix of ['-wal', '-shm']) {
    const sidecar = `${destination}${suffix}`;
    if (fs.existsSync(sidecar)) fs.rmSync(sidecar, { force: true });
  }
  return destination;
}

function getDatabasePath() {
  return databasePath || getDefaultDatabasePath();
}

function inspectSqliteFile(filePath) {
  const db = new Database(path.resolve(filePath), { readonly: true, fileMustExist: true });
  try {
    db.pragma('foreign_keys = ON');
    const integrity = db.pragma('integrity_check', { simple: true });
    const foreignKeys = db.pragma('foreign_key_check');
    const migrations = db.prepare('SELECT filename FROM _migrations ORDER BY filename').all();
    return { integrity, foreignKeys, migrations };
  } finally {
    db.close();
  }
}

function beginDatabaseMaintenance() {
  if (maintenanceMode) throw new Error('Đang có thao tác bảo trì database khác');
  maintenanceMode = true;
}

function endDatabaseMaintenance() {
  maintenanceMode = false;
}

module.exports = {
  initSqliteDatabase, getSqliteDb, closeSqliteDatabase, backupSqliteDatabase,
  getDatabasePath, inspectSqliteFile, beginDatabaseMaintenance, endDatabaseMaintenance, bindSql,
};
