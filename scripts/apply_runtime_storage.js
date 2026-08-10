// Script apply runtime storage hỗ trợ nhập, xuất, kiểm tra hoặc bảo trì dữ liệu và cấu hình của dự án.
/* eslint-disable no-console */
require('dotenv').config({ quiet: true });

const db = require('../config/db');

const APPLY_FLAG = '--apply';

// Hàm getState dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
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

// Hàm apply dùng để cập nhật trạng thái hoặc dữ liệu theo quy tắc nghiệp vụ; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
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

// Hàm main dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function main() {
  const args = process.argv.slice(2);
  const unknown = args.filter((arg) => arg !== APPLY_FLAG);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (unknown.length > 0) {
    throw new Error(`Tham số không được hỗ trợ: ${unknown.join(', ')}`);
  }
  const connection = await db.testConnection();
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!connection.connected) {
    throw new Error(`Không kết nối được database: ${connection.reason || 'unknown'}`);
  }

  const before = await getState();
  console.log(JSON.stringify({ mode: 'preflight', ...before }, null, 2));
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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
