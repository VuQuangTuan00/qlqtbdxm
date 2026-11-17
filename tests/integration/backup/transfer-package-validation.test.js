'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { withTempDir } = require('../../helpers/test-environment');

function runPowerShell(script) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  childProcess.execFileSync('powershell.exe', [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-EncodedCommand', encoded,
  ], { windowsHide: true, stdio: 'pipe' });
}

function createZip(sourceDir, archivePath) {
  const quote = (value) => `'${String(value).replace(/'/g, "''")}'`;
  runPowerShell(`
$ErrorActionPreference = 'Stop'
Compress-Archive -Path (Join-Path ${quote(sourceDir)} '*') -DestinationPath ${quote(archivePath)}
`);
}

function createZipWithEntries(archivePath, entries) {
  const quote = (value) => `'${String(value).replace(/'/g, "''")}'`;
  const addEntries = entries.map(({ name, content = 'x' }) => `
$entry = $archive.CreateEntry(${quote(name)})
$writer = New-Object System.IO.StreamWriter($entry.Open())
try { $writer.Write(${quote(content)}) } finally { $writer.Dispose() }
`).join('\n');
  runPowerShell(`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::Open(${quote(archivePath)}, [System.IO.Compression.ZipArchiveMode]::Create)
try { ${addEntries} } finally { $archive.Dispose() }
`);
}

function loadArchiveService(storageRoot) {
  const modulePath = require.resolve('../../../main/services/file-archive.service');
  const storageModulePath = require.resolve('../../../main/services/file-storage.service');
  const savedStorage = require.cache[storageModulePath];
  const savedModule = require.cache[modulePath];
  delete require.cache[modulePath];
  require.cache[storageModulePath] = {
    id: storageModulePath,
    filename: storageModulePath,
    loaded: true,
    exports: {
      getStorageRoot() {
        return typeof storageRoot === 'function' ? storageRoot() : storageRoot;
      },
    },
  };
  const service = require(modulePath);
  if (savedStorage) require.cache[storageModulePath] = savedStorage;
  else delete require.cache[storageModulePath];
  if (savedModule) require.cache[modulePath] = savedModule;
  else delete require.cache[modulePath];
  return service;
}

test('transfer import rejects a package without a manifest before touching shared storage', async (t) => {
  if (process.platform !== 'win32') return;
  await withTempDir('archive-missing-manifest-', async (root) => {
    const source = path.join(root, 'source');
    const userData = path.join(root, 'profile');
    const vehicleImages = path.join(source, 'vehicle-images');
    fs.mkdirSync(vehicleImages, { recursive: true });
    fs.mkdirSync(userData);
    fs.writeFileSync(path.join(vehicleImages, 'test.png'), 'fake image');
    const archive = path.join(root, 'missing-manifest.zip');
    try { createZip(source, archive); }
    catch (error) {
      if (error.code === 'EPERM') { t.skip('PowerShell is blocked by the managed sandbox'); return; }
      throw error;
    }
    const service = loadArchiveService(userData);

    await assert.rejects(service.restoreFilesFromTransferPackage(archive), /manifest/i);
    assert.equal(fs.existsSync(path.join(userData, 'vehicle-images', 'test.png')), false);
  });
});

test('transfer import rejects a checksum mismatch before touching shared storage', async (t) => {
  if (process.platform !== 'win32') return;
  await withTempDir('archive-checksum-', async (root) => {
    const source = path.join(root, 'source');
    const userData = path.join(root, 'profile');
    const vehicleImages = path.join(source, 'vehicle-images');
    fs.mkdirSync(vehicleImages, { recursive: true });
    fs.mkdirSync(userData);
    fs.writeFileSync(path.join(vehicleImages, 'test.png'), 'fake image');
    fs.writeFileSync(path.join(source, 'manifest.json'), JSON.stringify({
      format: 'backup-transfer-package',
      version: 1,
      databaseBackup: null,
      entries: [{
        path: 'vehicle-images/test.png',
        size: 10,
        sha256: '0'.repeat(64),
      }],
    }));
    const archive = path.join(root, 'bad-checksum.zip');
    try { createZip(source, archive); }
    catch (error) {
      if (error.code === 'EPERM') { t.skip('PowerShell is blocked by the managed sandbox'); return; }
      throw error;
    }
    const service = loadArchiveService(userData);

    await assert.rejects(service.restoreFilesFromTransferPackage(archive), /checksum|hash/i);
    assert.equal(fs.existsSync(path.join(userData, 'vehicle-images', 'test.png')), false);
  });
});

