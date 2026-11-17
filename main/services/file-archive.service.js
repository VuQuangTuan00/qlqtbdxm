'use strict';

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomUUID, createHash } = require('crypto');
const { promisify } = require('util');
const { app } = require('electron');

const execFileAsync = promisify(execFile);
const BACKUP_FOLDERS = ['vehicle-images', 'maintenance-files'];
const RESTORE_FOLDERS = ['uploads', 'vehicle-images', 'maintenance-files'];
const EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.doc', '.docx'];
const ARCHIVE_MAX_ENTRIES = 10000;
const ARCHIVE_MAX_ENTRY_BYTES = 5 * 1024 * 1024 * 1024;
const ARCHIVE_MAX_TOTAL_UNCOMPRESSED_BYTES = 10 * 1024 * 1024 * 1024;
const ARCHIVE_MAX_COMPRESSION_RATIO = 200;

function quotePowerShell(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function decodePowerShellClixml(value) {
  const raw = String(value || '').trim();
  if (!raw.includes('CLIXML')) return raw;

  const messages = [...raw.matchAll(/<S S="Error">([\s\S]*?)<\/S>/g)]
    .map((match) => match[1]
      .replace(/_x([0-9A-Fa-f]{4})_/g, (_token, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&')
      .trim())
    .filter(Boolean);
  return messages.length ? messages.join('\n') : raw;
}

function isPathInside(rootPath, candidatePath) {
  const relative = path.relative(path.resolve(rootPath), path.resolve(candidatePath));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function listFilesRecursive(rootPath) {
  if (!fs.existsSync(rootPath)) return [];
  const files = [];
  for (const entry of fs.readdirSync(rootPath, { withFileTypes: true })) {
    const fullPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) files.push(...listFilesRecursive(fullPath));
    else if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

function assertLegacyUploadsEmpty(rootPath) {
  const legacyFiles = listFilesRecursive(path.join(rootPath, 'uploads'));
  if (legacyFiles.length > 0) {
    throw new Error(
      `Thư mục uploads còn ${legacyFiles.length} file legacy nên chưa thể tạo backup an toàn. ` +
      'Hãy chuyển ảnh vào vehicle-images và tài liệu vào maintenance-files, sau đó sao lưu lại.'
    );
  }
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function buildManifestEntries(root, backupPath, backupEntry) {
  const sources = [];
  for (const folder of BACKUP_FOLDERS) {
    for (const filePath of listFilesRecursive(path.join(root, folder))) {
      sources.push({
        filePath,
        archivePath: path.relative(root, filePath).split(path.sep).join('/'),
      });
    }
  }
  sources.push({ filePath: backupPath, archivePath: backupEntry });

  const entries = [];
  for (const source of sources) {
    const stat = fs.statSync(source.filePath);
    entries.push({
      path: source.archivePath,
      size: stat.size,
      sha256: await sha256File(source.filePath),
    });
  }
  return entries;
}

async function runPowerShell(script) {
  if (process.platform !== 'win32') throw new Error('Sao lưu ZIP hiện chỉ hỗ trợ Windows.');
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  try {
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded,
    ], { windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
    return stdout.trim();
  } catch (err) {
    throw new Error(`Thao tác ZIP thất bại: ${decodePowerShellClixml(err.stderr || err.message)}`);
  }
}

async function exportFiles(destinationPath) {
  const root = app.getPath('userData');
  const destination = path.resolve(destinationPath);
  if (path.extname(destination).toLowerCase() !== '.zip') {
    throw new Error('File sao lưu phải có đuôi .zip.');
  }
  if (isPathInside(root, destination)) {
    throw new Error('Không thể lưu ZIP bên trong thư mục dữ liệu ứng dụng.');
  }
  if (fs.existsSync(destination)) {
    throw new Error('File ZIP đã tồn tại. Hãy chọn tên khác để tránh ghi đè.');
  }
  assertLegacyUploadsEmpty(root);

  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root = ${quotePowerShell(root)}
$destination = ${quotePowerShell(destination)}
$archive = [System.IO.Compression.ZipFile]::Open($destination, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($folder in @(${BACKUP_FOLDERS.map(quotePowerShell).join(', ')})) {
    $source = Join-Path $root $folder
    if (-not (Test-Path -LiteralPath $source -PathType Container)) { continue }
    $files = @(Get-ChildItem -LiteralPath $source -File -Recurse)
    if ($files.Count -eq 0) {
      $archive.CreateEntry("$folder/") | Out-Null
      continue
    }
    foreach ($file in $files) {
      $relative = $file.FullName.Substring($root.Length).TrimStart([char]92, [char]47).Replace([char]92, [char]47)
      [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, $relative, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
  }
} finally {
  $archive.Dispose()
}
Write-Output 'Da tao ZIP backup.'
`;

  await runPowerShell(script);
  return destination;
}

async function importFiles(archivePath) {
  const archive = path.resolve(archivePath);
  if (!fs.existsSync(archive) || !fs.statSync(archive).isFile()) {
    throw new Error('Không tìm thấy file ZIP đã chọn.');
  }
  if (path.extname(archive).toLowerCase() !== '.zip') {
    throw new Error('Chỉ chấp nhận file .zip.');
  }

  const root = app.getPath('userData');
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archivePath = ${quotePowerShell(archive)}
$root = ${quotePowerShell(root)}
$temp = Join-Path ([System.IO.Path]::GetTempPath()) ([Guid]::NewGuid().ToString())
$folders = @(${RESTORE_FOLDERS.map(quotePowerShell).join(', ')})
$extensions = @(${EXTENSIONS.map(quotePowerShell).join(', ')})
$zip = $null
try {
  New-Item -ItemType Directory -Path $temp -Force | Out-Null
  $zip = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
  $names = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
  foreach ($entry in $zip.Entries) {
    $entryName = $entry.FullName.Replace([char]92, [char]47)
    if ($entryName -match '^([^/]+)/$' -and $folders -contains $Matches[1]) { continue }
    if ($entryName -notmatch '^(uploads|vehicle-images|maintenance-files)/([^/]+)$') { throw "Duong dan trong ZIP khong hop le: $entryName" }
    $folder = $Matches[1]
    $fileName = $Matches[2]
    if ($fileName.Contains('..') -or $fileName -eq '.' -or $fileName -eq '..') { throw "Ten file khong hop le: $fileName" }
    if ([System.IO.Path]::GetExtension($fileName).ToLowerInvariant() -notin $extensions) { throw "Dinh dang file khong duoc ho tro: $fileName" }
    $key = "$folder/$fileName"
    if (-not $names.Add($key)) { throw "ZIP co file trung lap: $key" }
    $tempFolder = Join-Path $temp $folder
    New-Item -ItemType Directory -Path $tempFolder -Force | Out-Null
    $tempFile = Join-Path $tempFolder $fileName
    [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $tempFile, $false)
  }

  $files = @(Get-ChildItem -LiteralPath $temp -File -Recurse)
  foreach ($file in $files) {
    $relative = $file.FullName.Substring($temp.Length).TrimStart([char]92, [char]47)
    $target = Join-Path $root $relative
    if (Test-Path -LiteralPath $target -PathType Leaf) {
      $existingHash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
      $incomingHash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
      if ($existingHash -ne $incomingHash) { throw "File dich trung ten nhung khac noi dung: $relative" }
    }
  }

  foreach ($file in $files) {
    $relative = $file.FullName.Substring($temp.Length).TrimStart([char]92, [char]47)
    $target = Join-Path $root $relative
    $targetFolder = Split-Path -Parent $target
    New-Item -ItemType Directory -Path $targetFolder -Force | Out-Null
    if (Test-Path -LiteralPath $target -PathType Leaf) {
      Write-Output "Da co san, bo qua: $relative"
    } else {
      Copy-Item -LiteralPath $file.FullName -Destination $target
      Write-Output "Da nhap: $relative"
    }
  }
} finally {
  if ($zip) { $zip.Dispose() }
  if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Recurse -Force }
}
Write-Output 'Da nhap ZIP backup.'
`;

  return runPowerShell(script);
}

async function exportTransferPackage(destinationPath, databaseBackupPath, databaseName) {
  const root = app.getPath('userData');
  const destination = path.resolve(destinationPath);
  const backupPath = path.resolve(databaseBackupPath);
  if (path.extname(destination).toLowerCase() !== '.zip') {
    throw new Error('File sao lưu phải có đuôi .zip.');
  }
  if (!fs.existsSync(backupPath) || !fs.statSync(backupPath).isFile()) {
    throw new Error('SQL Server không tạo được file .bak.');
  }
  if (fs.existsSync(destination)) {
    throw new Error('File ZIP đã tồn tại. Hãy chọn tên khác để tránh ghi đè.');
  }
  if (isPathInside(root, destination)) {
    throw new Error('Không thể lưu ZIP bên trong thư mục dữ liệu ứng dụng.');
  }
  assertLegacyUploadsEmpty(root);

  const safeDatabaseName = String(databaseName || 'database').replace(/[<>:"/\\|?*]/g, '_');
  const backupFileName = `${safeDatabaseName}.bak`;
  const backupEntry = `database/${backupFileName}`;
  const manifest = {
    format: 'backup-transfer-package',
    version: 1,
    createdAt: new Date().toISOString(),
    database: databaseName,
    databaseBackup: backupEntry,
    fileFolders: BACKUP_FOLDERS,
    entries: await buildManifestEntries(root, backupPath, backupEntry),
  };
  const manifestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-transfer-package-'));
  const manifestPath = path.join(manifestDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root = ${quotePowerShell(root)}
$backupPath = ${quotePowerShell(backupPath)}
$backupEntry = ${quotePowerShell(backupEntry)}
$manifestPath = ${quotePowerShell(manifestPath)}
$destination = ${quotePowerShell(destination)}
$archive = [System.IO.Compression.ZipFile]::Open($destination, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($folder in @(${BACKUP_FOLDERS.map(quotePowerShell).join(', ')})) {
    $source = Join-Path $root $folder
    if (-not (Test-Path -LiteralPath $source -PathType Container)) { continue }
    foreach ($file in @(Get-ChildItem -LiteralPath $source -File -Recurse)) {
      $relative = $file.FullName.Substring($root.Length).TrimStart([char]92, [char]47).Replace([char]92, [char]47)
      [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, $relative, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
  }
  [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $backupPath, $backupEntry, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
  [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $manifestPath, 'manifest.json', [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
} finally {
  $archive.Dispose()
}
Write-Output 'Da tao goi chuyen may.'
`;

  try {
    await runPowerShell(script);
    return destination;
  } catch (err) {
    try { fs.rmSync(destination, { force: true }); } catch (_) {}
    throw err;
  } finally {
    fs.rmSync(manifestDir, { recursive: true, force: true });
  }
}

async function restoreTransferPackage(archivePath, options = {}) {
  const archive = path.resolve(archivePath);
  if (!fs.existsSync(archive) || !fs.statSync(archive).isFile()) {
    throw new Error('Không tìm thấy file ZIP đã chọn.');
  }
  if (path.extname(archive).toLowerCase() !== '.zip') {
    throw new Error('Chỉ chấp nhận file .zip.');
  }

  const root = app.getPath('userData');
  const restoreFiles = options.restoreFiles === true;
  const restoreDatabase = options.restoreDatabase === true;
  if (restoreFiles === restoreDatabase) {
    throw new Error('Phải chọn đúng một chế độ khôi phục file hoặc database.');
  }
  const backupDestination = options.databaseBackupDestination
    ? path.resolve(options.databaseBackupDestination)
    : '';
  if (restoreDatabase && !backupDestination) {
    throw new Error('Chưa chọn nơi lưu file database .bak.');
  }
  if (backupDestination && fs.existsSync(backupDestination)) {
    throw new Error('File .bak đích đã tồn tại. Hãy chọn tên khác.');
  }

  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archivePath = ${quotePowerShell(archive)}
$root = ${quotePowerShell(root)}
$backupDestination = ${quotePowerShell(backupDestination)}
$restoreFiles = ${restoreFiles ? '$true' : '$false'}
$restoreDatabase = ${restoreDatabase ? '$true' : '$false'}
$temp = Join-Path ([System.IO.Path]::GetTempPath()) ([Guid]::NewGuid().ToString())
$folders = @(${RESTORE_FOLDERS.map(quotePowerShell).join(', ')})
$extensions = @(${EXTENSIONS.map(quotePowerShell).join(', ')})
$maxEntries = ${ARCHIVE_MAX_ENTRIES}
$maxEntryBytes = ${ARCHIVE_MAX_ENTRY_BYTES}
$maxTotalUncompressedBytes = ${ARCHIVE_MAX_TOTAL_UNCOMPRESSED_BYTES}
$maxCompressionRatio = ${ARCHIVE_MAX_COMPRESSION_RATIO}
$zip = $null
$backupCount = 0
function Assert-SafeDestination([string]$baseRoot, [string]$relativePath) {
  $baseFull = [System.IO.Path]::GetFullPath($baseRoot)
  $normalizedRelative = $relativePath.Replace([char]92, [char]47)
  $targetFull = [System.IO.Path]::GetFullPath((Join-Path $baseFull $normalizedRelative))
  $basePrefix = $baseFull.TrimEnd([char]92, [char]47) + [System.IO.Path]::DirectorySeparatorChar
  if (-not $targetFull.StartsWith($basePrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Duong dan dich nam ngoai thu muc du lieu: $relativePath"
  }

  $segments = @($normalizedRelative.Split([char]47))
  $current = $baseFull
  for ($i = 0; $i -lt ($segments.Count - 1); $i++) {
    $segment = $segments[$i]
    if (-not $segment -or $segment -eq '.' -or $segment -eq '..') {
      throw "Thanh phan duong dan khong hop le: $relativePath"
    }
    $current = Join-Path $current $segment
    if (Test-Path -LiteralPath $current) {
      $item = Get-Item -LiteralPath $current -Force
      if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Khong cho phep junction/symlink/reparse point trong duong dan restore: $relativePath"
      }
    }
  }
  return $targetFull
}
try {
  New-Item -ItemType Directory -Path $temp -Force | Out-Null
  $zip = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
  if ($zip.Entries.Count -gt $maxEntries) { throw "ZIP vuot qua gioi han $maxEntries entries." }
  [Int64]$totalUncompressedBytes = 0
  foreach ($entry in $zip.Entries) {
    if ($entry.Length -gt $maxEntryBytes) { throw "Entry vuot qua gioi han kich thuoc: $($entry.FullName)" }
    $totalUncompressedBytes += $entry.Length
    if ($totalUncompressedBytes -gt $maxTotalUncompressedBytes) { throw 'Tong dung luong giai nen cua ZIP vuot qua gioi han.' }
    if ($entry.Length -gt 1048576 -and $entry.CompressedLength -gt 0) {
      $ratio = [double]$entry.Length / [double]$entry.CompressedLength
      if ($ratio -gt $maxCompressionRatio) { throw "Ty le nen bat thuong: $($entry.FullName)" }
    }
  }
  $names = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
  foreach ($entry in $zip.Entries) {
    $entryName = $entry.FullName.Replace([char]92, [char]47)
    if (-not $names.Add($entryName)) { throw "ZIP co entry trung lap: $entryName" }
    if ($entryName -eq 'manifest.json') {
      $manifestPath = Join-Path $temp 'manifest.json'
      [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $manifestPath, $false)
      continue
    }
    if ($entryName -match '^database/([^/]+\.bak)$') {
      $backupCount++
      if ($backupCount -gt 1) { throw 'Goi backup co nhieu hon mot file database .bak.' }
      $databaseDir = Join-Path $temp 'database'
      New-Item -ItemType Directory -Path $databaseDir -Force | Out-Null
      [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, (Join-Path $databaseDir $Matches[1]), $false)
      continue
    }
    if ($entryName -match '^([^/]+)/$' -and $folders -contains $Matches[1]) { continue }
    if ($entryName -notmatch '^(uploads|vehicle-images|maintenance-files)/(.+)$') { throw "Duong dan trong ZIP khong hop le: $entryName" }
    $folder = $Matches[1]
    $relativeFilePath = $Matches[2]
    $pathSegments = @($relativeFilePath.Split([char]47))
    foreach ($segment in $pathSegments) {
      if (-not $segment -or $segment -eq '.' -or $segment -eq '..' -or
          $segment.IndexOfAny([System.IO.Path]::GetInvalidFileNameChars()) -ge 0) {
        throw "Ten file khong hop le: $relativeFilePath"
      }
    }
    $fileName = $pathSegments[-1]
    if ([System.IO.Path]::GetExtension($fileName).ToLowerInvariant() -notin $extensions) { throw "Dinh dang file khong duoc ho tro: $fileName" }
    $tempFolder = Join-Path $temp $folder
    $tempFile = Join-Path $tempFolder $relativeFilePath
    New-Item -ItemType Directory -Path (Split-Path -Parent $tempFile) -Force | Out-Null
    [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $tempFile, $false)
  }

  if ($restoreDatabase -and $backupCount -ne 1) { throw 'Goi backup khong co dung mot file database .bak.' }
  $manifestPath = Join-Path $temp 'manifest.json'
  if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw 'Thieu manifest.json trong goi chuyen may.' }
  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  if ($manifest.format -ne 'backup-transfer-package' -or $manifest.version -ne 1) { throw 'Manifest goi chuyen may khong hop le.' }
  if (($backupCount -eq 1) -ne [bool]$manifest.databaseBackup) { throw 'Manifest va file database .bak khong khop.' }
  if ($null -eq $manifest.entries) { throw 'Manifest thieu danh sach checksum.' }

  $expectedEntries = @{}
  foreach ($expected in @($manifest.entries)) {
    $expectedPath = [string]$expected.path
    if (-not $expectedPath -or $expectedPath.Contains('..') -or $expectedPath.StartsWith('/') -or $expectedPath.Contains([char]92)) {
      throw "Duong dan manifest khong hop le: $expectedPath"
    }
    if ($expectedPath -notmatch '^(uploads|vehicle-images|maintenance-files)/(.+)$' -and $expectedPath -notmatch '^database/([^/]+\.bak)$') {
      throw "Entry manifest khong duoc ho tro: $expectedPath"
    }
    if ($expectedEntries.ContainsKey($expectedPath)) { throw "Manifest co entry trung lap: $expectedPath" }
    $expectedEntries[$expectedPath] = $expected
  }

  $payloadFiles = @(Get-ChildItem -LiteralPath $temp -File -Recurse | Where-Object { $_.Name -ne 'manifest.json' })
  if ($payloadFiles.Count -ne $expectedEntries.Count) { throw 'So luong file va manifest khong khop.' }
  foreach ($file in $payloadFiles) {
    $relative = $file.FullName.Substring($temp.Length).TrimStart([char]92, [char]47).Replace([char]92, [char]47)
    if (-not $expectedEntries.ContainsKey($relative)) { throw "File khong co trong manifest: $relative" }
    $expected = $expectedEntries[$relative]
    if ([Int64]$expected.size -ne $file.Length) { throw "Kich thuoc file khong khop manifest: $relative" }
    $actualHash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -ne ([string]$expected.sha256).ToLowerInvariant()) { throw "Checksum/hash khong khop: $relative" }
  }

  $files = @()
  if ($restoreFiles) { $files = @($payloadFiles | Where-Object { $_.Extension -ne '.bak' }) }
  $rollbackDir = Join-Path $temp '__rollback'
  $createdTargets = New-Object 'System.Collections.Generic.List[string]'
  try {
    foreach ($file in $files) {
      $relative = $file.FullName.Substring($temp.Length).TrimStart([char]92, [char]47)
      $target = Assert-SafeDestination $root $relative
      $targetDir = Split-Path -Parent $target
      New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
      if (Test-Path -LiteralPath $target -PathType Leaf) {
        $rollbackFile = Join-Path $rollbackDir $relative
        New-Item -ItemType Directory -Path (Split-Path -Parent $rollbackFile) -Force | Out-Null
        Copy-Item -LiteralPath $target -Destination $rollbackFile -Force
      } else {
        $createdTargets.Add($target)
      }
      Copy-Item -LiteralPath $file.FullName -Destination $target -Force
    }

    if ($restoreDatabase) {
      $backupFile = Get-ChildItem -LiteralPath (Join-Path $temp 'database') -Filter '*.bak' -File | Select-Object -First 1
      $backupDir = Split-Path -Parent $backupDestination
      New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
      Copy-Item -LiteralPath $backupFile.FullName -Destination $backupDestination
      Write-Output "DATABASE_BACKUP=$backupDestination"
    } elseif ($restoreFiles) {
      Write-Output 'DATABASE_BACKUP=NONE'
    }
  } catch {
    foreach ($createdTarget in $createdTargets) {
      if (Test-Path -LiteralPath $createdTarget -PathType Leaf) { Remove-Item -LiteralPath $createdTarget -Force }
    }
    if (Test-Path -LiteralPath $rollbackDir -PathType Container) {
      foreach ($rollbackFile in @(Get-ChildItem -LiteralPath $rollbackDir -File -Recurse)) {
        $relative = $rollbackFile.FullName.Substring($rollbackDir.Length).TrimStart([char]92, [char]47)
        $target = Assert-SafeDestination $root $relative
        New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
        Copy-Item -LiteralPath $rollbackFile.FullName -Destination $target -Force
      }
    }
    if ($backupDestination -and (Test-Path -LiteralPath $backupDestination -PathType Leaf)) {
      Remove-Item -LiteralPath $backupDestination -Force
    }
    throw
  }
  Write-Output 'Da nhap file trong goi chuyen may.'
} finally {
  if ($zip) { $zip.Dispose() }
  if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Recurse -Force }
}
`;

  const output = await runPowerShell(script);
  const backupLine = output.split(/\r?\n/).find((line) => line.startsWith('DATABASE_BACKUP='));
  return {
    backupPath: backupLine && backupLine !== 'DATABASE_BACKUP=NONE' ? backupLine.slice('DATABASE_BACKUP='.length) : null,
    output,
  };
}

function restoreFilesFromTransferPackage(archivePath) {
  return restoreTransferPackage(archivePath, { restoreFiles: true });
}

function extractDatabaseBackupFromTransferPackage(archivePath, databaseBackupDestination) {
  return restoreTransferPackage(archivePath, {
    restoreDatabase: true,
    databaseBackupDestination,
  });
}

module.exports = {
  exportFiles,
  importFiles,
  exportTransferPackage,
  restoreFilesFromTransferPackage,
  extractDatabaseBackupFromTransferPackage,
};
