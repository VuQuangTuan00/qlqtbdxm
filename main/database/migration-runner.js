'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function checksum(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function runMigrations(db, migrationDir = path.join(__dirname, 'migrations-sqlite')) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);
  const files = fs.readdirSync(migrationDir).filter((name) => /^\d+.*\.sql$/i.test(name)).sort();
  const available = new Set(files);
  const applied = db.prepare('SELECT filename, checksum FROM _migrations ORDER BY filename').all();

  for (const row of applied) {
    if (!available.has(row.filename)) {
      throw new Error(`Database có migration không được ứng dụng hiện tại hỗ trợ: ${row.filename}`);
    }
    const content = fs.readFileSync(path.join(migrationDir, row.filename), 'utf8');
    if (row.checksum !== checksum(content)) {
      throw new Error(`Migration đã áp dụng bị thay đổi nội dung: ${row.filename}`);
    }
  }

  const insert = db.prepare('INSERT INTO _migrations (filename, checksum) VALUES (?, ?)');
  for (const filename of files) {
    if (applied.some((row) => row.filename === filename)) continue;
    const content = fs.readFileSync(path.join(migrationDir, filename), 'utf8');
    db.transaction(() => {
      db.exec(content);
      insert.run(filename, checksum(content));
    })();
  }
  return { applied: files.length, latest: files.at(-1) || null };
}

module.exports = { runMigrations, checksum };
