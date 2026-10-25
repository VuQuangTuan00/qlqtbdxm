'use strict';

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');
const { promisify } = require('util');
const { app } = require('electron');

const execFileAsync = promisify(execFile);
const FOLDERS = ['uploads', 'vehicle-images', 'maintenance-files'];
const EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.doc', '.docx'];

function quotePowerShell(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
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
    throw new Error(`Thao tác ZIP thất bại: ${(err.stderr || err.message || '').trim()}`);
  }
}

async function exportFiles(destinationPath) {
  const root = app.getPath('userData');
  const destination = path.resolve(destinationPath);
  if (path.extname(destination).toLowerCase() !== '.zip') {
    throw new Error('File sao lưu phải có đuôi .zip.');
  }
  if (destination.startsWith(`${root}${path.sep}`)) {
    throw new Error('Không thể lưu ZIP bên trong thư mục dữ liệu ứng dụng.');
  }
  if (fs.existsSync(destination)) {
    throw new Error('File ZIP đã tồn tại. Hãy chọn tên khác để tránh ghi đè.');
  }

  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root = ${quotePowerShell(root)}
$destination = ${quotePowerShell(destination)}
$archive = [System.IO.Compression.ZipFile]::Open($destination, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($folder in @(${FOLDERS.map(quotePowerShell).join(', ')})) {
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
$folders = @(${FOLDERS.map(quotePowerShell).join(', ')})
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
    throw new Error('File bộ chuyển máy phải có đuôi .zip.');
  }
  if (!fs.existsSync(backupPath) || !fs.statSync(backupPath).isFile()) {
    throw new Error('SQL Server không tạo được file .bak.');
  }
  if (fs.existsSync(destination)) {
    throw new Error('File ZIP đã tồn tại. Hãy chọn tên khác để tránh ghi đè.');
  }

  const safeDatabaseName = String(databaseName || 'database').replace(/[<>:"/\\|?*]/g, '_');
  const backupFileName = `${safeDatabaseName}.bak`;
  const manifest = {
    format: 'qlqtbdxm-transfer-package',
    version: 1,
    createdAt: new Date().toISOString(),
    database: databaseName,
    databaseBackup: `database/${backupFileName}`,
    fileFolders: FOLDERS,
  };
  const manifestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qlqtbdxm-manifest-'));
  const manifestPath = path.join(manifestDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root = ${quotePowerShell(root)}
$backupPath = ${quotePowerShell(backupPath)}
$backupEntry = ${quotePowerShell(`database/${backupFileName}`)}
$manifestPath = ${quotePowerShell(manifestPath)}
$destination = ${quotePowerShell(destination)}
$archive = [System.IO.Compression.ZipFile]::Open($destination, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($folder in @(${FOLDERS.map(quotePowerShell).join(', ')})) {
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

async function importTransferPackage(archivePath, databaseBackupDestination) {
  const archive = path.resolve(archivePath);
  if (!fs.existsSync(archive) || !fs.statSync(archive).isFile()) {
    throw new Error('Không tìm thấy file ZIP đã chọn.');
  }
  if (path.extname(archive).toLowerCase() !== '.zip') {
    throw new Error('Chỉ chấp nhận file .zip.');
  }

  const root = app.getPath('userData');
  const backupDestination = databaseBackupDestination ? path.resolve(databaseBackupDestination) : '';
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
$temp = Join-Path ([System.IO.Path]::GetTempPath()) ([Guid]::NewGuid().ToString())
$folders = @(${FOLDERS.map(quotePowerShell).join(', ')})
$extensions = @(${EXTENSIONS.map(quotePowerShell).join(', ')})
$zip = $null
$backupCount = 0
try {
  New-Item -ItemType Directory -Path $temp -Force | Out-Null
  $zip = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
  $names = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
  foreach ($entry in $zip.Entries) {
    $entryName = $entry.FullName.Replace([char]92, [char]47)
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
    if ($entryName -notmatch '^(uploads|vehicle-images|maintenance-files)/([^/]+)$') { throw "Duong dan trong ZIP khong hop le: $entryName" }
    $folder = $Matches[1]
    $fileName = $Matches[2]
    if ($fileName.Contains('..') -or $fileName -eq '.' -or $fileName -eq '..') { throw "Ten file khong hop le: $fileName" }
    if ([System.IO.Path]::GetExtension($fileName).ToLowerInvariant() -notin $extensions) { throw "Dinh dang file khong duoc ho tro: $fileName" }
    $key = "$folder/$fileName"
    if (-not $names.Add($key)) { throw "ZIP co file trung lap: $key" }
    $tempFolder = Join-Path $temp $folder
    New-Item -ItemType Directory -Path $tempFolder -Force | Out-Null
    [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, (Join-Path $tempFolder $fileName), $false)
  }

  if ($backupCount -gt 0 -and -not $backupDestination) { throw 'Chua chon noi luu file database .bak.' }
  $manifestPath = Join-Path $temp 'manifest.json'
  if (Test-Path -LiteralPath $manifestPath) {
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    if ($manifest.format -ne 'qlqtbdxm-transfer-package' -or $manifest.version -ne 1) { throw 'Manifest goi chuyen may khong hop le.' }
    if (($backupCount -eq 1) -ne [bool]$manifest.databaseBackup) { throw 'Manifest va file database .bak khong khop.' }
  }

  $files = @(Get-ChildItem -LiteralPath $temp -File -Recurse | Where-Object { $_.Name -ne 'manifest.json' -and $_.Extension -ne '.bak' })
  foreach ($file in $files) {
    $relative = $file.FullName.Substring($temp.Length).TrimStart([char]92, [char]47)
    $target = Join-Path $root $relative
    $targetDir = Split-Path -Parent $target
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
    Copy-Item -LiteralPath $file.FullName -Destination $target -Force
  }

  if ($backupCount -eq 1) {
    $backupFile = Get-ChildItem -LiteralPath (Join-Path $temp 'database') -Filter '*.bak' -File | Select-Object -First 1
    $backupDir = Split-Path -Parent $backupDestination
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    Copy-Item -LiteralPath $backupFile.FullName -Destination $backupDestination
    Write-Output "DATABASE_BACKUP=$backupDestination"
  } else {
    Write-Output 'DATABASE_BACKUP=NONE'
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

module.exports = { exportFiles, importFiles, exportTransferPackage, importTransferPackage };