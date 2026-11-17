'use strict';

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { app } = require('electron');
const defaultLogger = require('../utils/logger');

const QUEUE_FILE = 'pending-file-cleanup.json';
const ALLOWED_FOLDERS = ['vehicle-images', 'maintenance-files'];

function isInside(rootPath, candidatePath) {
  const relative = path.relative(path.resolve(rootPath), path.resolve(candidatePath));
  return relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative);
}

function createPendingFileCleanupService({
  fsModule = fs,
  getUserDataPath = () => app.getPath('userData'),
  logger = defaultLogger,
  createId = randomUUID,
} = {}) {
  function getCleanupQueuePath() {
    return path.join(getUserDataPath(), QUEUE_FILE);
  }

  function isSafeCleanupPath(filePath) {
    if (typeof filePath !== 'string' || !filePath.trim()) return false;
    const userData = path.resolve(getUserDataPath());
    const candidate = path.resolve(filePath);
    const allowedRoot = ALLOWED_FOLDERS
      .map((folder) => path.join(userData, folder))
      .find((root) => isInside(root, candidate));
    if (!allowedRoot) return false;

    try {
      if (fsModule.existsSync(allowedRoot) && fsModule.lstatSync(allowedRoot).isSymbolicLink()) {
        return false;
      }

      const relative = path.relative(allowedRoot, candidate);
      const segments = relative.split(path.sep).filter(Boolean);
      let current = allowedRoot;
      for (let index = 0; index < segments.length - 1; index += 1) {
        current = path.join(current, segments[index]);
        if (fsModule.existsSync(current) && fsModule.lstatSync(current).isSymbolicLink()) {
          return false;
        }
      }

      if (fsModule.existsSync(candidate)) {
        if (fsModule.lstatSync(candidate).isSymbolicLink()) return false;
        const realRoot = fsModule.realpathSync(allowedRoot);
        const realCandidate = fsModule.realpathSync(candidate);
        return isInside(realRoot, realCandidate) && fsModule.statSync(realCandidate).isFile();
      }
      return true;
    } catch (error) {
      logger.warn(`[FileCleanup] Không kiểm tra được đường dẫn '${candidate}': ${error.message}`);
      return false;
    }
  }

  function preserveMalformedQueue(queuePath, error) {
    const invalidPath = path.join(
      path.dirname(queuePath),
      `pending-file-cleanup.invalid-${Date.now()}-${createId()}.json`,
    );
    try {
      fsModule.renameSync(queuePath, invalidPath);
      logger.warn(`[FileCleanup] Đã giữ queue lỗi tại '${invalidPath}': ${error.message}`);
      return true;
    } catch (preserveError) {
      logger.error(`[FileCleanup] Không bảo toàn được queue lỗi: ${preserveError.message}`);
      return false;
    }
  }

  function readQueue({ preserveMalformed = true } = {}) {
    const queuePath = getCleanupQueuePath();
    if (!fsModule.existsSync(queuePath)) return { version: 1, paths: [], writable: true };
    try {
      const parsed = JSON.parse(fsModule.readFileSync(queuePath, 'utf8'));
      if (parsed?.version !== 1 || !Array.isArray(parsed.paths) ||
          parsed.paths.some((item) => typeof item !== 'string')) {
        throw new Error('Định dạng queue không hợp lệ');
      }
      return { version: 1, paths: parsed.paths, writable: true };
    } catch (error) {
      const writable = preserveMalformed && preserveMalformedQueue(queuePath, error);
      return { version: 1, paths: [], writable };
    }
  }

  function writeQueue(paths) {
    const queuePath = getCleanupQueuePath();
    fsModule.mkdirSync(path.dirname(queuePath), { recursive: true });
    const tempPath = path.join(path.dirname(queuePath), `.pending-file-cleanup-${createId()}.tmp`);
    const uniquePaths = [];
    const seen = new Set();
    for (const filePath of paths) {
      const resolved = path.resolve(filePath);
      const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
      if (!seen.has(key)) {
        seen.add(key);
        uniquePaths.push(resolved);
      }
    }

    try {
      fsModule.writeFileSync(
        tempPath,
        JSON.stringify({ version: 1, paths: uniquePaths }, null, 2),
        'utf8',
      );
      fsModule.renameSync(tempPath, queuePath);
    } finally {
      try { fsModule.rmSync(tempPath, { force: true }); } catch (_) {}
    }
  }

  function queuePathForRetry(filePath) {
    try {
      const queue = readQueue();
      if (!queue.writable) return false;
      writeQueue([...queue.paths, path.resolve(filePath)]);
      return true;
    } catch (error) {
      logger.error(`[FileCleanup] Không ghi được cleanup queue: ${error.message}`);
      return false;
    }
  }

  function deleteOrQueue(filePath) {
    if (!filePath) return false;
    const resolved = path.resolve(filePath);
    if (!isSafeCleanupPath(resolved)) {
      logger.warn(`[FileCleanup] Từ chối đường dẫn ngoài vùng cho phép: '${resolved}'`);
      return false;
    }
    if (!fsModule.existsSync(resolved)) return true;

    try {
      fsModule.unlinkSync(resolved);
      return true;
    } catch (error) {
      const queued = queuePathForRetry(resolved);
      logger.warn(
        `[FileCleanup] Chưa xóa được '${resolved}' (${error.code || error.message}); ` +
        (queued ? 'đã đưa vào hàng đợi.' : 'không ghi được hàng đợi.'),
      );
      return false;
    }
  }

  function processPendingCleanup() {
    const queuePath = getCleanupQueuePath();
    if (!fsModule.existsSync(queuePath)) return { deleted: 0, remaining: 0 };
    const queue = readQueue();
    if (!queue.writable) return { deleted: 0, remaining: 0 };
    const remaining = [];
    let deleted = 0;

    for (const filePath of queue.paths) {
      if (!isSafeCleanupPath(filePath)) {
        logger.warn(`[FileCleanup] Loại đường dẫn queue không an toàn: '${filePath}'`);
        continue;
      }
      if (!fsModule.existsSync(filePath)) continue;
      try {
        fsModule.unlinkSync(filePath);
        deleted += 1;
      } catch (error) {
        remaining.push(filePath);
        logger.warn(`[FileCleanup] Retry chưa xóa được '${filePath}': ${error.code || error.message}`);
      }
    }

    try {
      writeQueue(remaining);
    } catch (error) {
      logger.error(`[FileCleanup] Không cập nhật được cleanup queue: ${error.message}`);
      return { deleted, remaining: queue.paths.length };
    }
    if (deleted > 0) logger.info(`[FileCleanup] Đã dọn ${deleted} file chờ xóa.`);
    return { deleted, remaining: remaining.length };
  }

  return { deleteOrQueue, processPendingCleanup, getCleanupQueuePath };
}

const defaultService = createPendingFileCleanupService();

module.exports = {
  ...defaultService,
  createPendingFileCleanupService,
};
