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

function loadArchiveService(userDataPath) {
  const electronPath = require.resolve('electron');
  const modulePath = require.resolve('../../../main/services/file-archive.service');
  const savedElectron = require.cache[electronPath];
  const savedModule = require.cache[modulePath];
  delete require.cache[modulePath];
  require.cache[electronPath] = {
    id: electronPath,
    filename: electronPath,
    loaded: true,
    exports: { app: { getPath(name) { assert.equal(name, 'userData'); return userDataPath; } } },
  };
  const service = require(modulePath);
  if (savedElectron) require.cache[electronPath] = savedElectron;
  else delete require.cache[electronPath];
  if (savedModule) require.cache[modulePath] = savedModule;
  else delete require.cache[modulePath];
  return service;
}

test('transfer import rejects a package without a manifest before touching userData', async (t) => {
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

    await assert.rejects(service.importTransferPackage(archive, ''), /manifest/i);
    assert.equal(fs.existsSync(path.join(userData, 'vehicle-images', 'test.png')), false);
  });
});

test('transfer import rejects a checksum mismatch before touching userData', async (t) => {
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

    await assert.rejects(service.importTransferPackage(archive, ''), /checksum|hash/i);
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

test('exported transfer package round-trips files and database backup with verified manifest', async (t) => {
  if (process.platform !== 'win32') return;
  await withTempDir('archive-roundtrip-', async (root) => {
    const sourceUserData = path.join(root, 'source-profile');
    const destinationUserData = path.join(root, 'destination-profile');
    const imageDir = path.join(sourceUserData, 'vehicle-images');
    fs.mkdirSync(imageDir, { recursive: true });
    fs.mkdirSync(destinationUserData);
    fs.writeFileSync(path.join(imageDir, 'vehicle.png'), 'image payload');
    const sourceBak = path.join(root, 'source.bak');
    fs.writeFileSync(sourceBak, 'database payload');
    const archive = path.join(root, 'transfer.zip');

    try {
      await loadArchiveService(sourceUserData).exportTransferPackage(archive, sourceBak, 'QTCN_TEST');
      const destinationBak = path.join(root, 'destination.bak');
      const result = await loadArchiveService(destinationUserData)
        .importTransferPackage(archive, destinationBak);

      assert.equal(fs.readFileSync(path.join(destinationUserData, 'vehicle-images', 'vehicle.png'), 'utf8'), 'image payload');
      assert.equal(fs.readFileSync(destinationBak, 'utf8'), 'database payload');
      assert.equal(result.backupPath, destinationBak);
    } catch (error) {
      if (/EPERM|operation not permitted/i.test(error.message)) {
        t.skip('PowerShell is blocked by the managed sandbox');
        return;
      }
      throw error;
    }
  });
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
    await assert.rejects(service.importTransferPackage(traversalArchive, ''), /đường dẫn|duong dan|khong hop le/i);
    await assert.rejects(service.importTransferPackage(duplicateArchive, ''), /trung lap|duplicate/i);
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
        entry('uploads/first.pdf', first),
        entry('vehicle-images/second.png', second),
      ],
    });
    const archive = path.join(root, 'rollback.zip');
    try {
      createZipWithEntries(archive, [
        { name: 'manifest.json', content: manifest },
        { name: 'uploads/first.pdf', content: first },
        { name: 'vehicle-images/second.png', content: second },
      ]);
    } catch (error) {
      if (error.code === 'EPERM') { t.skip('PowerShell is blocked by the managed sandbox'); return; }
      throw error;
    }

    await assert.rejects(loadArchiveService(userData).importTransferPackage(archive, ''));
    assert.equal(fs.existsSync(path.join(userData, 'uploads', 'first.pdf')), false);
    assert.equal(fs.readFileSync(path.join(userData, 'vehicle-images'), 'utf8'), 'blocking file');
  });
});

test('transfer export rejects a destination inside userData before starting PowerShell', async () => {
  await withTempDir('archive-destination-', async (root) => {
    const userData = path.join(root, 'profile');
    fs.mkdirSync(userData);
    const sourceBak = path.join(root, 'source.bak');
    fs.writeFileSync(sourceBak, 'database payload');
    const destination = path.join(userData, 'transfer.zip');

    await assert.rejects(
      loadArchiveService(userData).exportTransferPackage(destination, sourceBak, 'QTCN_TEST'),
      /bên trong thư mục dữ liệu|inside.*data/i
    );
    assert.equal(fs.existsSync(destination), false);
  });
});

