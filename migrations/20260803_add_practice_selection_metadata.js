// Migration 20260803 add practice selection metadata cập nhật cấu trúc hoặc dữ liệu cơ sở dữ liệu theo cách có thể kiểm tra và lặp lại.
/* eslint-disable no-console */
require('dotenv').config({ quiet: true });

const db = require('../config/db');

const APPLY_FLAG = '--apply';
const REQUIRED_COLUMNS = Object.freeze({
  selection_version: 'VARCHAR(32) NULL',
  selection_seed: 'CHAR(16) NULL',
  selection_metadata: 'JSON NULL'
});

// Hàm getState dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function getState() {
  const rows = await db.query(
    `SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'PracticeSessions'
       AND COLUMN_NAME IN (?, ?, ?)`,
    Object.keys(REQUIRED_COLUMNS)
  );
  const columns = rows.map((row) => ({
    name: row.COLUMN_NAME,
    type: String(row.DATA_TYPE || '').toLowerCase(),
    maxLength: row.CHARACTER_MAXIMUM_LENGTH === null
      ? null
      : Number(row.CHARACTER_MAXIMUM_LENGTH)
  }));
  const available = new Set(columns.map((column) => String(column.name).toLowerCase()));
  return {
    ready: Object.keys(REQUIRED_COLUMNS).every((column) => available.has(column)),
    columns,
    missingColumns: Object.keys(REQUIRED_COLUMNS).filter((column) => !available.has(column))
  };
}

// Hàm apply dùng để cập nhật trạng thái hoặc dữ liệu theo quy tắc nghiệp vụ; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function apply() {
  const state = await getState();
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const column of state.missingColumns) {
    await db.query(
      `ALTER TABLE PracticeSessions ADD COLUMN ${column} ${REQUIRED_COLUMNS[column]} AFTER ai_hint_count`
    );
  }
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

  console.log(JSON.stringify({ mode: 'preflight', ...(await getState()) }, null, 2));
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!args.includes(APPLY_FLAG)) {
    console.log(
      `Dùng "node migrations/20260803_add_practice_selection_metadata.js ${APPLY_FLAG}" để bổ sung metadata.`
    );
    return;
  }

  await apply();
  console.log(JSON.stringify({ mode: 'post-apply', ...(await getState()) }, null, 2));
}

// Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
if (require.main === module) {
  main()
    .catch((error) => {
      console.error('Migration metadata lựa chọn đề thất bại:', error.message);
      process.exitCode = 1;
    })
    .finally(() => db.close());
}

module.exports = { APPLY_FLAG, REQUIRED_COLUMNS, getState };
