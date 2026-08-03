/* eslint-disable no-console */
require('dotenv').config({ quiet: true });

const db = require('../config/db');

const APPLY_FLAG = '--apply';
const REQUIRED_COLUMNS = Object.freeze({
  selection_version: 'VARCHAR(32) NULL',
  selection_seed: 'CHAR(16) NULL',
  selection_metadata: 'JSON NULL'
});

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

async function apply() {
  const state = await getState();
  for (const column of state.missingColumns) {
    await db.query(
      `ALTER TABLE PracticeSessions ADD COLUMN ${column} ${REQUIRED_COLUMNS[column]} AFTER ai_hint_count`
    );
  }
}

async function main() {
  const args = process.argv.slice(2);
  const unknown = args.filter((arg) => arg !== APPLY_FLAG);
  if (unknown.length > 0) {
    throw new Error(`Tham số không được hỗ trợ: ${unknown.join(', ')}`);
  }
  const connection = await db.testConnection();
  if (!connection.connected) {
    throw new Error(`Không kết nối được database: ${connection.reason || 'unknown'}`);
  }

  console.log(JSON.stringify({ mode: 'preflight', ...(await getState()) }, null, 2));
  if (!args.includes(APPLY_FLAG)) {
    console.log(
      `Dùng "node migrations/20260803_add_practice_selection_metadata.js ${APPLY_FLAG}" để bổ sung metadata.`
    );
    return;
  }

  await apply();
  console.log(JSON.stringify({ mode: 'post-apply', ...(await getState()) }, null, 2));
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error('Migration metadata lựa chọn đề thất bại:', error.message);
      process.exitCode = 1;
    })
    .finally(() => db.close());
}

module.exports = { APPLY_FLAG, REQUIRED_COLUMNS, getState };
