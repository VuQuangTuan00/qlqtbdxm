'use strict';

require('dotenv').config();
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

let _pool = null;

function getDbConfig() {
  // Trong Electron context: thử đọc db-config.json từ userData
  try {
    const { app } = require('electron');
    if (app) {
      const configPath = path.join(app.getPath('userData'), 'db-config.json');
      if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      }
    }
  } catch (_) {}

  // Fallback: dùng env vars
  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'qlqtbdxm',
    user: process.env.DB_USER || 'qlqt_user',
    password: process.env.DB_PASSWORD || 'matkhau123',
  };
}

async function initDatabase() {
  if (_pool) return _pool;

  const config = getDbConfig();
  _pool = new Pool({ ...config, max: 10, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 });

  // Retry logic: 3 lần, cách nhau 2 giây
  let lastErr;
  for (let i = 1; i <= 3; i++) {
    try {
      const client = await _pool.connect();
      client.release();
      console.log(`[DB] Kết nối PostgreSQL thành công: ${config.host}:${config.port}/${config.database}`);
      await runMigrations();
      return _pool;
    } catch (err) {
      lastErr = err;
      console.error(`[DB] Lần thử ${i}/3 thất bại:`, err.message);
      if (i < 3) await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw lastErr;
}

async function runMigrations() {
  const client = await _pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMP DEFAULT NOW()
      )
    `);

    const migrationsDir = path.join(__dirname, 'migrations');
    if (!fs.existsSync(migrationsDir)) return;

    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    const { rows } = await client.query('SELECT filename FROM _migrations');
    const applied = rows.map((r) => r.filename);

    for (const file of files) {
      if (applied.includes(file)) continue;
      console.log(`[DB] Áp dụng migration: ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`[DB] Migration thành công: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
  } finally {
    client.release();
  }
}

function getDb() {
  if (!_pool) throw new Error('Database chưa được khởi tạo. Gọi initDatabase() trước.');
  return _pool;
}

async function closeDatabase() {
  if (_pool) {
    await _pool.end();
    _pool = null;
    console.log('[DB] Đã đóng kết nối PostgreSQL');
  }
}

module.exports = { initDatabase, getDb, closeDatabase, getDbConfig };
