'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sql = require('mssql');
const { initDatabase, getDb, closeDatabase, inspectSqliteFile } = require('../main/database');

const TABLES = [
  { name: 'units', pk: 'id' },
  { name: 'roles', pk: 'id', replaceSeed: true },
  { name: 'vehicle_type', pk: 'vehicle_type_id' },
  { name: 'vehicle', pk: 'vehicle_id' },
  { name: 'users', pk: 'id' },
  { name: 'equipments', pk: 'id' },
  { name: 'maintenance_steps', pk: 'id', replaceSeed: true },
  { name: 'maintenance_plans', pk: 'id' },
  { name: 'maintenance_logs', pk: 'id' },
  { name: 'acceptance_records', pk: 'id' },
  { name: 'attachments', pk: 'id' },
  { name: 'qr_codes', pk: 'id' },
  { name: 'engine_maintenance', pk: 'engine_maintenance_id' },
  { name: 'audit_logs', pk: 'id' },
];

function parseArgs(argv) {
  const result = { execute: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--execute') result.execute = true;
    else if (arg === '--destination-root') result.destinationRoot = argv[++index];
    else if (arg === '--source-files-root') result.sourceFilesRoot = argv[++index];
    else if (arg === '--report') result.reportPath = argv[++index];
    else if (arg === '--help') result.help = true;
    else throw new Error(`Tham số không hỗ trợ: ${arg}`);
  }
  return result;
}

function sourceConfig() {
  const required = ['DB_SERVER', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`Thiếu biến môi trường: ${missing.join(', ')}`);
  const config = {
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    options: {
      encrypt: process.env.DB_ENCRYPT !== 'false',
      trustServerCertificate: process.env.DB_TRUST_CERT === 'true',
      enableArithAbort: true,
      readOnlyIntent: true,
    },
    pool: { max: 2, min: 0, idleTimeoutMillis: 30000 },
    connectionTimeout: 10000,
    requestTimeout: 0,
  };
  if (process.env.DB_INSTANCE) config.options.instanceName = process.env.DB_INSTANCE;
  else config.port = Number(process.env.DB_PORT) || 1433;
  return config;
}

function safeIdentifier(identifier) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) throw new Error(`Tên cột không hợp lệ: ${identifier}`);
  return `"${identifier}"`;
}

function isInside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function fileHash(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function copySourceFile(storedPath, sourceRoot, stagingRoot, folder, fileReport) {
  if (!storedPath) return null;
  if (!sourceRoot) throw new Error(`Có file '${storedPath}' nhưng chưa truyền --source-files-root.`);
  const normalized = String(storedPath).replace(/[\\/]/g, path.sep);
  const source = path.isAbsolute(normalized) ? path.resolve(normalized) : path.resolve(sourceRoot, normalized);
  if (!isInside(sourceRoot, source)) throw new Error(`Từ chối đọc file ngoài source-files-root: ${storedPath}`);
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) throw new Error(`Không tìm thấy file nguồn: ${storedPath}`);
  const targetDir = path.join(stagingRoot, folder);
  fs.mkdirSync(targetDir, { recursive: true });
  let fileName = path.basename(source);
  let target = path.join(targetDir, fileName);
  const checksum = fileHash(source);
  if (fs.existsSync(target) && fileHash(target) !== checksum) {
    const extension = path.extname(fileName);
    fileName = `${path.basename(fileName, extension)}-${checksum.slice(0, 12)}${extension}`;
    target = path.join(targetDir, fileName);
  }
  if (!fs.existsSync(target)) fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
  fileReport.push({ source: storedPath, destination: `${folder}/${fileName}`, sha256: checksum, size: fs.statSync(source).size });
  return `${folder}/${fileName}`;
}

function migrateFilePaths(table, row, sourceRoot, stagingRoot, fileReport) {
  const copy = { ...row };
  if (table === 'vehicle' && copy.img_path) {
    copy.img_path = copySourceFile(copy.img_path, sourceRoot, stagingRoot, 'vehicle-images', fileReport);
  }
  if (table === 'engine_maintenance') {
    if (copy.tech_process_file_path) copy.tech_process_file_path = copySourceFile(copy.tech_process_file_path, sourceRoot, stagingRoot, 'maintenance-files', fileReport);
    if (copy.norm_ktkt_file_path) copy.norm_ktkt_file_path = copySourceFile(copy.norm_ktkt_file_path, sourceRoot, stagingRoot, 'maintenance-files', fileReport);
  }
  if (table === 'attachments' && copy.file_path) {
    const extension = path.extname(copy.file_path).toLowerCase();
    const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
    const destinationFolder = extension === '.pdf'
      ? 'maintenance-files'
      : (imageExtensions.has(extension) ? 'vehicle-images' : null);
    if (!destinationFolder) {
      throw new Error(`Attachment không được hỗ trợ; chỉ chấp nhận PDF hoặc ảnh: ${copy.file_path}`);
    }
    copy.file_path = copySourceFile(copy.file_path, sourceRoot, stagingRoot, destinationFolder, fileReport);
  }
  return copy;
}

