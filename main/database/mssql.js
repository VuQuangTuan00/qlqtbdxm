'use strict';

const sql  = require('mssql');
const path = require('path');
const fs   = require('fs');
const { readDbConfig } = require('../config/db-config');

let _pool = null;

// ── SQL Transformation (PG → MSSQL) ──────────────────────────────

function _protectSqlSegments(sqlStr) {
  const segments = [];
  const protectedSql = sqlStr.replace(
    /\/\*[\s\S]*?\*\/|--[^\r\n]*|'(?:''|[^'])*'|"(?:""|[^"])*"|\[(?:\]\]|[^\]])*\]/g,
    (segment) => {
      const token = `\u0000SQL_SEGMENT_${segments.length}\u0000`;
      segments.push(segment);
      return token;
    }
  );
  return { protectedSql, segments };
}

function _restoreSqlSegments(sqlStr, segments) {
  return sqlStr.replace(/\u0000SQL_SEGMENT_(\d+)\u0000/g, (_token, index) => segments[Number(index)]);
}

function _findTopLevelSelect(sqlStr) {
  let depth = 0;
  for (let i = 0; i < sqlStr.length; i++) {
    if (sqlStr[i] === '(') depth++;
    else if (sqlStr[i] === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0 && /^SELECT\b/i.test(sqlStr.slice(i))) return i;
  }
  return -1;
}

function _transformSql(sqlStr) {
  const { protectedSql, segments } = _protectSqlSegments(sqlStr);
  let s = protectedSql;

  // 1. Positional params $1 → @p1
  s = s.replace(/\$(\d+)/g, '@p$1');

  // 2. ILIKE → LIKE (SQL Server case-insensitive by default)
  s = s.replace(/\bILIKE\b/gi, 'LIKE');

  // 2b. CURRENT_DATE → CAST(GETDATE() AS DATE)
  s = s.replace(/\bCURRENT_DATE\b/gi, 'CAST(GETDATE() AS DATE)');
  s = s.replace(/\bTRUE\b/gi, '1');
  s = s.replace(/\bFALSE\b/gi, '0');

  // 3. INSERT INTO t (cols) VALUES (...) RETURNING *
  //    → INSERT INTO t (cols) OUTPUT INSERTED.* VALUES (...)
  s = s.replace(
    /(INSERT\s+INTO\s+\S+\s*\([^)]+\))\s+(VALUES\s*\([^)]*\))\s*RETURNING\s+\*/gi,
    '$1 OUTPUT INSERTED.* $2'
  );

  // 4. UPDATE t SET ... WHERE ... RETURNING *
  //    → UPDATE t SET ... OUTPUT INSERTED.* WHERE ...
  s = s.replace(
    /(UPDATE\s+\S+\s+SET\s+)([\s\S]+?)(\s+WHERE\s+[\s\S]+?)\s*RETURNING\s+\*\s*$/i,
    '$1$2 OUTPUT INSERTED.*$3'
  );

  // 5. LIMIT n OFFSET m → OFFSET m ROWS FETCH NEXT n ROWS ONLY
  s = s.replace(
    /\bLIMIT\s+(@p\d+|\d+)\s+OFFSET\s+(@p\d+|\d+)/gi,
    'OFFSET $2 ROWS FETCH NEXT $1 ROWS ONLY'
  );

  // 6. LIMIT n (without OFFSET) → SELECT TOP n ...
  if (!/\bOFFSET\b|\bFETCH\b/i.test(s)) {
    const m = /\bLIMIT\s+(@p\d+|\d+)\s*$/i.exec(s);
    if (m) {
      const n = m[1];
      s = s.substring(0, s.length - m[0].length).trimEnd();
      const selectIndex = _findTopLevelSelect(s);
      if (selectIndex >= 0) {
        s = `${s.slice(0, selectIndex)}SELECT TOP ${n}${s.slice(selectIndex + 'SELECT'.length)}`;
      }
    }
  }

  return _restoreSqlSegments(s, segments);
}

// ── Request builder ───────────────────────────────────────────────

