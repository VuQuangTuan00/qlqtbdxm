'use strict';

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { app } = require('electron');

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

function readDbConfig() {
  const configPath = getDbConfigPath();
  if (!fs.existsSync(configPath)) return null;
  return validateDbConfig(readJson(configPath));
}

function readDbConfigForRecovery() {
  const configPath = getDbConfigPath();
  if (!fs.existsSync(configPath)) return null;
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return config && typeof config === 'object' && !Array.isArray(config) ? config : null;
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

  const next = { ...existing, ...patch, mode: 'sqlserver' };
  if (!patch.password && existing.password) next.password = existing.password;
  const validated = validateDbConfig(next);
  const tempPath = path.join(path.dirname(configPath), `.db-config-${randomUUID()}.tmp`);

  try {
    fs.writeFileSync(tempPath, JSON.stringify(validated, null, 2), 'utf8');
    if (preserveMalformedAt) {
      fs.copyFileSync(configPath, preserveMalformedAt, fs.constants.COPYFILE_EXCL);
    }
    fs.renameSync(tempPath, configPath);
  } finally {
    try { fs.rmSync(tempPath, { force: true }); } catch (_) {}
  }

  return validated;
}

module.exports = {
  getDbConfigPath,
  readDbConfig,
  readDbConfigForRecovery,
  writeDbConfig,
  validateDbConfig,
};