async function sourceCounts(pool) {
  const counts = {};
  for (const table of TABLES) {
    const result = await pool.request().query(`SELECT COUNT_BIG(*) AS total FROM [dbo].[${table.name}]`);
    counts[table.name] = Number(result.recordset[0].total);
  }
  return counts;
}

async function readTable(pool, table) {
  const result = await pool.request().query(`SELECT * FROM [dbo].[${table.name}] ORDER BY [${table.pk}]`);
  return result.recordset;
}

async function insertRows(db, table, rows, sourceRoot, stagingRoot, fileReport) {
  for (const original of rows) {
    const row = migrateFilePaths(table.name, original, sourceRoot, stagingRoot, fileReport);
    const columns = Object.keys(row);
    if (!columns.length) continue;
    const sqlText = `INSERT INTO ${safeIdentifier(table.name)} (${columns.map(safeIdentifier).join(',')}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(',')})`;
    await db.query(sqlText, columns.map((column) => row[column]));
  }
}

async function executeMigration(pool, args, counts) {
  if (!args.destinationRoot) throw new Error('--execute yêu cầu --destination-root là một thư mục mới.');
  const destinationRoot = path.resolve(args.destinationRoot);
  if (fs.existsSync(destinationRoot)) throw new Error('destination-root đã tồn tại; migration không ghi đè dữ liệu.');
  const parent = path.dirname(destinationRoot);
  fs.mkdirSync(parent, { recursive: true });
  const stagingRoot = path.join(parent, `.${path.basename(destinationRoot)}.staging-${crypto.randomUUID()}`);
  const sqlitePath = path.join(stagingRoot, 'data', 'app.sqlite');
  const sourceRoot = args.sourceFilesRoot ? path.resolve(args.sourceFilesRoot) : null;
  const fileReport = [];
  const report = { mode: 'execute', startedAt: new Date().toISOString(), sourceCounts: counts, destinationCounts: {}, files: fileReport, errors: [] };
  try {
    fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });
    await initDatabase({ databasePath: sqlitePath });
    const db = getDb();
    await db.transaction(async () => {
      await db.query('DELETE FROM maintenance_steps');
      await db.query('DELETE FROM roles');
      for (const table of TABLES) {
        const rows = await readTable(pool, table);
        await insertRows(db, table, rows, sourceRoot, stagingRoot, fileReport);
      }
    });
    for (const table of TABLES) {
      const { rows } = await db.query(`SELECT COUNT(*) AS total FROM ${safeIdentifier(table.name)}`);
      report.destinationCounts[table.name] = Number(rows[0].total);
      if (report.destinationCounts[table.name] !== counts[table.name]) throw new Error(`Sai số lượng bảng ${table.name}.`);
    }
    await closeDatabase();
    const inspection = inspectSqliteFile(sqlitePath);
    if (inspection.integrity !== 'ok' || inspection.foreignKeys.length) throw new Error('SQLite integrity/foreign key check thất bại.');
    report.integrity = inspection.integrity;
    report.foreignKeyErrors = inspection.foreignKeys;
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(stagingRoot, 'migration-report.json'), JSON.stringify(report, null, 2), 'utf8');
    fs.renameSync(stagingRoot, destinationRoot);
    return { report, destinationRoot };
  } catch (error) {
    try { await closeDatabase(); } catch (_) {}
    report.errors.push(error.message);
    if (fs.existsSync(stagingRoot)) fs.rmSync(stagingRoot, { recursive: true, force: true });
    throw error;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Dry-run: npm run migrate:mssql -- [--report report.json]');
    console.log('Thực thi: npm run migrate:mssql -- --execute --destination-root <new-folder> [--source-files-root <old-userData>]');
    return;
  }
  const pool = new sql.ConnectionPool(sourceConfig());
  await pool.connect();
  try {
    const counts = await sourceCounts(pool);
    if (!args.execute) {
      const report = { mode: 'dry-run', checkedAt: new Date().toISOString(), sourceDatabase: process.env.DB_NAME, sourceCounts: counts };
      const output = JSON.stringify(report, null, 2);
      if (args.reportPath) fs.writeFileSync(path.resolve(args.reportPath), output, { encoding: 'utf8', flag: 'wx' });
      console.log(output);
      console.log('Dry-run hoàn tất; nguồn không bị thay đổi. Dùng --execute để tạo SQLite staging mới.');
      return;
    }
    const result = await executeMigration(pool, args, counts);
    console.log(JSON.stringify({ destinationRoot: result.destinationRoot, counts: result.report.destinationCounts, migratedFiles: result.report.files.length }, null, 2));
  } finally {
    await pool.close();
  }
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((error) => {
    console.error(`[Migration] ${error.message}`);
    process.exit(1);
  });
}

module.exports = { TABLES, parseArgs, migrateFilePaths };