function _makeRequest(target, params = []) {
  // target = pool or Transaction
  const req = (target instanceof sql.Transaction)
    ? new sql.Request(target)
    : target.request();

  params.forEach((val, idx) => {
    const name = `p${idx + 1}`;
    if (val === null || val === undefined) {
      req.input(name, sql.NVarChar(sql.MAX), null);
    } else if (typeof val === 'boolean') {
      req.input(name, sql.Bit, val ? 1 : 0);
    } else if (typeof val === 'number' && Number.isInteger(val)) {
      req.input(name, sql.Int, val);
    } else if (typeof val === 'number') {
      req.input(name, sql.Float, val);
    } else if (val instanceof Date) {
      req.input(name, sql.DateTime2, val);
    } else {
      req.input(name, sql.NVarChar(sql.MAX), String(val));
    }
  });

  return req;
}

async function _execQuery(target, sqlStr, params = []) {
  const transformed = _transformSql(sqlStr);
  const req         = _makeRequest(target, params);
  const result      = await req.query(transformed);
  return {
    rows:     result.recordset     || [],
    rowCount: result.rowsAffected?.[0] ?? 0,
  };
}

// ── Init & Migrations ─────────────────────────────────────────────

function normalizeEndpoint(cfg) {
  let server = String(cfg.server || '').trim().replace(/^tcp:/i, '');
  let instanceName = typeof cfg.instanceName === 'string' ? cfg.instanceName.trim() : '';
  let port = (cfg.port === undefined || cfg.port === null || cfg.port === '')
    ? undefined
    : Number(cfg.port);

  const withPort = /^(.*),\s*(\d+)$/.exec(server);
  if (withPort) {
    server = withPort[1].trim();
    port = Number(withPort[2]);
  }

  if (/[\\/]$/.test(server)) throw new Error('Tên instance SQL Server không hợp lệ');

  const withInstance = /^(.*?)[\\/](.+)$/.exec(server);
  if (withInstance) {
    server = withInstance[1].trim();
    const parsedInstanceName = withInstance[2].trim();
    if (!parsedInstanceName) throw new Error('Tên instance SQL Server không hợp lệ');
    instanceName = instanceName || parsedInstanceName;
  }

  if (['.', '(local)'].includes(server.toLowerCase())) server = 'localhost';

  return { server, instanceName, port };
}

