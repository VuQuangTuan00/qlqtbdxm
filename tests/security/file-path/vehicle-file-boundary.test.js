'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { withTempDir } = require('../../helpers/test-environment');
const {
  createFileStorageService,
} = require('../../../main/services/file-storage.service');
const {
  createPendingFileCleanupService,
} = require('../../../main/services/pending-file-cleanup.service');

function loadVehicleService(
  userDataPath,
  techProcessRepo,
  shellCalls = [],
  vehicleRepo = {},
  cleanupService,
  storageRoot = userDataPath,
  normKtktRepo = techProcessRepo,
) {
  const electron = {
    app: { getPath(name) { assert.equal(name, 'userData'); return userDataPath; } },
    shell: { async openPath(filePath) { shellCalls.push(filePath); return ''; } },
  };
  const emptyRepo = {};
  const database = {
    getDb() { return { async query() { return { rows: [{ c: 0 }], rowCount: 0 }; } }; },
  };
  const modulePath = require.resolve('../../../main/services/vehicle.service');
  const cleanupModulePath = require.resolve('../../../main/services/pending-file-cleanup.service');
  const storageModulePath = require.resolve('../../../main/services/file-storage.service');
  const storageService = createFileStorageService({
    readConfig: () => ({ fileStorageRoot: storageRoot }),
    normalizeRoot: (value) => path.resolve(value),
  });
  const resolvedCleanupService = cleanupService || createPendingFileCleanupService({
    getUserDataPath: () => userDataPath,
    getStorageRoot: () => path.resolve(storageRoot),
    logger: { info() {}, warn() {}, error() {} },
  });
  const replacements = new Map([
    [require.resolve('electron'), electron],
    [require.resolve('../../../main/repositories/vehicle.repository'), vehicleRepo],
    [require.resolve('../../../main/repositories/tech-process-maintenance.repository'), techProcessRepo],
    [require.resolve('../../../main/repositories/norm-ktkt-maintenance.repository'), normKtktRepo],
    [require.resolve('../../../main/repositories/vehicle-type.repository'), emptyRepo],
    [require.resolve('../../../main/database/index'), database],
    [require.resolve('../../../main/utils/logger'), { info() {}, warn() {}, error() {} }],
    [storageModulePath, storageService],
    [cleanupModulePath, resolvedCleanupService],
  ]);
  const saved = new Map([[modulePath, require.cache[modulePath]]]);
  delete require.cache[modulePath];
  for (const [replacementPath, exports] of replacements) {
    saved.set(replacementPath, require.cache[replacementPath]);
    require.cache[replacementPath] = {
      id: replacementPath,
      filename: replacementPath,
      loaded: true,
      exports,
    };
  }
  const service = require(modulePath);
  for (const [savedPath, cached] of saved) {
    if (cached) require.cache[savedPath] = cached;
    else delete require.cache[savedPath];
  }
  return service;
}

test('read/open reject an absolute maintenance path outside shared storage', async () => {
  await withTempDir('vehicle-path-read-', async (root) => {
    const userData = path.join(root, 'profile');
    fs.mkdirSync(userData);
    const outside = path.join(root, 'outside.pdf');
    fs.writeFileSync(outside, '%PDF-1.4 outside');
    const item = {
      id: 1,
      tech_process_file_path: outside,
      tech_process_file_name: 'outside.pdf',
    };
    const shellCalls = [];
    const service = loadVehicleService(userData, {
      async findById() { return item; },
    }, shellCalls);

    assert.equal((await service.readFile(1, 'tech_process')).success, false);
    assert.equal((await service.openFile(1, 'tech_process')).success, false);
    assert.deepEqual(shellCalls, []);
  });
});

test('deleteFile never deletes or clears a record for an absolute path', async () => {
  await withTempDir('vehicle-path-delete-', async (root) => {
    const userData = path.join(root, 'profile');
    fs.mkdirSync(userData);
    const outside = path.join(root, 'outside.pdf');
    fs.writeFileSync(outside, '%PDF-1.4 outside');
    let updateCalled = false;
    const service = loadVehicleService(userData, {
      async findById() {
        return { id: 1, tech_process_file_path: outside, tech_process_file_name: 'outside.pdf' };
      },
      async update() { updateCalled = true; },
    });

    const result = await service.deleteFile(1, 'tech_process', 7);
    assert.equal(result.success, false);
    assert.equal(fs.existsSync(outside), true);
    assert.equal(updateCalled, false);
  });
});

