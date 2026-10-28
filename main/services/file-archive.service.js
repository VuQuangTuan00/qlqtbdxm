'use strict';

const AdmZip = require('adm-zip');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { app } = require('electron');
const {
  backupSqliteDatabase,
  closeDatabase,
  initDatabase,
  inspectSqliteFile,
  getDatabasePath,
  beginDatabaseMaintenance,
  endDatabaseMaintenance,
} = require('../database');

const MANAGED_FOLDERS = ['uploads', 'vehicle-images', 'maintenance-files'];
const MAX_ENTRIES = 5000;
const MAX_TOTAL_SIZE = 2 * 1024 * 1024 * 1024;
const MAX_ENTRY_SIZE = 256 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 200;

function assertInside(root, candidate) {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  const relative = path.relative(resolvedRoot, resolvedCandidate);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Đường dẫn nằm ngoài vùng dữ liệu cho phép: ${resolvedCandidate}`);
  }
  return resolvedCandidate;
}

function safeRemove(root, candidate) {
  const target = assertInside(root, candidate);
  fs.rmSync(target, { recursive: true, force: true });
}

async function hashFile(filePath) {
  const hash = crypto.createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

function listFiles(root) {
  const result = [];
  if (!fs.existsSync(root)) return result;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...listFiles(absolute));
    else if (entry.isFile()) result.push(absolute);
  }
  return result;
}

async function buildFileManifest(stagingRoot) {
  const files = [];
  for (const absolute of listFiles(stagingRoot)) {
    if (path.basename(absolute) === 'manifest.json') continue;
    const relative = path.relative(stagingRoot, absolute).split(path.sep).join('/');
    const stat = fs.statSync(absolute);
    files.push({ path: relative, size: stat.size, sha256: await hashFile(absolute) });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

async function createZip(sourceDir, destination) {
  const zip = new AdmZip();
  for (const absolute of listFiles(sourceDir)) {
    const relativeDir = path.dirname(path.relative(sourceDir, absolute));
    zip.addLocalFile(absolute, relativeDir === '.' ? '' : relativeDir.split(path.sep).join('/'));
  }
  await new Promise((resolve, reject) => {
    zip.writeZip(destination, (error) => error ? reject(error) : resolve());
  });
}

async function inspectArchive(archivePath) {
  const zip = new AdmZip(archivePath);
  return zip.getEntries().map((entry) => ({
    name: entry.entryName,
    size: entry.header.size,
    compressedSize: entry.header.compressedSize,
    isDirectory: entry.isDirectory,
  }));
}

function validateEntryName(rawName) {
  const name = String(rawName).replace(/\\/g, '/');
  if (!name || name.startsWith('/') || /^[A-Za-z]:/.test(name) || name.includes('\0')) return false;
  const parts = name.split('/').filter(Boolean);
  if (parts.some((part) => part === '.' || part === '..' || /[<>:"|?*]/.test(part) || /[. ]$/.test(part))) return false;
  if (name === 'manifest.json' || name === 'database/app.sqlite') return true;
  return /^files\/(uploads|vehicle-images|maintenance-files)(\/.*)?$/.test(name);
}

async function validateArchiveEntries(archivePath) {
  const entries = await inspectArchive(archivePath);
  if (!entries.length || entries.length > MAX_ENTRIES) throw new Error('Số lượng file trong ZIP không hợp lệ.');
  const names = new Set();
  let total = 0;
  for (const entry of entries) {
    const name = String(entry.name).replace(/\\/g, '/');
    if (!validateEntryName(name)) throw new Error(`Đường dẫn không hợp lệ trong ZIP: ${name}`);
    const key = name.toLowerCase();
    if (names.has(key)) throw new Error(`ZIP chứa đường dẫn trùng lặp: ${name}`);
    names.add(key);
    const size = Number(entry.size);
    const compressed = Number(entry.compressedSize);
    if (!Number.isSafeInteger(size) || size < 0 || size > MAX_ENTRY_SIZE) throw new Error(`File trong ZIP quá lớn: ${name}`);
    total += size;
    if (total > MAX_TOTAL_SIZE) throw new Error('Tổng kích thước giải nén vượt giới hạn 2 GB.');
    if (compressed > 0 && size / compressed > MAX_COMPRESSION_RATIO) throw new Error(`Tỷ lệ nén bất thường: ${name}`);
  }
  if (!names.has('manifest.json') || !names.has('database/app.sqlite')) {
    throw new Error('Gói backup thiếu manifest hoặc database SQLite.');
  }
  return entries;
}

async function extractZip(archivePath, destination) {
  const zip = new AdmZip(archivePath);
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const relative = entry.entryName.replace(/\\/g, '/');
    const target = assertInside(destination, path.join(destination, ...relative.split('/')));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, entry.getData(), { flag: 'wx' });
  }
}

async function validateBackupPackage(archivePath) {
  const archive = path.resolve(archivePath);
  if (!fs.existsSync(archive) || path.extname(archive).toLowerCase() !== '.zip') throw new Error('File backup ZIP không tồn tại.');
  await validateArchiveEntries(archive);
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'qlqt-restore-'));
  try {
    await extractZip(archive, staging);
    const manifestPath = path.join(staging, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.format !== 'qlqtbdxm-sqlite-backup' || manifest.version !== 2 || !Array.isArray(manifest.files)) {
      throw new Error('Manifest backup không đúng định dạng được hỗ trợ.');
    }
    const expected = new Set();
    for (const item of manifest.files) {
      if (!item || !validateEntryName(item.path) || typeof item.sha256 !== 'string' || !Number.isSafeInteger(item.size)) {
        throw new Error('Manifest chứa metadata file không hợp lệ.');
      }
      const absolute = assertInside(staging, path.join(staging, ...item.path.split('/')));
      if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) throw new Error(`Thiếu file backup: ${item.path}`);
      if (fs.statSync(absolute).size !== item.size || await hashFile(absolute) !== item.sha256) {
        throw new Error(`Checksum không khớp: ${item.path}`);
      }
      expected.add(path.resolve(absolute).toLowerCase());
    }
    for (const absolute of listFiles(staging)) {
      if (path.basename(absolute) === 'manifest.json') continue;
      if (!expected.has(path.resolve(absolute).toLowerCase())) throw new Error(`ZIP có file không được khai báo: ${path.relative(staging, absolute)}`);
    }
    const inspection = inspectSqliteFile(path.join(staging, 'database', 'app.sqlite'));
    if (inspection.integrity !== 'ok' || inspection.foreignKeys.length) throw new Error('Database trong backup không toàn vẹn.');
    const backupMigrations = inspection.migrations.map((row) => row.filename);
    if (JSON.stringify(backupMigrations) !== JSON.stringify(manifest.schemaMigrations || [])) {
      throw new Error('Schema version trong manifest không khớp database.');
    }
    return { staging, manifest, inspection };
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

async function exportBackup(destinationPath, options = {}) {
  const root = path.resolve(options.userDataPath || app.getPath('userData'));
  const destination = path.resolve(destinationPath);
  if (path.extname(destination).toLowerCase() !== '.zip') throw new Error('File backup phải có đuôi .zip.');
  if (fs.existsSync(destination)) throw new Error('File backup đã tồn tại; không tự động ghi đè.');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'qlqt-backup-'));
  const partial = `${destination}.partial-${crypto.randomUUID()}.zip`;
  const managesMaintenance = options.manageMaintenance !== false;
  try {
    if (managesMaintenance) beginDatabaseMaintenance();
    const databaseDir = path.join(staging, 'database');
    fs.mkdirSync(databaseDir, { recursive: true });
    await backupSqliteDatabase(path.join(databaseDir, 'app.sqlite'));
    for (const folder of MANAGED_FOLDERS) {
      const source = path.join(root, folder);
      const target = path.join(staging, 'files', folder);
      if (fs.existsSync(source)) fs.cpSync(source, target, { recursive: true, errorOnExist: true });
    }
    const databaseInspection = inspectSqliteFile(path.join(databaseDir, 'app.sqlite'));
    const manifest = {
      format: 'qlqtbdxm-sqlite-backup',
      version: 2,
      createdAt: new Date().toISOString(),
      appVersion: options.appVersion || (app && typeof app.getVersion === 'function' ? app.getVersion() : 'test'),
      schemaMigrations: databaseInspection.migrations.map((row) => row.filename),
      files: await buildFileManifest(staging),
    };
    fs.writeFileSync(path.join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    await createZip(staging, partial);
    const verified = await validateBackupPackage(partial);
    fs.rmSync(verified.staging, { recursive: true, force: true });
    fs.renameSync(partial, destination);
    return { path: destination, manifest };
  } catch (error) {
    try { if (fs.existsSync(partial)) fs.rmSync(partial, { force: true }); } catch (_) {}
    throw error;
  } finally {
    if (managesMaintenance) endDatabaseMaintenance();
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

function moveIfExists(source, destination) {
  if (!fs.existsSync(source)) return;
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.renameSync(source, destination);
}

async function restoreBackup(archivePath, options = {}) {
  const root = path.resolve(options.userDataPath || app.getPath('userData'));
  const validated = await validateBackupPackage(archivePath);
  const backupDir = path.join(root, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const safetyPath = path.join(backupDir, `pre-restore-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`);
  beginDatabaseMaintenance();
  try {
    await exportBackup(safetyPath, { userDataPath: root, manageMaintenance: false });

  const rollback = path.join(root, `.restore-rollback-${crypto.randomUUID()}`);
  const currentDb = path.resolve(getDatabasePath());
  assertInside(root, currentDb);
  await closeDatabase();
  fs.mkdirSync(rollback, { recursive: true });
  let swapped = false;
  try {
    for (const suffix of ['', '-wal', '-shm']) moveIfExists(`${currentDb}${suffix}`, path.join(rollback, `app.sqlite${suffix}`));
    for (const folder of MANAGED_FOLDERS) moveIfExists(path.join(root, folder), path.join(rollback, folder));
    fs.mkdirSync(path.dirname(currentDb), { recursive: true });
    fs.copyFileSync(path.join(validated.staging, 'database', 'app.sqlite'), currentDb, fs.constants.COPYFILE_EXCL);
    swapped = true;
    for (const folder of MANAGED_FOLDERS) {
      const incoming = path.join(validated.staging, 'files', folder);
      const target = path.join(root, folder);
      if (fs.existsSync(incoming)) fs.cpSync(incoming, target, { recursive: true, errorOnExist: true });
    }
    if (typeof options.afterSwap === 'function') await options.afterSwap();
    await initDatabase({ databasePath: currentDb });
    const finalInspection = inspectSqliteFile(currentDb);
    if (finalInspection.integrity !== 'ok' || finalInspection.foreignKeys.length) throw new Error('Database sau restore không toàn vẹn.');
    safeRemove(root, rollback);
    return { path: path.resolve(archivePath), safetyBackupPath: safetyPath, restartRequired: true };
  } catch (error) {
    try { await closeDatabase(); } catch (_) {}
    if (swapped) {
      for (const suffix of ['', '-wal', '-shm']) {
        const candidate = `${currentDb}${suffix}`;
        if (fs.existsSync(candidate)) fs.rmSync(candidate, { force: true });
      }
      for (const folder of MANAGED_FOLDERS) {
        const candidate = path.join(root, folder);
        if (fs.existsSync(candidate)) safeRemove(root, candidate);
      }
    }
    for (const suffix of ['', '-wal', '-shm']) moveIfExists(path.join(rollback, `app.sqlite${suffix}`), `${currentDb}${suffix}`);
    for (const folder of MANAGED_FOLDERS) moveIfExists(path.join(rollback, folder), path.join(root, folder));
    if (fs.existsSync(rollback)) safeRemove(root, rollback);
    await initDatabase({ databasePath: currentDb });
    throw new Error(`Restore thất bại, dữ liệu cũ đã được hoàn tác: ${error.message}`);
  }
  } finally {
    endDatabaseMaintenance();
    fs.rmSync(validated.staging, { recursive: true, force: true });
  }
}

module.exports = {
  exportBackup,
  restoreBackup,
  validateBackupPackage,
  MANAGED_FOLDERS,
  _private: { validateEntryName, validateArchiveEntries, hashFile, assertInside },
};
