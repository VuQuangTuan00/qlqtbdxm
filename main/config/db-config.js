'use strict';

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { app, safeStorage } = require('electron');
const { validateFileStorageRoot } = require('../services/file-storage.service');

const PASSWORD_ENCRYPTION = 'electron-safe-storage-v1';

function getDbConfigPath() {
  return path.join(app.getPath('userData'), 'db-config.json');
}

function readJson(configPath) {
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (error) {
    throw new Error(`Không thể đọc cấu hình SQL Server: ${error.message}`);
  }
}

function requireNonEmptyString(config, key, label) {
  if (typeof config[key] !== 'string' || !config[key].trim()) {
    throw new Error(`${label} không được để trống`);
  }
}

function validateDbConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('Cấu hình SQL Server không hợp lệ');
  }
  config = { ...config };
  if (config.mode !== 'sqlserver') {
    throw new Error('Chế độ database phải là sqlserver');
  }

  requireNonEmptyString(config, 'server', 'Máy chủ SQL Server');
  requireNonEmptyString(config, 'database', 'Tên database');
  requireNonEmptyString(config, 'user', 'Tên đăng nhập');
  config.fileStorageRoot = validateFileStorageRoot(config.fileStorageRoot);

  if (config.port !== undefined && config.port !== null && config.port !== '') {
    const port = Number(config.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('Cổng SQL Server phải là số nguyên từ 1 đến 65535');
    }
    config = { ...config, port };
  }

  if (config.instanceName === null || config.instanceName === '') {
    delete config.instanceName;
  } else if (config.instanceName !== undefined &&
      (typeof config.instanceName !== 'string' || !config.instanceName.trim())) {
    throw new Error('Tên instance SQL Server không hợp lệ');
  }

  return config;
}

function withoutSecrets(config) {
  const sanitized = { ...config };
  delete sanitized.password;
  delete sanitized.passwordEncrypted;
  delete sanitized.passwordEncryption;
  return sanitized;
}

function sameCredentialEndpoint(left, right) {
  const normalize = (value) => String(value ?? '').trim().toLowerCase();
  return ['server', 'port', 'user', 'instanceName']
    .every((key) => normalize(left?.[key]) === normalize(right?.[key]));
}

function ensureEncryptionAvailable() {
  if (!safeStorage || !safeStorage.isEncryptionAvailable()) {
    throw new Error('Mã hóa mật khẩu SQL Server chưa sẵn sàng trên hệ thống này');
  }
}

function encryptPassword(password) {
  ensureEncryptionAvailable();
  try {
    return safeStorage.encryptString(password).toString('base64');
  } catch (error) {
    throw new Error(`Không thể mã hóa mật khẩu SQL Server: ${error.message}`);
  }
}

function decryptPassword(config) {
  if (!config.passwordEncrypted && !config.passwordEncryption) return undefined;
  if (config.passwordEncryption !== PASSWORD_ENCRYPTION ||
      typeof config.passwordEncrypted !== 'string' || !config.passwordEncrypted) {
    throw new Error('Định dạng mật khẩu SQL Server đã mã hóa không hợp lệ');
  }

  ensureEncryptionAvailable();
  try {
    return safeStorage.decryptString(Buffer.from(config.passwordEncrypted, 'base64'));
  } catch (error) {
    throw new Error(
      'Không thể giải mã mật khẩu SQL Server trên tài khoản hoặc máy tính này. ' +
      'Vui lòng nhập lại mật khẩu để kết nối.'
    );
  }
}

function toRuntimeConfig(diskConfig) {
  const runtime = withoutSecrets(diskConfig);
  if (Object.hasOwn(diskConfig, 'password')) {
    runtime.password = diskConfig.password;
  } else {
    const decrypted = decryptPassword(diskConfig);
    if (decrypted !== undefined) runtime.password = decrypted;
  }
  return runtime;
}

function toDiskConfig(runtimeConfig, preservedEncryption = null) {
  const disk = withoutSecrets(runtimeConfig);
  const password = runtimeConfig.password;
  if (password !== undefined && typeof password !== 'string') {
    throw new Error('Mật khẩu SQL Server không hợp lệ');
  }
  if (!password) return disk;

  if (preservedEncryption &&
      preservedEncryption.passwordEncryption === PASSWORD_ENCRYPTION &&
      typeof preservedEncryption.passwordEncrypted === 'string' &&
      preservedEncryption.passwordEncrypted) {
    disk.passwordEncryption = PASSWORD_ENCRYPTION;
    disk.passwordEncrypted = preservedEncryption.passwordEncrypted;
    return disk;
  }

  disk.passwordEncryption = PASSWORD_ENCRYPTION;
  disk.passwordEncrypted = encryptPassword(password);
  return disk;
}