test('file operations reject an unknown maintenance tab', async () => {
  await withTempDir('vehicle-path-tab-', async (userData) => {
    let updateCalled = false;
    const service = loadVehicleService(userData, {
      async findById() { return { id: 1 }; },
      async update() { updateCalled = true; },
    });

    const result = await service.uploadFile(1, 'unexpected', {
      file_name: 'document.pdf',
      file_buffer: Buffer.from('%PDF-1.4 valid'),
    }, 7);
    assert.equal(result.success, false);
    assert.equal(updateCalled, false);
  });
});

test('PDF upload validates extension and signature before writing', async () => {
  await withTempDir('vehicle-pdf-validation-', async (userData) => {
    let updateCalled = false;
    const techRepo = {
      async findById() { return { id: 1 }; },
      async update() { updateCalled = true; },
    };
    const service = loadVehicleService(userData, techRepo);

    const wrongExtension = await service.uploadFile(1, 'tech_process', {
      file_name: 'document.txt',
      file_buffer: Buffer.from('%PDF-1.4 valid'),
    }, 7);
    const wrongSignature = await service.uploadFile(1, 'tech_process', {
      file_name: 'document.pdf',
      file_buffer: Buffer.from('<script>not a pdf</script>'),
    }, 7);

    assert.equal(wrongExtension.success, false);
    assert.equal(wrongSignature.success, false);
    assert.equal(updateCalled, false);
    assert.equal(fs.existsSync(path.join(userData, 'maintenance-files')), false);
  });
});

test('norm KT-KT file operations use only the norm maintenance repository', async () => {
  await withTempDir('vehicle-norm-file-', async (userData) => {
    const calls = [];
    let item = {
      norm_ktkt_id: 6,
      norm_ktkt_file_name: null,
      norm_ktkt_file_path: null,
    };
    const techRepo = {
      async findById() { calls.push('tech-find'); return null; },
      async update() { calls.push('tech-update'); },
    };
    const normRepo = {
      async findById() { calls.push('norm-find'); return item; },
      async update(_id, data) {
        calls.push(['norm-update', data]);
        item = { ...item, ...data };
        return item;
      },
    };
    const shellCalls = [];
    const service = loadVehicleService(
      userData, techRepo, shellCalls, {}, undefined, userData, normRepo,
    );

    const uploaded = await service.uploadFile(6, 'norm_ktkt', {
      file_name: 'norm.pdf',
      file_buffer: Buffer.from('%PDF-1.4 norm'),
    }, 7);
    const read = await service.readFile(6, 'norm_ktkt');
    const opened = await service.openFile(6, 'norm_ktkt');
    const deleted = await service.deleteFile(6, 'norm_ktkt', 7);

    assert.equal(uploaded.success, true);
    assert.equal(read.success, true);
    assert.equal(Buffer.from(read.data.base64, 'base64').toString(), '%PDF-1.4 norm');
    assert.equal(opened.success, true);
    assert.equal(deleted.success, true);
    assert.equal(shellCalls.length, 1);
    assert.ok(calls.filter((call) => call === 'norm-find').length >= 4);
    assert.equal(calls.some((call) => call === 'tech-find' || call === 'tech-update'), false);
    assert.equal(Object.keys(calls.find((call) => Array.isArray(call))[1]).sort().join(','),
      'norm_ktkt_file_name,norm_ktkt_file_path');
    assert.equal(item.norm_ktkt_file_path, null);
    assert.equal(fs.readdirSync(path.join(userData, 'maintenance-files')).length, 0);
  });
});

test('readFile accepts only a maintenance-files relative path and rejects uploads', async () => {
  await withTempDir('vehicle-path-valid-', async (userData) => {
    const currentDir = path.join(userData, 'maintenance-files');
    const legacyDir = path.join(userData, 'uploads');
    fs.mkdirSync(currentDir);
    fs.mkdirSync(legacyDir);
    fs.writeFileSync(path.join(currentDir, 'current.pdf'), '%PDF-1.4 current');
    fs.writeFileSync(path.join(legacyDir, 'legacy.pdf'), '%PDF-1.4 legacy');
    let item = {
      tech_process_file_path: path.join('maintenance-files', 'current.pdf'),
      tech_process_file_name: 'current.pdf',
    };
    const service = loadVehicleService(userData, {
      async findById() { return item; },
    });

    const current = await service.readFile(1, 'tech_process');
    assert.equal(Buffer.from(current.data.base64, 'base64').toString(), '%PDF-1.4 current');

    item = {
      tech_process_file_path: 'uploads/legacy.pdf',
      tech_process_file_name: 'legacy.pdf',
    };
    const legacy = await service.readFile(1, 'tech_process');
    assert.equal(legacy.success, false);
  });
});

