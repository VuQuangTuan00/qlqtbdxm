'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { randomUUID } = require('crypto');

const ALLOWED_FOLDERS = Object.freeze(['vehicle-images', 'maintenance-files']);

function validateFileStorageRoot(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Thư mục file dùng chung (UNC) không được để trống');
  }

  const raw = value.trim().replace(/\//g, '\\');
  if (/^\\\\[?.]\\/.test(raw)) {
    throw new Error('Thư mục file dùng chung không chấp nhận đường dẫn thiết bị Windows');
  }
  if (!raw.startsWith('\\\\')) {
    throw new Error('Thư mục file dùng chung phải là đường dẫn UNC dạng \\\\MAY-CHU\\TEN-SHARE');
  }

  const segments = raw.slice(2).split('\\').filter(Boolean);
  if (segments.length < 2 || segments.some((segment) =>
    segment === '.' || segment === '..' || /[<>:"|?*]/.test(segment))) {
    throw new Error('Thư mục file dùng chung phải gồm đầy đủ máy chủ và tên share UNC hợp lệ');
  }

  return path.win32.normalize(`\\\\${segments.join('\\')}`).replace(/\\+$/, '');
}

function isInside(rootPath, candidatePath) {
  const relative = path.relative(path.resolve(rootPath), path.resolve(candidatePath));
  return relative !== '' && relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function createFileStorageService({
  fsModule = fs,
  readConfig = () => require('../config/db-config').readDbConfig(),
  normalizeRoot = validateFileStorageRoot,
  createId = randomUUID,
} = {}) {
  function normalizeConfiguredRoot(value) {
    const root = normalizeRoot(value);
    if (typeof root !== 'string' || !root.trim()) {
      throw new Error('Thư mục file dùng chung (UNC) không hợp lệ');
    }
    return path.resolve(root);
  }

  function getStorageRoot() {
    const config = readConfig();
    if (!config) throw new Error('Chưa cấu hình thư mục file dùng chung (UNC)');
    return normalizeConfiguredRoot(config.fileStorageRoot);
  }

  function assertAllowedFolder(folder) {
    if (!ALLOWED_FOLDERS.includes(folder)) {
      throw new Error(`Thư mục lưu file không hợp lệ: ${folder}`);
    }
  }

  function assertDirectory(root) {
    if (!fsModule.existsSync(root) || !fsModule.statSync(root).isDirectory()) {
      throw new Error(`Không thể truy cập thư mục file dùng chung: ${root}`);
    }
    if (fsModule.lstatSync(root).isSymbolicLink()) {
      throw new Error('Không chấp nhận symlink hoặc junction tại thư mục file dùng chung');
    }
  }

  function assertNoReparseEscape(root, candidate) {
    assertDirectory(root);
    const relative = path.relative(root, candidate);
    const segments = relative.split(path.sep).filter(Boolean);
    let current = root;
    for (const segment of segments) {
      current = path.join(current, segment);
      if (fsModule.existsSync(current) && fsModule.lstatSync(current).isSymbolicLink()) {
        throw new Error('Không chấp nhận symlink hoặc junction trong đường dẫn file dùng chung');
      }
    }

    if (fsModule.existsSync(candidate)) {
      const realRoot = fsModule.realpathSync(root);
      const realCandidate = fsModule.realpathSync(candidate);
      if (!isInside(realRoot, realCandidate)) {
        throw new Error('Đường dẫn file nằm ngoài thư mục dùng chung');
      }
    }
  }

  function ensureFolder(folder) {
    assertAllowedFolder(folder);
    const root = getStorageRoot();
    assertDirectory(root);
    const target = path.join(root, folder);
    fsModule.mkdirSync(target, { recursive: true });
    assertNoReparseEscape(root, target);
    return target;
  }

  function toStoredPath(absolutePath, expectedFolder) {
    assertAllowedFolder(expectedFolder);
    if (typeof absolutePath !== 'string' || !absolutePath.trim()) {
      throw new Error('Đường dẫn file không hợp lệ');
    }
    const root = getStorageRoot();
    const folderRoot = path.join(root, expectedFolder);
    const candidate = path.resolve(absolutePath);
    if (!isInside(folderRoot, candidate)) {
      throw new Error(`File phải nằm trong thư mục ${expectedFolder}`);
    }
    assertNoReparseEscape(root, candidate);
    return path.relative(root, candidate).split(path.sep).join('/');
  }

  function resolveStoredPath(storedPath, expectedFolder, { mustExist = true } = {}) {
    assertAllowedFolder(expectedFolder);
    if (typeof storedPath !== 'string' || !storedPath.trim() ||
        path.win32.isAbsolute(storedPath) || path.posix.isAbsolute(storedPath)) {
      throw new Error('Database phải lưu đường dẫn file tương đối');
    }

    const normalized = storedPath.trim().replace(/\\/g, '/');
    const segments = normalized.split('/');
    if (segments.length < 2 || segments[0] !== expectedFolder ||
        segments.some((segment) => !segment || segment === '.' || segment === '..')) {
      throw new Error(`Đường dẫn file không hợp lệ cho thư mục ${expectedFolder}`);
    }

    const root = getStorageRoot();
    const candidate = path.resolve(root, ...segments);
    const folderRoot = path.join(root, expectedFolder);
    if (!isInside(folderRoot, candidate)) {
      throw new Error('Đường dẫn file nằm ngoài thư mục dùng chung');
    }
    assertNoReparseEscape(root, candidate);
    if (mustExist && (!fsModule.existsSync(candidate) || !fsModule.statSync(candidate).isFile())) {
      throw new Error(`Không tìm thấy file trong kho dùng chung: ${storedPath}`);
    }
    return candidate;
  }

  function toFileUrl(absolutePath) {
    return pathToFileURL(absolutePath).href;
  }

  function testReadWriteAccess(rootValue) {
    const root = normalizeConfiguredRoot(rootValue);
    assertDirectory(root);
    const probePath = path.join(root, `.qtcn-storage-probe-${createId()}.tmp`);
    try {
      fsModule.writeFileSync(probePath, 'QTCN storage probe', { encoding: 'utf8', flag: 'wx' });
      if (fsModule.readFileSync(probePath, 'utf8') !== 'QTCN storage probe') {
        throw new Error('Không đọc lại được file kiểm tra trong kho dùng chung');
      }
      return true;
    } finally {
      try { fsModule.rmSync(probePath, { force: true }); } catch (_) {}
    }
  }

  return {
    getStorageRoot,
    ensureFolder,
    toStoredPath,
    resolveStoredPath,
    toFileUrl,
    testReadWriteAccess,
  };
}

const defaultService = createFileStorageService();

module.exports = {
  ALLOWED_FOLDERS,
  validateFileStorageRoot,
  createFileStorageService,
  ...defaultService,
};
