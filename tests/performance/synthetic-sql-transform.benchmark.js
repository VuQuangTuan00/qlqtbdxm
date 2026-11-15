'use strict';

const os = require('node:os');
const { performance } = require('node:perf_hooks');
const { transformSql } = require('../../main/database/mssql');

const query = `
  WITH recent AS (
    SELECT id, equipment_name, is_active
    FROM equipments
    WHERE equipment_name ILIKE $1 AND is_active = TRUE
  )
  SELECT * FROM recent ORDER BY id DESC LIMIT $2 OFFSET $3
`;

const sizes = [100, 1_000, 10_000];
const results = [];

for (const size of sizes) {
  const started = performance.now();
  let checksum = 0;
  for (let index = 0; index < size; index += 1) {
    const transformed = transformSql(query);
    checksum += transformed.length + 3 + index % 2;
  }
  const elapsedMs = performance.now() - started;
  results.push({
    records: size,
    elapsedMs: Number(elapsedMs.toFixed(3)),
    operationsPerSecond: Math.round(size / (elapsedMs / 1000)),
    checksum,
  });
}

console.log(JSON.stringify({
  node: process.version,
  platform: `${process.platform} ${process.arch}`,
  cpu: os.cpus()[0]?.model || 'unknown',
  logicalCpus: os.cpus().length,
  totalMemoryGiB: Number((os.totalmem() / 1024 ** 3).toFixed(1)),
  benchmark: 'SQL compatibility transformer; isolated synthetic input; no database access',
  results,
}, null, 2));