test('a failed PDF metadata update removes the new file and preserves the old file', async () => {
  await withTempDir('vehicle-upload-rollback-', async (userData) => {
    const pdfDir = path.join(userData, 'maintenance-files');
    fs.mkdirSync(pdfDir);
    const oldPath = path.join(pdfDir, 'old.pdf');
    fs.writeFileSync(oldPath, '%PDF-1.4 old');
    const service = loadVehicleService(userData, {
      async findById() { return { tech_process_file_path: 'maintenance-files/old.pdf' }; },
      async update() { throw new Error('database update failed'); },
    });

    await assert.rejects(
      service.uploadFile(1, 'tech_process', {
        file_name: 'replacement.pdf',
        file_buffer: Buffer.from('%PDF-1.4 replacement'),
      }, 7),
      /database update failed/
    );
    assert.equal(fs.readFileSync(oldPath, 'utf8'), '%PDF-1.4 old');
    assert.deepEqual(fs.readdirSync(pdfDir), ['old.pdf']);
  });
});

test('a failed PDF delete metadata update preserves the physical file', async () => {
  await withTempDir('vehicle-delete-rollback-', async (userData) => {
    const pdfDir = path.join(userData, 'maintenance-files');
    fs.mkdirSync(pdfDir);
    const oldPath = path.join(pdfDir, 'old.pdf');
    fs.writeFileSync(oldPath, '%PDF-1.4 old');
    const service = loadVehicleService(userData, {
      async findById() { return { tech_process_file_path: 'maintenance-files/old.pdf' }; },
      async update() { throw new Error('database update failed'); },
    });

    await assert.rejects(service.deleteFile(1, 'tech_process', 7), /database update failed/);
    assert.equal(fs.existsSync(oldPath), true);
  });
});

test('a zero-row metadata update preserves the existing PDF during replacement or deletion', async () => {
  await withTempDir('vehicle-zero-row-file-update-', async (userData) => {
    const pdfDir = path.join(userData, 'maintenance-files');
    fs.mkdirSync(pdfDir);
    const oldPath = path.join(pdfDir, 'old.pdf');
    fs.writeFileSync(oldPath, '%PDF-1.4 old');
    const service = loadVehicleService(userData, {
      async findById() {
        return {
          tech_process_file_path: 'maintenance-files/old.pdf',
          tech_process_file_name: 'old.pdf',
        };
      },
      async update() { return null; },
    });

    await assert.rejects(service.uploadFile(1, 'tech_process', {
      file_name: 'replacement.pdf',
      file_buffer: Buffer.from('%PDF-1.4 replacement'),
    }, 7), /Không thể cập nhật thông tin file/);
    const deleteResult = await service.deleteFile(1, 'tech_process', 7);

    assert.equal(deleteResult.success, false);
    assert.equal(fs.readFileSync(oldPath, 'utf8'), '%PDF-1.4 old');
    assert.deepEqual(fs.readdirSync(pdfDir), ['old.pdf']);
  });
});

test('a symlink inside maintenance-files cannot escape the approved root', async (t) => {
  await withTempDir('vehicle-path-symlink-', async (root) => {
    const userData = path.join(root, 'profile');
    const pdfDir = path.join(userData, 'maintenance-files');
    fs.mkdirSync(pdfDir, { recursive: true });
    const outside = path.join(root, 'outside.pdf');
    const link = path.join(pdfDir, 'linked.pdf');
    fs.writeFileSync(outside, '%PDF-1.4 outside');
    try {
      fs.symlinkSync(outside, link, 'file');
    } catch (error) {
      if (['EPERM', 'EACCES', 'UNKNOWN'].includes(error.code)) {
        t.skip(`symlink creation is not permitted: ${error.code}`);
        return;
      }
      throw error;
    }
    const service = loadVehicleService(userData, {
      async findById() {
        return { tech_process_file_path: 'maintenance-files/linked.pdf', tech_process_file_name: 'linked.pdf' };
      },
    });

    assert.equal((await service.readFile(1, 'tech_process')).success, false);
  });
});

