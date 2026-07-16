'use strict';

/* ============================================================
   Database — chỉ dùng SQL Server (production)
   ============================================================ */

const {
  initMssqlDatabase,
  getMssqlDb,
  closeMssqlDatabase,
  getDbConfig,
} = require('./mssql');

async function initDatabase() {
  console.log('[DB] Kết nối SQL Server...');
  return await initMssqlDatabase();
}

function getDb() {
  return getMssqlDb();
}

async function closeDatabase() {
  await closeMssqlDatabase();
}

module.exports = { initDatabase, getDb, closeDatabase, getDbConfig };