test('transfer import source contains explicit entry and uncompressed-size quotas', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../main/services/file-archive.service.js'),
    'utf8'
  );
  assert.match(source, /maxEntries/i);
  assert.match(source, /maxTotalUncompressedBytes/i);
});

test('exported transfer package reads and restores shared storage independently from database restore', async (t) => {
  if (process.platform !== 'win32') return;
  await withTempDir('archive-roundtrip-', async (root) => {
    const sourceStorage = path.join(root, 'source-share');
    const destinationStorage = path.join(root, 'destination-share');
    const imageDir = path.join(sourceStorage, 'vehicle-images');
    const maintenanceDir = path.join(sourceStorage, 'maintenance-files');
    const nestedMaintenanceDir = path.join(maintenanceDir, 'manuals');
    fs.mkdirSync(imageDir, { recursive: true });
    fs.mkdirSync(maintenanceDir, { recursive: true });
    fs.mkdirSync(nestedMaintenanceDir, { recursive: true });
    fs.mkdirSync(destinationStorage);
    fs.writeFileSync(path.join(imageDir, 'vehicle.png'), 'image payload');
    fs.writeFileSync(path.join(nestedMaintenanceDir, 'procedure.pdf'), 'pdf payload');
    const sourceBak = path.join(root, 'source.bak');
    fs.writeFileSync(sourceBak, 'database payload');
    const archive = path.join(root, 'transfer.zip');

    try {
      await loadArchiveService(sourceStorage).exportTransferPackage(archive, sourceBak, 'QTCN_TEST');
      const destinationBak = path.join(root, 'destination.bak');
      const service = loadArchiveService(destinationStorage);
      const fileResult = await service.restoreFilesFromTransferPackage(archive);

      assert.equal(fs.readFileSync(path.join(destinationStorage, 'vehicle-images', 'vehicle.png'), 'utf8'), 'image payload');
      assert.equal(fs.readFileSync(path.join(destinationStorage, 'maintenance-files', 'manuals', 'procedure.pdf'), 'utf8'), 'pdf payload');
      assert.equal(fs.existsSync(destinationBak), false);
      assert.equal(fileResult.backupPath, null);

      fs.rmSync(path.join(destinationStorage, 'vehicle-images'), { recursive: true, force: true });
      fs.rmSync(path.join(destinationStorage, 'maintenance-files'), { recursive: true, force: true });
      const databaseResult = await service.extractDatabaseBackupFromTransferPackage(archive, destinationBak);

      assert.equal(fs.readFileSync(destinationBak, 'utf8'), 'database payload');
      assert.equal(databaseResult.backupPath, destinationBak);
      assert.equal(fs.existsSync(path.join(destinationStorage, 'vehicle-images', 'vehicle.png')), false);
      assert.equal(fs.existsSync(path.join(destinationStorage, 'maintenance-files', 'manuals', 'procedure.pdf')), false);
    } catch (error) {
      if (/EPERM|operation not permitted/i.test(error.message)) {
        t.skip('PowerShell is blocked by the managed sandbox');
        return;
      }
      throw error;
    }
  });
});

test('archive runtime contains no legacy uploads branch', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../main/services/file-archive.service.js'),
    'utf8',
  );
  assert.doesNotMatch(source, /uploads/i);
});