function buildMssqlConnectionOptions(cfg) {
  const endpoint = normalizeEndpoint(cfg);
  if (!endpoint.server) throw new Error('Máy chủ SQL Server không được để trống');
  if (endpoint.port !== undefined &&
      (!Number.isInteger(endpoint.port) || endpoint.port < 1 || endpoint.port > 65535)) {
    throw new Error('Cổng SQL Server phải là số nguyên từ 1 đến 65535');
  }
  const connection = {
    server: endpoint.server,
    database: cfg.database,
    user: cfg.user,
    password: cfg.password,
    options: {
      encrypt: true,
      trustServerCertificate: true,
      enableArithAbort: true,
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
    connectionTimeout: 5000,
    requestTimeout: 60000,
  };

  if (endpoint.instanceName && (endpoint.port === undefined || endpoint.port === 1433)) {
    connection.options.instanceName = endpoint.instanceName;
  } else if (endpoint.port !== undefined) {
    connection.port = endpoint.port;
  }

  return connection;
}

async function initMssqlDatabase() {
  if (_pool) return _pool;

  const cfg = readDbConfig();
  if (!cfg) throw new Error('Chưa cấu hình kết nối SQL Server.');

  const connectionOptions = buildMssqlConnectionOptions(cfg);
  _pool = await sql.connect(connectionOptions);

  const endpoint = connectionOptions.port !== undefined
    ? `${connectionOptions.server}:${connectionOptions.port}`
    : connectionOptions.options.instanceName
      ? `${connectionOptions.server}\\${connectionOptions.options.instanceName}`
      : connectionOptions.server;
  console.log(`[MSSQL] Kết nối thành công: ${endpoint}/${cfg.database}`);
  await _runMigrations();
  return _pool;
}

async function _runMigrations() {
  // Create migration tracking table
  await _pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = '_migrations' AND schema_id = SCHEMA_ID('dbo'))
    CREATE TABLE _migrations (
      id         INT IDENTITY(1,1) PRIMARY KEY,
      filename   NVARCHAR(255) NOT NULL UNIQUE,
      applied_at DATETIME2 DEFAULT GETDATE()
    )
  `);

  const migrDir = path.join(__dirname, 'migrations-mssql');
  if (!fs.existsSync(migrDir)) return;

  const files = fs.readdirSync(migrDir).filter((f) => f.endsWith('.sql')).sort();
  const { recordset } = await _pool.request().query('SELECT filename FROM _migrations');
  const applied = new Set(recordset.map((r) => r.filename));

  for (const file of files) {
    if (applied.has(file)) continue;
    console.log(`[MSSQL] Migration: ${file}`);
    const content = fs.readFileSync(path.join(migrDir, file), 'utf-8');

    // Split on GO batch separator (T-SQL convention)
    const batches = content.split(/^\s*GO\s*$/im).filter((b) => b.trim());

    const tx = new sql.Transaction(_pool);
    await tx.begin();
    try {
      for (const batch of batches) {
        if (!batch.trim()) continue;

        // tedious có thể phát ra NHIỀU sự kiện 'error' trong một batch (lỗi cụ thể
        // rồi tới message tổng kết như "Could not create constraint or index.
        // See previous errors."). mssql chỉ reject với lỗi CUỐI CÙNG — ta phải tự
        // bắt hết để không mất lỗi gốc thật.
        const req = new sql.Request(tx);
        const sqlErrors = [];
        req.on('error', (e) => sqlErrors.push(e.message));

        try {
          await req.query(batch);
        } catch (batchErr) {
          if (sqlErrors.length) {
            batchErr.message =
              `${batchErr.message}\n--- Toàn bộ lỗi SQL Server trong batch (theo thứ tự) ---\n` +
              sqlErrors.map((m, i) => `  [${i + 1}] ${m}`).join('\n') +
              `\n--- Batch gây lỗi ---\n${batch.trim().slice(0, 500)}`;
          }
          throw batchErr;
        }
      }
      await new sql.Request(tx).input('fn', sql.NVarChar(255), file)
        .query('INSERT INTO _migrations (filename) VALUES (@fn)');
      await tx.commit();
    } catch (err) {
      // Rollback có thể tự throw lỗi thứ cấp (vd. "Transaction has been aborted"
      // khi SQL Server đã tự abort transaction do lỗi nghiêm trọng ở batch trước).
      // Bắt riêng để KHÔNG che mất lỗi gốc — lỗi gốc mới là nguyên nhân thật.
      try {
        await tx.rollback();
      } catch (rollbackErr) {
        console.error('[MSSQL] Rollback thất bại (transaction đã bị server tự abort):', rollbackErr.message);
      }
      console.error(`[MSSQL] Migration '${file}' thất bại — lỗi gốc:`, err.message);
      throw err;
    }
  }
}

// ── pg-compatible DB interface ────────────────────────────────────

function getMssqlDb() {
  if (!_pool) throw new Error('SQL Server chưa khởi tạo');

  return {
    // Simple query (no transaction)
    query: (sqlStr, params = []) => _execQuery(_pool, sqlStr, params),

    // Transaction-aware client (mirrors pg's pool.connect() API)
    connect: async () => {
      const tx = new sql.Transaction(_pool);
      let txStarted = false;

      return {
        query: async (sqlStr, params = []) => {
          const cmd = sqlStr.trim().toUpperCase();

          if (cmd === 'BEGIN') {
            await tx.begin();
            txStarted = true;
            return { rows: [], rowCount: 0 };
          }
          if (cmd === 'COMMIT') {
            await tx.commit();
            txStarted = false;
            return { rows: [], rowCount: 0 };
          }
          if (cmd === 'ROLLBACK') {
            if (txStarted) await tx.rollback();
            txStarted = false;
            return { rows: [], rowCount: 0 };
          }

          return _execQuery(tx, sqlStr, params);
        },
        release: async () => {
          // no-op: tx has been committed or rolled back already
        },
      };
    },
  };
}

async function closeMssqlDatabase() {
  if (_pool) {
    await _pool.close();
    _pool = null;
  }
}

async function resolveMssqlBackupDirectory(config, loadServerDefault) {
  let backupDirectory = typeof config?.backupDirectory === 'string'
    ? config.backupDirectory.trim()
    : '';

  if (!backupDirectory) {
    const serverDefault = await loadServerDefault();
    backupDirectory = typeof serverDefault === 'string' ? serverDefault.trim() : '';
  }

  if (!backupDirectory) {
    throw new Error(
      'SQL Server không cung cấp thư mục backup mặc định. ' +
      'Hãy cấu hình backupDirectory trong db-config.json; với SQL Server từ xa, dùng đường dẫn UNC dùng chung.'
    );
  }

  let directoryExists = false;
  try {
    directoryExists = fs.existsSync(backupDirectory) && fs.statSync(backupDirectory).isDirectory();
  } catch (error) {
    throw new Error(
      `Không thể truy cập thư mục backup SQL Server: ${backupDirectory}. Chi tiết: ${error.message}. ` +
      'Hãy cấu hình backupDirectory trong db-config.json; với SQL Server từ xa, dùng đường dẫn UNC dùng chung.'
    );
  }

  if (!directoryExists) {
    throw new Error(
      `Không tìm thấy thư mục backup SQL Server: ${backupDirectory}. ` +
      'Hãy cấu hình backupDirectory trong db-config.json; với SQL Server từ xa, dùng đường dẫn UNC dùng chung.'
    );
  }

  return backupDirectory;
}

async function getMssqlBackupDirectory() {
  if (!_pool) throw new Error('SQL Server chưa khởi tạo');
  const config = readDbConfig();
  if (!config) throw new Error('Chưa cấu hình kết nối SQL Server.');

  return resolveMssqlBackupDirectory(config, async () => {
    const result = await _pool.request().query(
      "SELECT CONVERT(nvarchar(4000), SERVERPROPERTY('InstanceDefaultBackupPath')) AS backup_directory"
    );
    return result.recordset?.[0]?.backup_directory || '';
  });
}

async function backupMssqlDatabase(destinationPath) {
  if (!_pool) throw new Error('SQL Server chưa khởi tạo');
  const config = readDbConfig();
  if (!config) throw new Error('Chưa cấu hình kết nối SQL Server.');
  if (!config.database) throw new Error('Chưa cấu hình tên database.');

  const databaseName = String(config.database).replace(/]/g, ']]');
  const request = _pool.request();
  request.timeout = 0;
  request.input('backupPath', sql.NVarChar(4000), destinationPath);
  await request.query(`BACKUP DATABASE [${databaseName}] TO DISK = @backupPath WITH COPY_ONLY, INIT, CHECKSUM`);
  return { database: config.database, path: destinationPath };
}

function escapeIdentifier(value) {
  return String(value).replace(/]/g, ']]');
}

function escapeSqlString(value) {
  return String(value).replace(/'/g, "''");
}

function safeDatabaseFileName(value) {
  const sanitized = String(value || 'database').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
  return sanitized || 'database';
}

function buildRestoreMoveClauses(fileList, currentFiles, defaultPaths, databaseName) {
  const rowsFiles = (currentFiles || []).filter((file) => file.type_desc === 'ROWS');
  const logFiles = (currentFiles || []).filter((file) => file.type_desc === 'LOG');
  let rowsIndex = 0;
  let logIndex = 0;
  const baseName = safeDatabaseFileName(databaseName);

  if (!Array.isArray(fileList) || fileList.length === 0) {
    throw new Error('File backup không có danh sách file dữ liệu SQL Server.');
  }

  return fileList.map((file) => {
    const logicalName = file.LogicalName;
    const type = String(file.Type || '').toUpperCase();
    if (!logicalName || !['D', 'L'].includes(type)) {
      throw new Error('Danh sách file trong backup SQL Server không hợp lệ.');
    }

    let physicalPath;
    if (type === 'D') {
      physicalPath = rowsFiles[rowsIndex]?.physical_name;
      if (!physicalPath) {
        if (!defaultPaths.dataPath) throw new Error('SQL Server không cung cấp thư mục data mặc định.');
        const suffix = rowsIndex === 0 ? '.mdf' : `_data_${rowsIndex + 1}.ndf`;
        physicalPath = path.win32.join(defaultPaths.dataPath, `${baseName}${suffix}`);
      }
      rowsIndex += 1;
    } else {
      physicalPath = logFiles[logIndex]?.physical_name;
      if (!physicalPath) {
        if (!defaultPaths.logPath) throw new Error('SQL Server không cung cấp thư mục log mặc định.');
        const suffix = logIndex === 0 ? '_log.ldf' : `_log_${logIndex + 1}.ldf`;
        physicalPath = path.win32.join(defaultPaths.logPath, `${baseName}${suffix}`);
      }
      logIndex += 1;
    }

    return `MOVE N'${escapeSqlString(logicalName)}' TO N'${escapeSqlString(physicalPath)}'`;
  });
}

async function requestWithPath(pool, statement, backupPath) {
  const request = pool.request();
  request.timeout = 0;
  request.input('backupPath', sql.NVarChar(4000), backupPath);
  return request.query(statement);
}

async function getBackupFileList(pool, backupPath) {
  const result = await requestWithPath(
    pool,
    'RESTORE FILELISTONLY FROM DISK = @backupPath',
    backupPath,
  );
  return result.recordset || [];
}

async function restoreBackupOnPool(pool, databaseName, backupPath, moveClauses) {
  const databaseIdentifier = escapeIdentifier(databaseName);
  const moves = moveClauses.length ? `, ${moveClauses.join(', ')}` : '';
  return requestWithPath(
    pool,
    `RESTORE DATABASE [${databaseIdentifier}] FROM DISK = @backupPath ` +
      `WITH REPLACE, RECOVERY, CHECKSUM${moves}`,
    backupPath,
  );
}

async function setDatabaseAccessMode(pool, databaseName, mode) {
  const databaseIdentifier = escapeIdentifier(databaseName);
  const suffix = mode === 'SINGLE_USER' ? ' WITH ROLLBACK IMMEDIATE' : '';
  await pool.request().query(`ALTER DATABASE [${databaseIdentifier}] SET ${mode}${suffix}`);
}

async function restoreMssqlDatabase(backupPath, safetyBackupPath) {
  const config = readDbConfig();
  if (!config?.database) throw new Error('Chưa cấu hình database SQL Server.');
  if (!backupPath || !safetyBackupPath) throw new Error('Thiếu đường dẫn backup để khôi phục database.');

  const databaseName = config.database;
  const databaseIdentifier = escapeIdentifier(databaseName);
  const masterConfig = buildMssqlConnectionOptions({ ...config, database: 'master' });
  const masterPool = new sql.ConnectionPool(masterConfig);
  let safetyBackupCreated = false;
  let restoreStarted = false;
  let masterConnected = false;
  let applicationPoolClosed = false;
  let currentFiles = [];
  let defaultPaths = { dataPath: '', logPath: '' };

  try {
    await masterPool.connect();
    masterConnected = true;

    await requestWithPath(
      masterPool,
      'RESTORE VERIFYONLY FROM DISK = @backupPath WITH CHECKSUM',
      backupPath,
    );
    const incomingFileList = await getBackupFileList(masterPool, backupPath);

    const currentRequest = masterPool.request();
    currentRequest.input('databaseName', sql.NVarChar(128), databaseName);
    const currentResult = await currentRequest.query(`
      SELECT type_desc, physical_name
      FROM sys.master_files
      WHERE database_id = DB_ID(@databaseName)
      ORDER BY file_id
    `);
    const pathResult = await masterPool.request().query(`
      SELECT
        CONVERT(nvarchar(4000), SERVERPROPERTY('InstanceDefaultDataPath')) AS data_path,
        CONVERT(nvarchar(4000), SERVERPROPERTY('InstanceDefaultLogPath')) AS log_path
    `);
    defaultPaths = {
      dataPath: pathResult.recordset?.[0]?.data_path || '',
      logPath: pathResult.recordset?.[0]?.log_path || '',
    };
    currentFiles = currentResult.recordset || [];
    const incomingMoves = buildRestoreMoveClauses(
      incomingFileList,
      currentFiles,
      defaultPaths,
      databaseName,
    );

    await requestWithPath(
      masterPool,
      `BACKUP DATABASE [${databaseIdentifier}] TO DISK = @backupPath WITH COPY_ONLY, INIT, CHECKSUM`,
      safetyBackupPath,
    );
    safetyBackupCreated = true;

    await closeMssqlDatabase();
    applicationPoolClosed = true;
    await setDatabaseAccessMode(masterPool, databaseName, 'SINGLE_USER');
    restoreStarted = true;
    await restoreBackupOnPool(masterPool, databaseName, backupPath, incomingMoves);
    await setDatabaseAccessMode(masterPool, databaseName, 'MULTI_USER');

    const stateRequest = masterPool.request();
    stateRequest.input('databaseName', sql.NVarChar(128), databaseName);
    const stateResult = await stateRequest.query(
      'SELECT state_desc FROM sys.databases WHERE name = @databaseName'
    );
    if (stateResult.recordset?.[0]?.state_desc !== 'ONLINE') {
      throw new Error('Database chưa trở lại trạng thái ONLINE sau khi khôi phục.');
    }

    return { database: databaseName, safetyBackupPath };
  } catch (error) {
    let rollbackMessage = '';
    if (masterConnected && safetyBackupCreated && restoreStarted) {
      try {
        const safetyFileList = await getBackupFileList(masterPool, safetyBackupPath);
        const rollbackMoves = buildRestoreMoveClauses(
          safetyFileList,
          currentFiles,
          defaultPaths,
          databaseName,
        );
        await setDatabaseAccessMode(masterPool, databaseName, 'SINGLE_USER');
        await restoreBackupOnPool(masterPool, databaseName, safetyBackupPath, rollbackMoves);
        await setDatabaseAccessMode(masterPool, databaseName, 'MULTI_USER');
        rollbackMessage = ' Đã phục hồi database cũ thành công từ bản backup an toàn.';
      } catch (rollbackError) {
        rollbackMessage =
          ` Không thể tự động rollback database: ${rollbackError.message}. ` +
          `Bản backup an toàn: ${safetyBackupPath}`;
      }
    }
    if (masterConnected && (restoreStarted || applicationPoolClosed)) {
      try {
        await setDatabaseAccessMode(masterPool, databaseName, 'MULTI_USER');
      } catch (multiUserError) {
        rollbackMessage += ` Không thể trả database về MULTI_USER: ${multiUserError.message}`;
      }
    }
    if (applicationPoolClosed && !_pool) {
      try {
        _pool = await sql.connect(buildMssqlConnectionOptions(config));
      } catch (reconnectError) {
        rollbackMessage += ` Không thể kết nối lại ứng dụng với SQL Server: ${reconnectError.message}`;
      }
    }
    error.message = `${error.message}${rollbackMessage}`;
    throw error;
  } finally {
    if (masterConnected) {
      try { await masterPool.close(); } catch (_) {}
    }
  }
}

module.exports = {
  initMssqlDatabase,
  getMssqlDb,
  closeMssqlDatabase,
  backupMssqlDatabase,
  restoreMssqlDatabase,
  getMssqlBackupDirectory,
  resolveMssqlBackupDirectory,
  buildMssqlConnectionOptions,
  normalizeEndpoint,
  getDbConfig: readDbConfig,
  transformSql: _transformSql,
};
