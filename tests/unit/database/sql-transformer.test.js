'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { transformSql } = require('../../../main/database/mssql');

test('transformSql converts parameters, search, dates, and boolean literals for SQL Server', () => {
  assert.equal(
    transformSql('SELECT * FROM users WHERE username ILIKE $1 AND is_active = true AND locked = false AND created_at < CURRENT_DATE'),
    'SELECT * FROM users WHERE username LIKE @p1 AND is_active = 1 AND locked = 0 AND created_at < CAST(GETDATE() AS DATE)',
  );
});

test('transformSql does not rewrite tokens inside literals, identifiers, or comments', () => {
  const source = "SELECT '$1 ILIKE true CURRENT_DATE LIMIT 9' AS sample, [LIMIT] FROM users -- $2 ILIKE false\nWHERE id = $1 /* LIMIT 2 AND true */";
  const expected = "SELECT '$1 ILIKE true CURRENT_DATE LIMIT 9' AS sample, [LIMIT] FROM users -- $2 ILIKE false\nWHERE id = @p1 /* LIMIT 2 AND true */";
  assert.equal(transformSql(source), expected);
});

test('transformSql converts INSERT RETURNING into OUTPUT INSERTED', () => {
  assert.equal(
    transformSql('INSERT INTO units (unit_code, unit_name) VALUES ($1, $2) RETURNING *'),
    'INSERT INTO units (unit_code, unit_name) OUTPUT INSERTED.* VALUES (@p1, @p2)',
  );
});

test('transformSql converts UPDATE RETURNING into OUTPUT INSERTED before WHERE', () => {
  assert.equal(
    transformSql('UPDATE units SET unit_name = $1 WHERE id = $2 RETURNING *'),
    'UPDATE units SET unit_name = @p1 OUTPUT INSERTED.* WHERE id = @p2',
  );
});

test('transformSql converts LIMIT and OFFSET after an ordered query', () => {
  assert.equal(
    transformSql('SELECT * FROM units ORDER BY id LIMIT $1 OFFSET $2'),
    'SELECT * FROM units ORDER BY id OFFSET @p2 ROWS FETCH NEXT @p1 ROWS ONLY',
  );
});

test('transformSql applies TOP to the outer SELECT of a common table expression', () => {
  assert.equal(
    transformSql('WITH active AS (SELECT id FROM users WHERE is_active = true) SELECT * FROM active ORDER BY id LIMIT 5'),
    'WITH active AS (SELECT id FROM users WHERE is_active = 1) SELECT TOP 5 * FROM active ORDER BY id',
  );
});
