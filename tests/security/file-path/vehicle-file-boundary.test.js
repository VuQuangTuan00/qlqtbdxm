'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { withTempDir } = require('../../helpers/test-environment');

function loadVehicleService(userDataPath, engineRepo, shellCalls = [], vehicleRepo = {}) {
  const electron = {
    app: { getPath(name) { assert.equal(name, 'userData'); return userDataPath; } },
    shell: { async openPath(filePath) { shellCalls.push(filePath); return ''; } },
  };
  const emptyRepo = {};
  const database = {
    getDb() { return { async query() { return { rows: [], rowCount: 0 }; } }; },
  };
  const modulePath = require.resolve('../../../main/services/vehicle.service');
  const replacements = new Map([
    [require.resolve('electron'), electron],
    [require.resolve('../../../main/repositories/vehicle.repository'), vehicleRepo],
    [require.resolve('../../../main/repositories/engine-maintenance.repository'), engineRepo],
    [require.resolve('../../../main/repositories/vehicle-type.repository'), emptyRepo],
    [require.resolve('../../../main/database/index'), database],
    [require.resolve('../../../main/utils/logger'), { info() {}, warn() {}, error() {} }],
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

test('read/open reject an absolute maintenance path outside userData', async () => {
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

test('deleteFile never deletes or clears a record for a path outside userData', async () => {
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
    const engineRepo = {
      async findById() { return { id: 1 }; },
      async update() { updateCalled = true; },
    };
    const service = loadVehicleService(userData, engineRepo);

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

test('readFile supports current relative paths and the legacy uploads fallback', async () => {
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
      tech_process_file_path: 'missing-machine-path/legacy.pdf',
      tech_process_file_name: 'legacy.pdf',
    };
    const legacy = await service.readFile(1, 'tech_process');
    assert.equal(Buffer.from(legacy.data.base64, 'base64').toString(), '%PDF-1.4 legacy');
  });
});

test('a failed PDF metadata update removes the new file and preserves the old file', async () => {
  await withTempDir('vehicle-upload-rollback-', async (userData) => {
    const pdfDir = path.join(userData, 'maintenance-files');
    fs.mkdirSync(pdfDir);
    const oldPath = path.join(pdfDir, 'old.pdf');
    fs.writeFileSync(oldPath, '%PDF-1.4 old');
    const service = loadVehicleService(userData, {
      async findById() { return { tech_process_file_path: oldPath }; },
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
      async findById() { return { tech_process_file_path: oldPath }; },
      async update() { throw new Error('database update failed'); },
    });

    await assert.rejects(service.deleteFile(1, 'tech_process', 7), /database update failed/);
    assert.equal(fs.existsSync(oldPath), true);
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
        return { tech_process_file_path: link, tech_process_file_name: 'linked.pdf' };
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
      async findById() { return { vehicle_id: 1, img_path: oldPath }; },
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

test('a failed maintenance delete preserves its PDF files', async () => {
  await withTempDir('maintenance-delete-files-', async (userData) => {
    const pdfDir = path.join(userData, 'maintenance-files');
    fs.mkdirSync(pdfDir);
    const techPath = path.join(pdfDir, 'tech.pdf');
    const normPath = path.join(pdfDir, 'norm.pdf');
    fs.writeFileSync(techPath, '%PDF-1.4 tech');
    fs.writeFileSync(normPath, '%PDF-1.4 norm');
    const service = loadVehicleService(userData, {
      async findById() {
        return { tech_process_file_path: techPath, norm_ktkt_file_path: normPath };
      },
      async delete() { throw new Error('database delete failed'); },
    });

    await assert.rejects(service.deleteMaintenance(1, 7), /database delete failed/);
    assert.equal(fs.existsSync(techPath), true);
    assert.equal(fs.existsSync(normPath), true);
  });
});