test('vehicle image upload rejects a fake image before writing or calling the repository', async () => {
  await withTempDir('vehicle-image-invalid-', async (userData) => {
    let createCalled = false;
    const service = loadVehicleService(userData, {}, [], {
      async create() { createCalled = true; return { vehicle_id: 1 }; },
    });

    const result = await service.createVehicle({
      vehicle_name: 'Xe thử nghiệm',
      img_name: 'image.png',
      img_buffer: Buffer.from('<script>not an image</script>'),
    }, 7);
    assert.equal(result.success, false);
    assert.equal(createCalled, false);
    assert.equal(fs.existsSync(path.join(userData, 'vehicle-images')), false);
  });
});

test('a failed vehicle create removes the newly staged image', async () => {
  await withTempDir('vehicle-image-rollback-', async (userData) => {
    const png = Buffer.from('89504e470d0a1a0a00000000', 'hex');
    const service = loadVehicleService(userData, {}, [], {
      async create() { throw new Error('database create failed'); },
    });

    await assert.rejects(service.createVehicle({
      vehicle_name: 'Xe thử nghiệm',
      img_name: 'image.png',
      img_buffer: png,
    }, 7), /database create failed/);
    assert.deepEqual(fs.readdirSync(path.join(userData, 'vehicle-images')), []);
  });
});

test('a failed vehicle update preserves the old image and removes the replacement', async () => {
  await withTempDir('vehicle-image-update-', async (userData) => {
    const imageDir = path.join(userData, 'vehicle-images');
    fs.mkdirSync(imageDir);
    const oldPath = path.join(imageDir, 'old.png');
    fs.writeFileSync(oldPath, Buffer.from('89504e470d0a1a0a01', 'hex'));
    const png = Buffer.from('89504e470d0a1a0a00000000', 'hex');
    const service = loadVehicleService(userData, {}, [], {
      async findById() { return { vehicle_id: 1, img_path: 'vehicle-images/old.png' }; },
      async update() { throw new Error('database update failed'); },
    });

    await assert.rejects(service.updateVehicle(1, {
      img_name: 'replacement.png',
      img_buffer: png,
    }, 7), /database update failed/);
    assert.equal(fs.existsSync(oldPath), true);
    assert.deepEqual(fs.readdirSync(imageDir), ['old.png']);
  });
});

test('a failed maintenance delete preserves its type-specific PDF file', async () => {
  await withTempDir('maintenance-delete-files-', async (userData) => {
    const pdfDir = path.join(userData, 'maintenance-files');
    fs.mkdirSync(pdfDir);
    const techPath = path.join(pdfDir, 'tech.pdf');
    const normPath = path.join(pdfDir, 'norm.pdf');
    fs.writeFileSync(techPath, '%PDF-1.4 tech');
    fs.writeFileSync(normPath, '%PDF-1.4 norm');
    const service = loadVehicleService(userData, {
      async findById() {
        return {
          tech_process_file_path: 'maintenance-files/tech.pdf',
          norm_ktkt_file_path: 'maintenance-files/norm.pdf',
        };
      },
      async delete() { throw new Error('database delete failed'); },
    });

    await assert.rejects(service.deleteMaintenance(1, 'tech_process', 7), /database delete failed/);
    assert.equal(fs.existsSync(techPath), true);
    assert.equal(fs.existsSync(normPath), true);
  });
});

test('deleting one maintenance type removes only its attached PDF', async () => {
  await withTempDir('maintenance-type-delete-', async (userData) => {
    const pdfDir = path.join(userData, 'maintenance-files');
    fs.mkdirSync(pdfDir);
    const techPath = path.join(pdfDir, 'tech.pdf');
    const normPath = path.join(pdfDir, 'norm.pdf');
    fs.writeFileSync(techPath, '%PDF-1.4 tech');
    fs.writeFileSync(normPath, '%PDF-1.4 norm');
    const techRepo = {
      async findById() { return { tech_process_file_path: 'maintenance-files/tech.pdf' }; },
      async delete() { return true; },
    };
    const normRepo = {
      async findById() { return { norm_ktkt_file_path: 'maintenance-files/norm.pdf' }; },
    };
    const service = loadVehicleService(userData, techRepo, [], {}, undefined, userData, normRepo);

    const result = await service.deleteMaintenance(1, 'tech_process', 7);

    assert.equal(result.success, true);
    assert.equal(fs.existsSync(techPath), false);
    assert.equal(fs.existsSync(normPath), true);
  });
});