test('transfer import rejects traversal and duplicate ZIP entries', async (t) => {
  if (process.platform !== 'win32') return;
  await withTempDir('archive-entry-policy-', async (root) => {
    const userData = path.join(root, 'profile');
    fs.mkdirSync(userData);
    const traversalArchive = path.join(root, 'traversal.zip');
    const duplicateArchive = path.join(root, 'duplicate.zip');
    try {
      createZipWithEntries(traversalArchive, [{ name: '../escape.png' }]);
      createZipWithEntries(duplicateArchive, [
        { name: 'manifest.json', content: '{}' },
        { name: 'manifest.json', content: '{}' },
      ]);
    } catch (error) {
      if (error.code === 'EPERM') { t.skip('PowerShell is blocked by the managed sandbox'); return; }
      throw error;
    }

    const service = loadArchiveService(userData);
    await assert.rejects(service.restoreFilesFromTransferPackage(traversalArchive), /đường dẫn|duong dan|khong hop le/i);
    await assert.rejects(service.restoreFilesFromTransferPackage(duplicateArchive), /trung lap|duplicate/i);
    assert.equal(fs.existsSync(path.join(root, 'escape.png')), false);
  });
});

test('transfer import rolls back files already copied when a later destination fails', async (t) => {
  if (process.platform !== 'win32') return;
  await withTempDir('archive-rollback-', async (root) => {
    const userData = path.join(root, 'profile');
    fs.mkdirSync(userData);
    fs.writeFileSync(path.join(userData, 'vehicle-images'), 'blocking file');
    const first = 'first payload';
    const second = 'second payload';
    const entry = (entryPath, content) => ({
      path: entryPath,
      size: Buffer.byteLength(content),
      sha256: createHash('sha256').update(content).digest('hex'),
    });
    const manifest = JSON.stringify({
      format: 'backup-transfer-package',
      version: 1,
      databaseBackup: null,
      entries: [
        entry('maintenance-files/first.pdf', first),
        entry('vehicle-images/second.png', second),
      ],
    });
    const archive = path.join(root, 'rollback.zip');
    try {
      createZipWithEntries(archive, [
        { name: 'manifest.json', content: manifest },
        { name: 'maintenance-files/first.pdf', content: first },
        { name: 'vehicle-images/second.png', content: second },
      ]);
    } catch (error) {
      if (error.code === 'EPERM') { t.skip('PowerShell is blocked by the managed sandbox'); return; }
      throw error;
    }

    await assert.rejects(loadArchiveService(userData).restoreFilesFromTransferPackage(archive));
    assert.equal(fs.existsSync(path.join(userData, 'maintenance-files', 'first.pdf')), false);
    assert.equal(fs.readFileSync(path.join(userData, 'vehicle-images'), 'utf8'), 'blocking file');
  });
});

test('file restore rejects a junction that would escape shared storage', async (t) => {
  if (process.platform !== 'win32') return;
  await withTempDir('archive-junction-', async (root) => {
    const userData = path.join(root, 'profile');
    const outside = path.join(root, 'outside');
    fs.mkdirSync(userData);
    fs.mkdirSync(outside);
    try {
      fs.symlinkSync(outside, path.join(userData, 'vehicle-images'), 'junction');
    } catch (error) {
      if (['EPERM', 'EACCES'].includes(error.code)) {
        t.skip('Junction creation is not permitted in this environment');
        return;
      }
      throw error;
    }

    const content = 'image payload';
    const manifest = JSON.stringify({
      format: 'backup-transfer-package',
      version: 1,
      databaseBackup: null,
      entries: [{
        path: 'vehicle-images/escape.png',
        size: Buffer.byteLength(content),
        sha256: createHash('sha256').update(content).digest('hex'),
      }],
    });
    const archive = path.join(root, 'junction.zip');
    try {
      createZipWithEntries(archive, [
        { name: 'manifest.json', content: manifest },
        { name: 'vehicle-images/escape.png', content },
      ]);
    } catch (error) {
      if (error.code === 'EPERM') { t.skip('PowerShell is blocked by the managed sandbox'); return; }
      throw error;
    }

    await assert.rejects(
      loadArchiveService(userData).restoreFilesFromTransferPackage(archive),
      /junction|symlink|reparse/i,
    );
    assert.equal(fs.existsSync(path.join(outside, 'escape.png')), false);
  });
});

