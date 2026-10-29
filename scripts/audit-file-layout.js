'use strict';

const path = require('path');
const Database = require('better-sqlite3');

const databasePath = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (!databasePath) {
  console.error('Usage: electron scripts/audit-file-layout.js <database-path>');
  process.exit(2);
}

const db = new Database(databasePath, { readonly: true, fileMustExist: true });
try {
  const references = [
    ...db.prepare(`SELECT 'vehicle.img_path' AS source, vehicle_id AS id, img_path AS file_path FROM vehicle WHERE img_path IS NOT NULL`).all(),
    ...db.prepare(`SELECT 'engine_maintenance.tech_process_file_path' AS source, engine_maintenance_id AS id, tech_process_file_path AS file_path FROM engine_maintenance WHERE tech_process_file_path IS NOT NULL`).all(),
    ...db.prepare(`SELECT 'engine_maintenance.norm_ktkt_file_path' AS source, engine_maintenance_id AS id, norm_ktkt_file_path AS file_path FROM engine_maintenance WHERE norm_ktkt_file_path IS NOT NULL`).all(),
    ...db.prepare(`SELECT 'attachments.file_path' AS source, id, file_path FROM attachments WHERE file_path IS NOT NULL`).all(),
  ];
  const byFolder = {};
  const bySource = {};
  for (const item of references) {
    const normalized = String(item.file_path).replace(/\\/g, '/');
    const folder = normalized.includes('/') ? normalized.split('/')[0].toLowerCase() : '(filename-only)';
    byFolder[folder] = (byFolder[folder] || 0) + 1;
    bySource[item.source] = (bySource[item.source] || 0) + 1;
  }
  console.log(JSON.stringify({ total: references.length, byFolder, bySource, references }, null, 2));
} finally {
  db.close();
}
process.exit(0);