function writeConfigAtomically(configPath, diskConfig, preserveMalformedAt = null) {
  const tempPath = path.join(path.dirname(configPath), `.db-config-${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(tempPath, JSON.stringify(diskConfig, null, 2), 'utf8');
    if (preserveMalformedAt) {
      ensureEncryptionAvailable();
      let contentEncrypted;
      try {
        const originalBase64 = fs.readFileSync(configPath).toString('base64');
        contentEncrypted = safeStorage.encryptString(originalBase64).toString('base64');
      } catch (error) {
        throw new Error(`Không thể mã hóa bản sao cấu hình SQL Server lỗi: ${error.message}`);
      }
      fs.writeFileSync(preserveMalformedAt, JSON.stringify({
        format: 'db-config-invalid-backup',
        version: 1,
        encryption: PASSWORD_ENCRYPTION,
        contentEncoding: 'base64',
        contentEncrypted,
      }, null, 2), { encoding: 'utf8', flag: 'wx' });
    }
    fs.renameSync(tempPath, configPath);
  } finally {
    try { fs.rmSync(tempPath, { force: true }); } catch (_) {}
  }
}

function readDbConfig() {
  const configPath = getDbConfigPath();
  if (!fs.existsSync(configPath)) return null;
  const diskConfig = readJson(configPath);
  const runtimeConfig = validateDbConfig(toRuntimeConfig(diskConfig));

  // Một lần duy nhất: chuyển file cấu hình cũ có password plaintext sang safeStorage.
  if (Object.hasOwn(diskConfig, 'password')) {
    writeConfigAtomically(configPath, toDiskConfig(runtimeConfig));
  }
  return runtimeConfig;
}

function readDbConfigForRecovery() {
  const configPath = getDbConfigPath();
  if (!fs.existsSync(configPath)) return null;
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return config && typeof config === 'object' && !Array.isArray(config)
      ? withoutSecrets(config)
      : null;
  } catch (_) {
    return null;
  }
}

function writeDbConfig(patch) {
  const configPath = getDbConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });

  let existing = {};
  let preserveMalformedAt = null;
  if (fs.existsSync(configPath)) {
    try {
      existing = readJson(configPath);
    } catch (_) {
      preserveMalformedAt = path.join(
        path.dirname(configPath),
        `db-config.invalid-${Date.now()}-${randomUUID()}.bak`,
      );
    }
  }

  const publicExisting = withoutSecrets(existing);
  const publicPatch = withoutSecrets(patch || {});
  const hasNewPassword = typeof patch?.password === 'string' && patch.password.length > 0;
  const proposedPublicConfig = { ...publicExisting, ...publicPatch, mode: 'sqlserver' };
  const hasExistingPassword =
    (typeof existing.password === 'string' && existing.password.length > 0) ||
    Boolean(existing.passwordEncrypted || existing.passwordEncryption);
  if (!hasNewPassword && hasExistingPassword &&
      !sameCredentialEndpoint(existing, proposedPublicConfig)) {
    throw new Error('Vui lòng nhập lại mật khẩu khi thay đổi máy chủ hoặc tài khoản SQL Server');
  }
  let password;
  let preservedEncryption = null;

  if (hasNewPassword) {
    password = patch.password;
  } else if (typeof existing.password === 'string' && existing.password) {
    password = existing.password;
  } else if (existing.passwordEncrypted || existing.passwordEncryption) {
    password = decryptPassword(existing);
    preservedEncryption = existing;
  } else if (Object.hasOwn(patch || {}, 'password')) {
    password = patch.password;
  }

  const next = proposedPublicConfig;
  if (password !== undefined) next.password = password;
  const validated = validateDbConfig(next);
  const diskConfig = toDiskConfig(validated, preservedEncryption);
  writeConfigAtomically(configPath, diskConfig, preserveMalformedAt);

  return validated;
}

module.exports = {
  getDbConfigPath,
  readDbConfig,
  readDbConfigForRecovery,
  writeDbConfig,
  validateDbConfig,
};
