'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');

function collectRuntimeFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectRuntimeFiles(fullPath));
    else if (entry.isFile() && ['.js', '.json', '.html'].includes(path.extname(entry.name))) files.push(fullPath);
  }
  return files;
}

test('application runtime has no dependency on removed environment configuration', () => {
  const forbidden = [
    /require\(['"]dotenv['"]\)/,
    /dotenv\.config/,
    /process\.env\.(?:DB_SERVER|DB_HOST|DB_PORT|DB_INSTANCE|DB_NAME|DB_USER|DB_PASSWORD)\b/,
    /process\.env\.(?:NODE_ENV|LOG_LEVEL|BCRYPT_ROUNDS|SESSION_SECRET|SQLSERVER_BACKUP_DIR)\b/,
    /\bTEST_DB_[A-Z_]+\b/,
  ];

  for (const directory of ['main', 'renderer', 'scripts']) {
    for (const filePath of collectRuntimeFiles(path.join(root, directory))) {
      const source = fs.readFileSync(filePath, 'utf8');
      for (const pattern of forbidden) {
        assert.doesNotMatch(source, pattern, path.relative(root, filePath));
      }
    }
  }
});

test('package manifests have no direct dotenv dependency or env build input', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const lockfile = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));

  assert.equal(manifest.dependencies?.dotenv, undefined);
  assert.equal(manifest.devDependencies?.dotenv, undefined);
  assert.equal(lockfile.packages?.['']?.dependencies?.dotenv, undefined);
  assert.equal(lockfile.packages?.['']?.devDependencies?.dotenv, undefined);
  assert.equal((manifest.build?.files || []).some((entry) => /(^|[/\\])\.env(?:$|\.)/.test(entry)), false);
  assert.equal(fs.existsSync(path.join(root, '.env.example')), false);
  assert.equal(manifest.scripts?.seed, undefined);
  assert.equal(manifest.scripts?.['reset-db'], undefined);
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'seed.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'reset-db.js')), false);
});

test('package version is valid semantic version for electron-builder', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const lockfile = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  const semanticVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

  assert.match(manifest.version, semanticVersion);
  assert.equal(lockfile.version, manifest.version);
  assert.equal(lockfile.packages?.['']?.version, manifest.version);
});

test('database setup screens do not invent endpoints and recover from save failures', () => {
  for (const relativePath of ['renderer/js/db-setup.js']) {
    const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
    assert.doesNotMatch(source, /value=["']1433["']/, relativePath);
    assert.match(source, /const res = await window\.electronAPI\.invoke\(['"]dbconfig:set['"]/, relativePath);
    assert.match(source, /if \(!res\.success\)/, relativePath);
    assert.match(source, /btn\.disabled = false/, relativePath);
  }
});

test('runtime payload storage has no legacy uploads behavior', () => {
  for (const directory of ['main', 'renderer']) {
    for (const filePath of collectRuntimeFiles(path.join(root, directory))) {
      const source = fs.readFileSync(filePath, 'utf8');
      assert.doesNotMatch(source, /(?:^|[^A-Za-z])uploads(?:[^A-Za-z]|$)/i, path.relative(root, filePath));
    }
  }
});
