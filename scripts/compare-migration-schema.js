'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const databasePath = process.argv[2] ? path.resolve(process.argv[2]) : null;
const migrationPath = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.join(__dirname, '..', 'main', 'database', 'migrations-sqlite', '001_initial.sql');

if (!databasePath) {
  console.error('Usage: electron scripts/compare-migration-schema.js <database-path> [001_initial.sql]');
  process.exit(2);
}

function canonicalSql(sql) {
  return String(sql || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s*([(),])\s*/g, '$1')
    .replace(/\s*;\s*$/, '');
}

function objects(db) {
  return db.prepare(`
    SELECT type, name, tbl_name, sql
    FROM sqlite_master
    WHERE name NOT LIKE 'sqlite_%' AND name <> '_migrations'
      AND tbl_name <> '_migrations'
    ORDER BY type, name
  `).all();
}

function rows(db, table, orderBy) {
  return db.prepare(`SELECT * FROM ${table} ORDER BY ${orderBy}`).all();
}

const actual = new Database(databasePath, { readonly: true, fileMustExist: true });
const expected = new Database(':memory:');
try {
  expected.exec(fs.readFileSync(migrationPath, 'utf8'));
  const actualMap = new Map(objects(actual).map((item) => [`${item.type}:${item.name}`, item]));
  const expectedMap = new Map(objects(expected).map((item) => [`${item.type}:${item.name}`, item]));
  const missing = [...expectedMap.keys()].filter((key) => !actualMap.has(key));
  const extra = [...actualMap.keys()].filter((key) => !expectedMap.has(key));
  const changed = [...expectedMap.keys()].filter((key) => {
    const current = actualMap.get(key);
    return current && canonicalSql(current.sql) !== canonicalSql(expectedMap.get(key).sql);
  }).map((key) => ({
    object: key,
    actual: canonicalSql(actualMap.get(key).sql),
    expected: canonicalSql(expectedMap.get(key).sql),
  }));
  const actualRoles = rows(actual, 'roles', 'id');
  const expectedRoles = rows(expected, 'roles', 'id');
  const actualSteps = rows(actual, 'maintenance_steps', 'id');
  const expectedSteps = rows(expected, 'maintenance_steps', 'id');

  const result = {
    schemaMatches: missing.length === 0 && extra.length === 0 && changed.length === 0,
    seedMatches: JSON.stringify(actualRoles) === JSON.stringify(expectedRoles)
      && JSON.stringify(actualSteps) === JSON.stringify(expectedSteps),
    missing,
    extra,
    changed,
    actualObjectCount: actualMap.size,
    expectedObjectCount: expectedMap.size,
    actualRoleCount: actualRoles.length,
    expectedRoleCount: expectedRoles.length,
    actualStepCount: actualSteps.length,
    expectedStepCount: expectedSteps.length,
  };
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.schemaMatches && result.seedMatches ? 0 : 1;
} finally {
  actual.close();
  expected.close();
}
