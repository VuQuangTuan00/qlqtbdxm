'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const logger = require('../utils/logger');

let _db = null;

/**
 * Lấy đường dẫn cơ sở dữ liệu
 * @returns {string}
 */
function getDbPath() {
  if (process.env.DB_PATH) return process.env.DB_PATH;

  // Production (packaged): dùng userData để tránh ghi vào thư mục cài đặt
  if (app && app.isPackaged) {
    const userDataPath = app.getPath('userData');
    if (!fs.existsSync(userDataPath)) fs.mkdirSync(userDataPath, { recursive: true });
    return path.join(userDataPath, 'qlqtbdxm.db');
  }

  // Development: dùng ./data/ trong project (cùng nơi seed.js ghi)
  const dataDir = path.join(__dirname, '../../data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  return path.join(dataDir, 'qlqtbdxm.db');
}

/**
 * Khởi tạo kết nối database
 * @returns {Database.Database}
 */
function initDatabase() {
  if (_db) return _db;

  const dbPath = getDbPath();
  logger.info(`[DB] Kết nối database: ${dbPath}`);

  _db = new Database(dbPath, {
    verbose: process.env.NODE_ENV === 'development' ? (sql) => logger.db(sql) : null,
  });

  // Bật WAL mode và foreign keys
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  _db.pragma('synchronous = NORMAL');

  runMigrations(_db);

  logger.info('[DB] Database khởi tạo thành công');
  return _db;
}

/**
 * Chạy các migration SQL
 * @param {Database.Database} db
 */
function runMigrations(db) {
  // Tạo bảng theo dõi migration
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      filename   TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `);

  const migrationsDir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    logger.warn('[DB] Thư mục migrations không tồn tại');
    return;
  }

  const files = fs.readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const applied = db.prepare('SELECT filename FROM _migrations').all().map((r) => r.filename);

  for (const file of files) {
    if (applied.includes(file)) {
      logger.debug(`[DB] Migration đã áp dụng: ${file}`);
      continue;
    }

    logger.info(`[DB] Áp dụng migration: ${file}`);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

    const applyMigration = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO _migrations (filename) VALUES (?)').run(file);
    });

    try {
      applyMigration();
      logger.info(`[DB] Migration thành công: ${file}`);
    } catch (err) {
      logger.error(`[DB] Migration thất bại: ${file}`, err);
      throw err;
    }
  }
}

/**
 * Lấy instance database (phải gọi initDatabase trước)
 * @returns {Database.Database}
 */
function getDb() {
  if (!_db) throw new Error('Database chưa được khởi tạo. Gọi initDatabase() trước.');
  return _db;
}

/**
 * Đóng kết nối database
 */
function closeDatabase() {
  if (_db) {
    _db.close();
    _db = null;
    logger.info('[DB] Đóng kết nối database');
  }
}

module.exports = { initDatabase, getDb, closeDatabase };
