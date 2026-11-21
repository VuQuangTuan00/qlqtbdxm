// 'use strict';

// const assert = require('node:assert/strict');
// const fs = require('node:fs');
// const path = require('node:path');
// const test = require('node:test');

// const migrationPath = path.resolve(
//   __dirname,
//   '../../../main/database/migrations-mssql/002_split_engine_maintenance.sql',
// );
// const sql = fs.readFileSync(migrationPath, 'utf8');

// test('migration creates both independent maintenance tables with cascading vehicle foreign keys', () => {
//   assert.match(sql, /CREATE TABLE tech_process_maintenance\s*\([\s\S]*?CONSTRAINT fk_tech_process_vehicle[\s\S]*?ON DELETE CASCADE/i);
//   assert.match(sql, /CREATE TABLE norm_ktkt_maintenance\s*\([\s\S]*?CONSTRAINT fk_norm_ktkt_vehicle[\s\S]*?ON DELETE CASCADE/i);
// });

// test('migration copies every legacy row and preserves matching names, order, and file columns', () => {
//   assert.match(sql, /INSERT INTO tech_process_maintenance\s*\(\s*vehicle_id,\s*tech_process_name,\s*display_order,\s*tech_process_file_name,\s*tech_process_file_path\s*\)\s*SELECT\s*vehicle_id,\s*maintenance_name,\s*display_order,\s*tech_process_file_name,\s*tech_process_file_path\s*FROM dbo\.engine_maintenance/is);
//   assert.match(sql, /INSERT INTO norm_ktkt_maintenance\s*\(\s*vehicle_id,\s*norm_ktkt_name,\s*display_order,\s*norm_ktkt_file_name,\s*norm_ktkt_file_path\s*\)\s*SELECT\s*vehicle_id,\s*maintenance_name,\s*display_order,\s*norm_ktkt_file_name,\s*norm_ktkt_file_path\s*FROM dbo\.engine_maintenance/is);
//   assert.doesNotMatch(sql, /WHERE\s+[^;]*(file_name|file_path)\s+IS\s+NOT\s+NULL/i);
// });

// test('migration validates both destination counts before dropping the legacy table', () => {
//   const firstCountCheck = sql.indexOf('COUNT_BIG(*) FROM tech_process_maintenance');
//   const secondCountCheck = sql.indexOf('COUNT_BIG(*) FROM norm_ktkt_maintenance');
//   const dropLegacy = sql.indexOf('DROP TABLE dbo.engine_maintenance');

//   assert.match(sql, /DECLARE @legacyCount BIGINT = \(SELECT COUNT_BIG\(\*\) FROM dbo\.engine_maintenance\)/i);
//   assert.notEqual(firstCountCheck, -1);
//   assert.notEqual(secondCountCheck, -1);
//   assert.ok(firstCountCheck < dropLegacy);
//   assert.ok(secondCountCheck < dropLegacy);
//   assert.ok(dropLegacy > sql.indexOf('CREATE INDEX idx_norm_ktkt_order'));
// });

// test('migration uses the canonical norm_ktkt name and creates vehicle-order indexes', () => {
//   assert.doesNotMatch(sql, /nom_ktkt/i);
//   assert.match(sql, /CREATE INDEX idx_tech_process_order\s+ON tech_process_maintenance\s*\(\s*vehicle_id,\s*display_order,\s*tech_process_id\s*\)/i);
//   assert.match(sql, /CREATE INDEX idx_norm_ktkt_order\s+ON norm_ktkt_maintenance\s*\(\s*vehicle_id,\s*display_order,\s*norm_ktkt_id\s*\)/i);
// });
