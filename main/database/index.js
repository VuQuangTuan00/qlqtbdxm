'use strict';

const {
  initSqliteDatabase,
  getSqliteDb,
  closeSqliteDatabase,
  backupSqliteDatabase,
  getDatabasePath,
  inspectSqliteFile,
  beginDatabaseMaintenance,
  endDatabaseMaintenance,
} = require('./sqlite');

async function initDatabase(options) {
  return initSqliteDatabase(options);
}

function getDb() {
  return getSqliteDb();
}

async function closeDatabase() {
  closeSqliteDatabase();
}

module.exports = {
  initDatabase, getDb, closeDatabase, backupSqliteDatabase, getDatabasePath,
  inspectSqliteFile, beginDatabaseMaintenance, endDatabaseMaintenance,
};
