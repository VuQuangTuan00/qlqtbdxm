'use strict';

process.env.NODE_ENV = 'test';

const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const AdmZip = require('adm-zip');
const Database = require('better-sqlite3');

const databaseModule = require('../main/database');
const { initDatabase, getDb, closeDatabase, inspectSqliteFile } = databaseModule;
const equipmentService = require('../main/services/equipment.service');
const planService = require('../main/services/maintenance-plan.service');
const maintenanceLogService = require('../main/services/maintenance-log.service');
const acceptanceService = require('../main/services/acceptance.service');
const reportService = require('../main/services/report.service');
const unitService = require('../main/services/unit.service');
const vehicleService = require('../main/services/vehicle.service');
const authService = require('../main/services/auth.service');
const userRepo = require('../main/repositories/user.repository');
const archiveService = require('../main/services/file-archive.service');
const { hashPassword } = require('../main/utils/hash');
const { checksum } = require('../main/database/migration-runner');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function temporaryRoot(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `qlqt-${label}-`));
}

function removeTemporaryRoot(root) {
  const temp = path.resolve(os.tmpdir());
  const target = path.resolve(root);
  const relative = path.relative(temp, target);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Từ chối xóa ngoài TEMP: ${target}`);
  }
  fs.rmSync(target, { recursive: true, force: true });
}

async function createAdmin(db, username = 'admin_test') {
  const { rows } = await db.query("SELECT id FROM roles WHERE role_code = 'admin'");
  return userRepo.create({
    username,
    password_hash: hashPassword('MatKhau!123'),
    full_name: 'Quản trị viên thử nghiệm',
    role_id: rows[0].id,
    unit_id: null,
    is_active: true,
  });
}

test('khởi tạo schema, seed bắt buộc và chạy lặp lại an toàn', async () => {
  const root = temporaryRoot('fresh');
  const dbPath = path.join(root, 'data', 'app.sqlite');
  try {
    await initDatabase({ databasePath: dbPath });
    let db = getDb();
    assert.equal((await db.query('SELECT COUNT(*) AS n FROM roles')).rows[0].n, 5);
    assert.equal((await db.query('SELECT COUNT(*) AS n FROM maintenance_steps')).rows[0].n, 26);
    assert.equal(db.raw.pragma('foreign_keys', { simple: true }), 1);
    assert.equal(db.raw.pragma('journal_mode', { simple: true }), 'wal');
    assert.equal(db.raw.pragma('busy_timeout', { simple: true }), 5000);
    await closeDatabase();
    await initDatabase({ databasePath: dbPath });
    db = getDb();
    assert.equal((await db.query('SELECT COUNT(*) AS n FROM _migrations')).rows[0].n, 1);
  } finally {
    await closeDatabase();
    removeTemporaryRoot(root);
  }
});

test('parameter binding, Unicode, constraint và transaction rollback', async () => {
  const root = temporaryRoot('binding');
  try {
    await initDatabase({ databasePath: path.join(root, 'data', 'app.sqlite') });
    const db = getDb();
    await db.query('INSERT INTO units (unit_code, unit_name) VALUES ($1,$2)', ['ĐV-01', 'Đơn vị Kỹ thuật']);
    const repeated = await db.query('SELECT * FROM units WHERE unit_code = $1 OR unit_name = $1', ['ĐV-01']);
    assert.equal(repeated.rows.length, 1);
    assert.equal(repeated.rows[0].unit_name, 'Đơn vị Kỹ thuật');
    await assert.rejects(db.query('INSERT INTO units (unit_code, unit_name) VALUES ($1,$2)', ['ĐV-01', 'Trùng']));
    await assert.rejects(db.transaction(async () => {
      await db.query('INSERT INTO units (unit_code, unit_name) VALUES ($1,$2)', ['ROLLBACK', 'Sẽ hoàn tác']);
      throw new Error('forced rollback');
    }), /forced rollback/);
    assert.equal((await db.query("SELECT COUNT(*) AS n FROM units WHERE unit_code = 'ROLLBACK'")).rows[0].n, 0);
  } finally {
    await closeDatabase();
    removeTemporaryRoot(root);
  }
});

test('authentication giữ bcrypt hash và equipment + QR là atomic', async () => {
  const root = temporaryRoot('auth-equipment');
  try {
    await initDatabase({ databasePath: path.join(root, 'data', 'app.sqlite') });
    assert.equal(await authService.needsBootstrap(), true);
    const bootstrapped = await authService.createFirstAdmin({ username: 'quantri', full_name: 'Quản trị viên', password: 'MatKhau!123' });
    assert.equal(bootstrapped.success, true);
    assert.equal(await authService.needsBootstrap(), false);
    const secondBootstrap = await authService.createFirstAdmin({ username: 'admin2', full_name: 'Admin 2', password: 'MatKhau!456' });
    assert.equal(secondBootstrap.success, false);
    const admin = await userRepo.findByUsername('quantri');
    const login = await authService.login('quantri', 'MatKhau!123');
    assert.equal(login.success, true);
    assert.equal(login.data.userId, admin.id);
    const created = await equipmentService.create({ equipment_code: 'XM-ĐB-01', equipment_name: 'Xe máy đặc biệt' }, admin.id);
    assert.equal(created.success, true);
    assert.match(created.data.qr_value, /^QLQT-/);
    assert.equal((await getDb().query('SELECT COUNT(*) AS n FROM qr_codes WHERE equipment_id = $1', [created.data.id])).rows[0].n, 1);
    const removed = await equipmentService.remove(created.data.id, admin.id);
    assert.equal(removed.success, true);
    assert.equal((await getDb().query('SELECT COUNT(*) AS n FROM qr_codes WHERE equipment_id = $1', [created.data.id])).rows[0].n, 0);
    await authService.logout();
  } finally {
    await closeDatabase();
    removeTemporaryRoot(root);
  }
});

test('tạo kế hoạch sinh đủ log trong cùng transaction', async () => {
  const root = temporaryRoot('plan');
  try {
    await initDatabase({ databasePath: path.join(root, 'data', 'app.sqlite') });
    const admin = await createAdmin(getDb());
    const equipment = await equipmentService.create({ equipment_code: 'XM-PLAN-01', equipment_name: 'Xe lập kế hoạch' }, admin.id);
    const plan = await planService.create({ equipment_id: equipment.data.id, maintenance_type: 'dinh_ky', planned_date: '2026-11-01' }, admin.id);
    assert.equal(plan.success, true);
    assert.match(plan.data.plan_code, /^KH-202611-\d{4}$/);
    assert.equal(plan.data.logs.length, 10);
    assert.equal((await getDb().query('PRAGMA foreign_key_check')).rows.length, 0);
  } finally {
    await closeDatabase();
    removeTemporaryRoot(root);
  }
});

test('đơn vị phân cấp, người dùng, khóa tài khoản và đổi mật khẩu', async () => {
  const root = temporaryRoot('unit-user');
  try {
    await initDatabase({ databasePath: path.join(root, 'data', 'app.sqlite') });
    const parent = await unitService.create({ unit_code: 'BTL', unit_name: 'Bộ Tư lệnh' });
    const child = await unitService.create({
      unit_code: 'PKT',
      unit_name: 'Phòng Kỹ thuật',
      parent_unit_id: parent.data.id,
    });
    assert.equal(parent.success, true);
    assert.equal(child.success, true);
    assert.equal((await unitService.create({ unit_code: 'btl', unit_name: 'Trùng mã' })).success, false);

    const tree = await unitService.getTree();
    assert.equal(tree.data.length, 1);
    assert.equal(tree.data[0].children[0].id, child.data.id);
    const searched = await unitService.list({ search: 'kỹ thuật' });
    assert.equal(searched.data.length, 1);
    const renamed = await unitService.update(child.data.id, { unit_name: 'Phòng Kỹ thuật xe máy' });
    assert.equal(renamed.data.unit_name, 'Phòng Kỹ thuật xe máy');
    await assert.rejects(unitService.remove(parent.data.id), /FOREIGN KEY/);

    const { rows: roles } = await getDb().query("SELECT id FROM roles WHERE role_code = 'technician'");
    const technician = await userRepo.create({
      username: 'kythuatvien',
      password_hash: hashPassword('MatKhau!123'),
      full_name: 'Kỹ thuật viên',
      role_id: roles[0].id,
      unit_id: child.data.id,
      is_active: true,
    });
    const listed = await userRepo.listUsers({ search: 'kỹ thuật', unitId: child.data.id });
    assert.equal(listed.total, 1);
    assert.equal(listed.items[0].id, technician.id);

    await userRepo.setActive(technician.id, false);
    assert.equal((await authService.login('kythuatvien', 'MatKhau!123')).success, false);
    await userRepo.setActive(technician.id, true);
    assert.equal((await authService.login('kythuatvien', 'MatKhau!123')).success, true);
    assert.equal((await authService.changePassword(technician.id, 'sai-mat-khau', 'MatKhau!456')).success, false);
    assert.equal((await authService.changePassword(technician.id, 'MatKhau!123', 'MatKhau!456')).success, true);
    await authService.logout();
    assert.equal((await authService.login('kythuatvien', 'MatKhau!123')).success, false);
    assert.equal((await authService.login('kythuatvien', 'MatKhau!456')).success, true);
  } finally {
    try { await authService.logout(); } catch (_) {}
    await closeDatabase();
    removeTemporaryRoot(root);
  }
});

test('loại xe, hạng mục động cơ, ảnh và tài liệu PDF dùng đường dẫn tương đối', async () => {
  const root = temporaryRoot('vehicle-files');
  process.env.QLQT_USER_DATA_PATH = root;
  try {
    await initDatabase({ databasePath: path.join(root, 'data', 'app.sqlite') });
    const admin = await createAdmin(getDb());
    const type = await vehicleService.createVehicleType({ vehicle_type_name: 'Xe mô tô' });
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
    const vehicle = await vehicleService.createVehicle({
      vehicle_name: 'Honda thử nghiệm',
      img_name: 'xe.png',
      img_buffer: png,
    }, admin.id);
    assert.equal(vehicle.success, true);
    assert.equal(path.isAbsolute(vehicle.data.img_path), true);
    assert.equal(fs.existsSync(vehicle.data.img_path), true);
    const storedVehicle = (await getDb().query('SELECT * FROM vehicle WHERE vehicle_id = $1', [vehicle.data.vehicle_id])).rows[0];
    assert.equal(path.isAbsolute(storedVehicle.img_path), false);

    const updated = await vehicleService.updateVehicle(vehicle.data.vehicle_id, {
      vehicle_type_id: type.data.vehicle_type_id,
    }, admin.id);
    assert.equal(updated.data.vehicle_type_name, 'Xe mô tô');
    const first = await vehicleService.createMaintenance({
      vehicle_id: vehicle.data.vehicle_id,
      maintenance_name: 'Thay dầu động cơ',
    }, admin.id);
    const second = await vehicleService.createMaintenance({
      vehicle_id: vehicle.data.vehicle_id,
      maintenance_name: 'Kiểm tra phanh',
    }, admin.id);
    assert.equal((await vehicleService.reorderMaintenance(vehicle.data.vehicle_id, [second.data.engine_maintenance_id, first.data.engine_maintenance_id], admin.id)).success, true);
    const reordered = await vehicleService.listMaintenance(vehicle.data.vehicle_id);
    assert.equal(reordered.data[0].engine_maintenance_id, second.data.engine_maintenance_id);

    const invalidPdf = await vehicleService.uploadFile(first.data.engine_maintenance_id, 'tech_process', {
      file_name: 'gia.pdf', file_buffer: Buffer.from('not a pdf'),
    }, admin.id);
    assert.equal(invalidPdf.success, false);
    const pdfBytes = Buffer.from('%PDF-1.4\nfixture regression');
    assert.equal((await vehicleService.uploadFile(first.data.engine_maintenance_id, 'tech_process', {
      file_name: 'quy-trinh.pdf', file_buffer: pdfBytes,
    }, admin.id)).success, true);
    const storedDocument = (await getDb().query(
      'SELECT tech_process_file_path FROM engine_maintenance WHERE engine_maintenance_id = $1',
      [first.data.engine_maintenance_id]
    )).rows[0];
    assert.equal(path.isAbsolute(storedDocument.tech_process_file_path), false);
    const readDocument = await vehicleService.readFile(first.data.engine_maintenance_id, 'tech_process');
    assert.equal(Buffer.from(readDocument.data.base64, 'base64').equals(pdfBytes), true);
    assert.equal((await vehicleService.deleteFile(first.data.engine_maintenance_id, 'tech_process', admin.id)).success, true);
    assert.equal((await vehicleService.readFile(first.data.engine_maintenance_id, 'tech_process')).success, false);

    const imagePath = vehicle.data.img_path;
    assert.equal((await vehicleService.updateVehicle(vehicle.data.vehicle_id, { remove_img: true }, admin.id)).success, true);
    assert.equal(fs.existsSync(imagePath), false);
    await vehicleService.deleteMaintenance(first.data.engine_maintenance_id, admin.id);
    await vehicleService.deleteMaintenance(second.data.engine_maintenance_id, admin.id);
    assert.equal((await vehicleService.deleteVehicle(vehicle.data.vehicle_id, admin.id)).success, true);
    assert.equal((await vehicleService.deleteVehicleType(type.data.vehicle_type_id)).success, true);
  } finally {
    delete process.env.QLQT_USER_DATA_PATH;
    await closeDatabase();
    removeTemporaryRoot(root);
  }
});

test('hoàn tất bảo dưỡng, nghiệm thu và tổng hợp báo cáo', async () => {
  const root = temporaryRoot('workflow-report');
  try {
    await initDatabase({ databasePath: path.join(root, 'data', 'app.sqlite') });
    const admin = await createAdmin(getDb());
    const unit = await unitService.create({ unit_code: 'DV-BC', unit_name: 'Đơn vị báo cáo' });
    const equipment = await equipmentService.create({
      equipment_code: 'XM-REPORT-01',
      equipment_name: 'Xe kiểm thử báo cáo',
      unit_id: unit.data.id,
    }, admin.id);
    const completedPlan = await planService.create({
      equipment_id: equipment.data.id,
      maintenance_type: 'kiem_tra',
      planned_date: '2026-10-10',
    }, admin.id);
    assert.equal((await planService.approve(completedPlan.data.id, admin.id)).success, true);
    for (const log of completedPlan.data.logs) {
      const result = await maintenanceLogService.updateStatus(log.id, 'completed', { result: 'Đạt' }, admin.id);
      assert.equal(result.success, true);
    }
    const finished = await planService.get(completedPlan.data.id);
    assert.equal(finished.data.status, 'completed');

    const acceptance = await acceptanceService.create({
      plan_id: completedPlan.data.id,
      conclusion: 'dat',
      note: 'Đủ điều kiện bàn giao',
      acceptance_date: '2026-10-11',
    }, admin.id);
    assert.equal(acceptance.success, true);
    assert.equal((await acceptanceService.create({ plan_id: completedPlan.data.id, conclusion: 'dat' }, admin.id)).success, false);
    const updatedAcceptance = await acceptanceService.update(acceptance.data.id, { note: 'Đã bàn giao' }, admin.id);
    assert.equal(updatedAcceptance.data.note, 'Đã bàn giao');
    const acceptanceList = await acceptanceService.list({ conclusion: 'dat', fromDate: '2026-01-01', toDate: '2026-12-31' });
    assert.equal(acceptanceList.data.total, 1);

    const overduePlan = await planService.create({
      equipment_id: equipment.data.id,
      maintenance_type: 'kiem_tra',
      planned_date: '2020-01-01',
    }, admin.id);
    assert.equal(overduePlan.success, true);

    const summary = await reportService.summary();
    assert.deepEqual({
      totalEquipments: summary.data.totalEquipments,
      totalPlans: summary.data.totalPlans,
      completedPlans: summary.data.completedPlans,
      pendingPlans: summary.data.pendingPlans,
      overduePlans: summary.data.overduePlans,
    }, { totalEquipments: 1, totalPlans: 2, completedPlans: 1, pendingPlans: 1, overduePlans: 1 });
    const status = await reportService.equipmentStatus();
    assert.equal(status.data.byStatus.find((item) => item.status === 'active').count, 1);
    assert.equal(status.data.byUnit[0].unit_name, 'Đơn vị báo cáo');
    const period = await reportService.maintenanceByPeriod({ fromDate: '2026-01-01', toDate: '2026-12-31' });
    assert.equal(period.data.completedPlans.length, 1);
    assert.equal(period.data.completedPlans[0].conclusion, 'dat');
    const overdue = await reportService.overdueEquipment();
    assert.equal(overdue.data.length, 1);
    assert.equal(overdue.data[0].plan_code, overduePlan.data.plan_code);
    assert.equal((await getDb().query('PRAGMA foreign_key_check')).rows.length, 0);
  } finally {
    await closeDatabase();
    removeTemporaryRoot(root);
  }
});

test('migration runner rollback migration lỗi và từ chối schema mới hơn', async () => {
  const root = temporaryRoot('migration');
  const migrationDir = path.join(root, 'migrations');
  const failedDb = path.join(root, 'failed.sqlite');
  fs.mkdirSync(migrationDir);
  fs.writeFileSync(path.join(migrationDir, '001_ok.sql'), 'CREATE TABLE stable (id INTEGER PRIMARY KEY);', 'utf8');
  fs.writeFileSync(path.join(migrationDir, '002_fail.sql'), 'CREATE TABLE partial (id INTEGER); INVALID SQL;', 'utf8');
  try {
    await assert.rejects(initDatabase({ databasePath: failedDb, migrationDir }));
    const raw = new Database(failedDb);
    assert.ok(raw.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='stable'").get());
    assert.equal(raw.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='partial'").get(), undefined);
    raw.close();

    const normalDb = path.join(root, 'newer.sqlite');
    await initDatabase({ databasePath: normalDb });
    await getDb().query("INSERT INTO _migrations (filename, checksum) VALUES ('999_future.sql','x')");
    await closeDatabase();
    await assert.rejects(initDatabase({ databasePath: normalDb }), /không được ứng dụng hiện tại hỗ trợ/);
  } finally {
    await closeDatabase();
    removeTemporaryRoot(root);
  }
});

test('nâng checksum legacy tương đương và vẫn từ chối checksum không xác định', async () => {
  const root = temporaryRoot('legacy-checksum');
  const dbPath = path.join(root, 'legacy.sqlite');
  const migrationPath = path.join(__dirname, '..', 'main', 'database', 'migrations-sqlite', '001_initial.sql');
  try {
    await initDatabase({ databasePath: dbPath });
    await getDb().query(
      'UPDATE _migrations SET checksum = $1 WHERE filename = $2',
      ['4149b36eb9404d9acef92fdfc4e190a318a3fdd0f4659f6955b17db50a16811a', '001_initial.sql']
    );
    await closeDatabase();

    await initDatabase({ databasePath: dbPath });
    const upgraded = (await getDb().query(
      'SELECT checksum FROM _migrations WHERE filename = $1', ['001_initial.sql']
    )).rows[0].checksum;
    assert.equal(upgraded, checksum(fs.readFileSync(migrationPath, 'utf8')));
    await getDb().query(
      'UPDATE _migrations SET checksum = $1 WHERE filename = $2',
      ['checksum-khong-xac-dinh', '001_initial.sql']
    );
    await closeDatabase();
    await assert.rejects(initDatabase({ databasePath: dbPath }), /bị thay đổi nội dung/);
  } finally {
    await closeDatabase();
    removeTemporaryRoot(root);
  }
});

test('backup/restore end-to-end và rollback khi swap lỗi', async () => {
  const root = temporaryRoot('backup');
  const external = temporaryRoot('backup-output');
  const dbPath = path.join(root, 'data', 'app.sqlite');
  try {
    await initDatabase({ databasePath: dbPath });
    const db = getDb();
    await db.query('INSERT INTO units (unit_code, unit_name) VALUES ($1,$2)', ['BASE', 'Dữ liệu gốc']);
    fs.mkdirSync(path.join(root, 'maintenance-files'), { recursive: true });
    fs.writeFileSync(path.join(root, 'maintenance-files', 'goc.pdf'), Buffer.from('%PDF-1.4\nfixture'));
    fs.mkdirSync(path.join(root, 'vehicle-images'), { recursive: true });
    fs.writeFileSync(path.join(root, 'vehicle-images', 'xe.png'), Buffer.from('89504e470d0a1a0a00000000', 'hex'));
    fs.mkdirSync(path.join(root, 'uploads'), { recursive: true });
    fs.writeFileSync(path.join(root, 'uploads', 'legacy.pdf'), Buffer.from('%PDF-1.4\nlegacy'));
    const backupPath = path.join(external, 'backup.zip');
    await archiveService.exportBackup(backupPath, { userDataPath: root, appVersion: 'test' });
    assert.ok(fs.statSync(backupPath).size > 0);
    const zip = new AdmZip(backupPath);
    const entryNames = zip.getEntries().map((entry) => entry.entryName);
    const manifest = JSON.parse(zip.readAsText('manifest.json'));
    assert.equal(manifest.version, 3);
    assert.deepEqual(manifest.fileFolders, ['vehicle-images', 'maintenance-files']);
    assert.ok(entryNames.includes('files/vehicle-images/xe.png'));
    assert.ok(entryNames.includes('files/maintenance-files/goc.pdf'));
    assert.equal(entryNames.some((name) => name.startsWith('files/uploads/')), false);
    const legacyContent = Buffer.from('%PDF-1.4\nlegacy-v2');
    const legacyBackupPath = path.join(external, 'backup-v2.zip');
    const legacyZip = new AdmZip(backupPath);
    legacyZip.addFile('files/uploads/legacy-v2.pdf', legacyContent);
    manifest.version = 2;
    delete manifest.fileFolders;
    manifest.files.push({
      path: 'files/uploads/legacy-v2.pdf',
      size: legacyContent.length,
      sha256: require('crypto').createHash('sha256').update(legacyContent).digest('hex'),
    });
    legacyZip.updateFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)));
    legacyZip.writeZip(legacyBackupPath);
    const validatedLegacy = await archiveService.validateBackupPackage(legacyBackupPath);
    assert.equal(validatedLegacy.manifest.version, 2);
    removeTemporaryRoot(validatedLegacy.staging);
    await db.query('INSERT INTO units (unit_code, unit_name) VALUES ($1,$2)', ['MUTATED', 'Sau backup']);
    fs.writeFileSync(path.join(root, 'maintenance-files', 'them.pdf'), Buffer.from('%PDF-1.4\nchanged'));
    await archiveService.restoreBackup(backupPath, { userDataPath: root });
    assert.equal((await getDb().query("SELECT COUNT(*) AS n FROM units WHERE unit_code='MUTATED'")).rows[0].n, 0);
    assert.equal(fs.existsSync(path.join(root, 'maintenance-files', 'them.pdf')), false);
    assert.equal(fs.readFileSync(path.join(root, 'maintenance-files', 'goc.pdf'), 'utf8'), '%PDF-1.4\nfixture');
    assert.equal(fs.existsSync(path.join(root, 'vehicle-images', 'xe.png')), true);
    assert.equal(fs.existsSync(path.join(root, 'uploads', 'legacy.pdf')), true);

    await getDb().query('INSERT INTO units (unit_code, unit_name) VALUES ($1,$2)', ['KEEP', 'Phải được rollback giữ lại']);
    await assert.rejects(
      archiveService.restoreBackup(backupPath, { userDataPath: root, afterSwap: async () => { throw new Error('simulated'); } }),
      /dữ liệu cũ đã được hoàn tác/
    );
    assert.equal((await getDb().query("SELECT COUNT(*) AS n FROM units WHERE unit_code='KEEP'")).rows[0].n, 1);
    assert.equal(inspectSqliteFile(dbPath).integrity, 'ok');
  } finally {
    await closeDatabase();
    removeTemporaryRoot(root);
    removeTemporaryRoot(external);
  }
});

test('từ chối backup hỏng và đường dẫn ZIP nguy hiểm', async () => {
  const root = temporaryRoot('corrupt');
  try {
    const corrupt = path.join(root, 'corrupt.sqlite');
    fs.writeFileSync(corrupt, cryptoRandomBytes(512));
    assert.throws(() => inspectSqliteFile(corrupt));
    assert.equal(archiveService._private.validateEntryName('../escape.txt'), false);
    assert.equal(archiveService._private.validateEntryName('C:/escape.txt'), false);
    assert.equal(archiveService._private.validateEntryName('database/app.sqlite'), true);
    const wrongImages = path.join(root, 'vehicle-images');
    fs.mkdirSync(wrongImages);
    fs.writeFileSync(path.join(wrongImages, 'not-an-image.pdf'), '%PDF-1.4');
    assert.throws(() => archiveService._private.validateManagedFolder(wrongImages, 'vehicle-images'));
    const wrongPdfs = path.join(root, 'maintenance-files');
    fs.mkdirSync(wrongPdfs);
    fs.writeFileSync(path.join(wrongPdfs, 'not-a-pdf.pdf'), 'plain text');
    assert.throws(() => archiveService._private.validateManagedFolder(wrongPdfs, 'maintenance-files'));
  } finally {
    removeTemporaryRoot(root);
  }
});

function cryptoRandomBytes(size) {
  return require('crypto').randomBytes(size);
}

async function run() {
  let failed = 0;
  for (const item of tests) {
    const started = Date.now();
    try {
      await item.fn();
      console.log(`PASS ${item.name} (${Date.now() - started}ms)`);
    } catch (error) {
      failed++;
      console.error(`FAIL ${item.name}`);
      console.error(error.stack || error);
      try { await closeDatabase(); } catch (_) {}
    }
  }
  console.log(`\nTests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  process.exit(failed ? 1 : 0);
}

run().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