test('deleting a vehicle cleans PDF files from both maintenance tables', async () => {
  await withTempDir('vehicle-delete-maintenance-files-', async (userData) => {
    const pdfDir = path.join(userData, 'maintenance-files');
    fs.mkdirSync(pdfDir);
    const techPath = path.join(pdfDir, 'tech.pdf');
    const normPath = path.join(pdfDir, 'norm.pdf');
    fs.writeFileSync(techPath, '%PDF-1.4 tech');
    fs.writeFileSync(normPath, '%PDF-1.4 norm');
    const techRepo = {
      async findByVehicle() {
        return [{ tech_process_file_path: 'maintenance-files/tech.pdf' }];
      },
    };
    const normRepo = {
      async findByVehicle() {
        return [{ norm_ktkt_file_path: 'maintenance-files/norm.pdf' }];
      },
    };
    const vehicleRepo = {
      async findById() { return { vehicle_id: 3 }; },
      async delete() { return true; },
    };
    const service = loadVehicleService(userData, techRepo, [], vehicleRepo, undefined, userData, normRepo);

    const result = await service.deleteVehicle(3, 7);

    assert.equal(result.success, true);
    assert.equal(fs.existsSync(techPath), false);
    assert.equal(fs.existsSync(normPath), false);
  });
});

test('maintenance CRUD dispatches to the selected type and stores its own name field', async () => {
    await withTempDir('vehicle-maintenance-types-', async (userData) => {
      const calls = [];
      const techRepo = {
        async getMaxOrder(vehicleId) { calls.push(['tech-max', vehicleId]); return 2; },
        async create(data) { calls.push(['tech-create', data]); return data; },
        async findById(id) { return { tech_process_id: id, tech_process_name: 'Quy trình' }; },
        async update(id, data) { calls.push(['tech-update', id, data]); return { ...data }; },
      };
      const normRepo = {
        async getMaxOrder(vehicleId) { calls.push(['norm-max', vehicleId]); return 4; },
        async create(data) { calls.push(['norm-create', data]); return data; },
        async findById(id) { return { norm_ktkt_id: id, norm_ktkt_name: 'Định mức' }; },
        async update(id, data) { calls.push(['norm-update', id, data]); return { ...data }; },
      };
      const service = loadVehicleService(userData, techRepo, [], {}, undefined, userData, normRepo);

      await service.createMaintenance({
        vehicle_id: 3, tab: 'tech_process', maintenance_name: '  Quy trình  ',
      }, 7);
      await service.createMaintenance({
        vehicle_id: 3, tab: 'norm_ktkt', maintenance_name: '  Định mức  ',
      }, 7);
      await service.updateMaintenance(11, 'norm_ktkt', { maintenance_name: '  Định mức mới  ' }, 7);

      assert.deepEqual(calls, [
        ['tech-max', 3],
        ['tech-create', { vehicle_id: 3, tech_process_name: 'Quy trình', display_order: 3 }],
        ['norm-max', 3],
        ['norm-create', { vehicle_id: 3, norm_ktkt_name: 'Định mức', display_order: 5 }],
        ['norm-update', 11, { norm_ktkt_name: 'Định mức mới' }],
      ]);
    });
  });

test('invalid maintenance names are rejected before repository writes', async () => {
    await withTempDir('vehicle-maintenance-name-', async (userData) => {
      let createCalled = false;
      const service = loadVehicleService(userData, {
        async getMaxOrder() { return 0; },
        async create() { createCalled = true; },
      });

      const blank = await service.createMaintenance({
        vehicle_id: 3, tab: 'tech_process', maintenance_name: '  ',
      }, 7);
      const tooLong = await service.createMaintenance({
        vehicle_id: 3, tab: 'tech_process', maintenance_name: 'x'.repeat(201),
      }, 7);

      assert.equal(blank.success, false);
      assert.equal(tooLong.success, false);
      assert.equal(createCalled, false);
  });
});