test('transfer export rejects a destination inside shared storage before starting PowerShell', async () => {
  await withTempDir('archive-destination-', async (root) => {
    const userData = path.join(root, 'profile');
    fs.mkdirSync(userData);
    const sourceBak = path.join(root, 'source.bak');
    fs.writeFileSync(sourceBak, 'database payload');
    const destination = path.join(userData, 'transfer.zip');

    await assert.rejects(
      loadArchiveService(userData).exportTransferPackage(destination, sourceBak, 'QTCN_TEST'),
      /bên trong (?:thư mục dữ liệu|kho file dùng chung)|inside.*data/i
    );
    assert.equal(fs.existsSync(destination), false);
  });
});

test('database-only extraction does not require the shared storage root', async (t) => {
  if (process.platform !== 'win32') return;
  await withTempDir('archive-database-independent-', async (root) => {
    const storageRoot = path.join(root, 'shared');
    fs.mkdirSync(storageRoot);
    const sourceBak = path.join(root, 'source.bak');
    const archive = path.join(root, 'transfer.zip');
    const destinationBak = path.join(root, 'destination.bak');
    fs.writeFileSync(sourceBak, 'database payload');
    try {
      await loadArchiveService(storageRoot).exportTransferPackage(archive, sourceBak, 'QTCN_TEST');
      const service = loadArchiveService(() => {
        throw new Error('UNC is offline');
      });
      const result = await service.extractDatabaseBackupFromTransferPackage(archive, destinationBak);

      assert.equal(result.backupPath, destinationBak);
      assert.equal(fs.readFileSync(destinationBak, 'utf8'), 'database payload');
    } catch (error) {
      if (/EPERM|operation not permitted/i.test(error.message)) {
        t.skip('PowerShell is blocked by the managed sandbox');
        return;
      }
      throw error;
    }
  });
});

test('transfer export hashes and archives the same staged file snapshot', async (t) => {
  if (process.platform !== 'win32') return;
  await withTempDir('archive-stable-snapshot-', async (root) => {
    const sourceStorage = path.join(root, 'source-share');
    const destinationStorage = path.join(root, 'destination-share');
    const imageDir = path.join(sourceStorage, 'vehicle-images');
    fs.mkdirSync(imageDir, { recursive: true });
    fs.mkdirSync(destinationStorage);
    const imagePath = path.join(imageDir, 'vehicle.png');
    fs.writeFileSync(imagePath, 'snapshot payload');
    const sourceBak = path.join(root, 'source.bak');
    const archive = path.join(root, 'transfer.zip');
    fs.writeFileSync(sourceBak, 'database payload');

    const originalCopyFileSync = fs.copyFileSync;
    fs.copyFileSync = function copyAndMutate(source, destination, flags) {
      originalCopyFileSync(source, destination, flags);
      if (path.resolve(source) === path.resolve(imagePath)) {
        fs.writeFileSync(source, 'mutated after snapshot');
      }
    };
    try {
      await loadArchiveService(sourceStorage).exportTransferPackage(archive, sourceBak, 'QTCN_TEST');
    } catch (error) {
      if (/EPERM|operation not permitted/i.test(error.message)) {
        t.skip('PowerShell is blocked by the managed sandbox');
        return;
      }
      throw error;
    } finally {
      fs.copyFileSync = originalCopyFileSync;
    }

    await loadArchiveService(destinationStorage).restoreFilesFromTransferPackage(archive);
    assert.equal(fs.readFileSync(imagePath, 'utf8'), 'mutated after snapshot');
    assert.equal(
      fs.readFileSync(path.join(destinationStorage, 'vehicle-images', 'vehicle.png'), 'utf8'),
      'snapshot payload',
    );
  });
});

