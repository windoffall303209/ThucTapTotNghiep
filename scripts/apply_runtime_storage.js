// Script apply runtime storage h? tr? nh?p, xu?t, ki?m tra ho?c b?o tr? d? li?u v? c?u h?nh c?a d? ?n.
/* eslint-disable no-console */
require('dotenv').config({ quiet: true });

const db = require('../config/db');

const APPLY_FLAG = '--apply';

// H?m getState d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function getState() {
  const rows = await db.query(
    `SELECT TABLE_NAME, COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME IN ('AppSessions', 'RequestRateLimits')`
  );
  const sessionColumns = rows
    .filter((row) => String(row.TABLE_NAME).toLowerCase() === 'appsessions')
    .map((row) => row.COLUMN_NAME);
  const rateLimitColumns = rows
    .filter((row) => String(row.TABLE_NAME).toLowerCase() === 'requestratelimits')
    .map((row) => row.COLUMN_NAME);
  const countRows = sessionColumns.length > 0
    ? await db.query(
      `SELECT
         COUNT(*) AS total,
         SUM(expires_at <= CURRENT_TIMESTAMP(3)) AS expired
       FROM AppSessions`
    )
    : [{ total: 0, expired: 0 }];
  const rateCountRows = rateLimitColumns.length > 0
    ? await db.query(
      `SELECT
         COUNT(*) AS total,
         SUM(reset_at <= CURRENT_TIMESTAMP(3)) AS expired
       FROM RequestRateLimits`
    )
    : [{ total: 0, expired: 0 }];
  const normalizedSessionColumns = sessionColumns.map((item) => String(item).toLowerCase());
  const normalizedRateColumns = rateLimitColumns.map((item) => String(item).toLowerCase());
  return {
    ready: (
      ['session_id', 'session_data', 'expires_at']
        .every((column) => normalizedSessionColumns.includes(column))
      && ['namespace', 'key_hash', 'hits', 'reset_at']
        .every((column) => normalizedRateColumns.includes(column))
    ),
    session_columns: sessionColumns,
    rate_limit_columns: rateLimitColumns,
    rows: Number(countRows[0]?.total || 0),
    expired_rows: Number(countRows[0]?.expired || 0),
    rate_limit_rows: Number(rateCountRows[0]?.total || 0),
    expired_rate_limit_rows: Number(rateCountRows[0]?.expired || 0)
  };
}

// H?m apply d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function apply() {
  await db.query(
    `CREATE TABLE IF NOT EXISTS AppSessions (
       session_id VARCHAR(128) PRIMARY KEY,
       session_data JSON NOT NULL,
       expires_at TIMESTAMP(3) NOT NULL,
       updated_at TIMESTAMP(3)
         DEFAULT CURRENT_TIMESTAMP(3)
         ON UPDATE CURRENT_TIMESTAMP(3),
       INDEX idx_app_sessions_expiry (expires_at)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
  await db.query(
    `CREATE TABLE IF NOT EXISTS RequestRateLimits (
       namespace VARCHAR(32) NOT NULL,
       key_hash CHAR(64) NOT NULL,
       hits INT UNSIGNED NOT NULL DEFAULT 0,
       reset_at TIMESTAMP(3) NOT NULL,
       updated_at TIMESTAMP(3)
         DEFAULT CURRENT_TIMESTAMP(3)
         ON UPDATE CURRENT_TIMESTAMP(3),
       PRIMARY KEY (namespace, key_hash),
       INDEX idx_request_rate_limits_expiry (reset_at)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
  await db.query('DELETE FROM AppSessions WHERE expires_at <= CURRENT_TIMESTAMP(3)');
  await db.query('DELETE FROM RequestRateLimits WHERE reset_at <= CURRENT_TIMESTAMP(3)');
}

// H?m main d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function main() {
  const args = process.argv.slice(2);
  const unknown = args.filter((arg) => arg !== APPLY_FLAG);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (unknown.length > 0) {
    throw new Error(`Tham số không được hỗ trợ: ${unknown.join(', ')}`);
  }
  const connection = await db.testConnection();
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!connection.connected) {
    throw new Error(`Không kết nối được database: ${connection.reason || 'unknown'}`);
  }

  const before = await getState();
  console.log(JSON.stringify({ mode: 'preflight', ...before }, null, 2));
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!args.includes(APPLY_FLAG)) {
    console.log(`Dùng "node scripts/apply_runtime_storage.js ${APPLY_FLAG}" để tạo bảng.`);
    return;
  }

  await apply();
  console.log(JSON.stringify({ mode: 'post-apply', ...(await getState()) }, null, 2));
}

main()
  .catch((error) => {
    console.error('Migration runtime storage thất bại:', error.message);
    process.exitCode = 1;
  })
  .finally(() => db.close());