test('a successful PDF replacement delegates the obsolete file to durable cleanup', async () => {
  await withTempDir('vehicle-pdf-cleanup-', async (userData) => {
    const pdfDir = path.join(userData, 'maintenance-files');
    fs.mkdirSync(pdfDir);
    const oldPath = path.join(pdfDir, 'old.pdf');
    fs.writeFileSync(oldPath, '%PDF-1.4 old');
    const cleanupCalls = [];
    const service = loadVehicleService(userData, {
      async findById() { return { tech_process_file_path: 'maintenance-files/old.pdf' }; },
      async update() { return {}; },
    }, [], {}, {
      deleteOrQueue(filePath) {
        cleanupCalls.push(filePath);
        return true;
      },
    });

    const result = await service.uploadFile(1, 'tech_process', {
      file_name: 'replacement.pdf',
      file_buffer: Buffer.from('%PDF-1.4 replacement'),
    }, 7);

    assert.equal(result.success, true);
    assert.deepEqual(cleanupCalls, [oldPath]);
  });
});

test('new image and PDF files are written to shared storage while repositories receive relative paths', async () => {
  await withTempDir('vehicle-shared-storage-', async (root) => {
    const userData = path.join(root, 'profile');
    const storageRoot = path.join(root, 'shared');
    fs.mkdirSync(userData);
    fs.mkdirSync(storageRoot);
    const createdVehicles = [];
    const maintenanceUpdates = [];
    const vehicleRepo = {
      async create(data) {
        createdVehicles.push(data);
        return { ...data, vehicle_id: 1 };
      },
      async findByIdFull() { return { ...createdVehicles[0], vehicle_id: 1 }; },
    };
    const techRepo = {
      async findById() { return { id: 5 }; },
      async update(_id, data) { maintenanceUpdates.push(data); return data; },
    };
    const service = loadVehicleService(userData, techRepo, [], vehicleRepo, undefined, storageRoot);

    const imageResult = await service.createVehicle({
      vehicle_name: 'Xe thử nghiệm',
      img_name: 'xe.png',
      img_buffer: Buffer.from('89504e470d0a1a0a00000000', 'hex'),
    }, 7);
    const pdfResult = await service.uploadFile(5, 'tech_process', {
      file_name: 'quy-trinh.pdf',
      file_buffer: Buffer.from('%PDF-1.4 valid'),
    }, 7);

    assert.equal(imageResult.success, true);
    assert.equal(pdfResult.success, true);
    assert.match(createdVehicles[0].img_path, /^vehicle-images\/[A-Za-z0-9_-]+_\d+_[0-9a-f-]+\.png$/);
    assert.match(maintenanceUpdates[0].tech_process_file_path, /^maintenance-files\/[A-Za-z0-9_-]+_\d+_[0-9a-f-]+\.pdf$/);
    assert.equal(fs.existsSync(path.join(storageRoot, ...createdVehicles[0].img_path.split('/'))), true);
    assert.equal(
      fs.existsSync(path.join(storageRoot, ...maintenanceUpdates[0].tech_process_file_path.split('/'))),
      true,
    );
    assert.equal(fs.existsSync(path.join(userData, 'vehicle-images')), false);
    assert.equal(fs.existsSync(path.join(userData, 'maintenance-files')), false);
    assert.match(imageResult.data.img_url, /^file:/);
    assert.equal(imageResult.data.img_path, createdVehicles[0].img_path);
  });
});

test('two uploads in the same millisecond use different collision-resistant names', async () => {
  await withTempDir('vehicle-file-collision-', async (storageRoot) => {
    const updates = [];
    const service = loadVehicleService(storageRoot, {
      async findById() { return { id: 1 }; },
      async update(_id, data) { updates.push(data); return data; },
    });
    const originalNow = Date.now;
    Date.now = () => 123456789;
    try {
      await service.uploadFile(1, 'tech_process', {
        file_name: 'same.pdf', file_buffer: Buffer.from('%PDF-1.4 first'),
      }, 7);
      await service.uploadFile(1, 'norm_ktkt', {
        file_name: 'same.pdf', file_buffer: Buffer.from('%PDF-1.4 second'),
      }, 7);
    } finally {
      Date.now = originalNow;
    }

    const paths = [updates[0].tech_process_file_path, updates[1].norm_ktkt_file_path];
    assert.notEqual(paths[0], paths[1]);
    assert.equal(fs.existsSync(path.join(storageRoot, ...paths[0].split('/'))), true);
    assert.equal(fs.existsSync(path.join(storageRoot, ...paths[1].split('/'))), true);
  });
});

test('maintenance renderer consumes the trusted image URL returned by Main', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../renderer/pages/maintenance/maintenance-steps.js'),
    'utf8',
  );
  assert.match(source, /_imgSrc\(v\.img_url\)/);
  assert.doesNotMatch(source, /['"]file:\/\/\/['"]\s*\+/);
});

