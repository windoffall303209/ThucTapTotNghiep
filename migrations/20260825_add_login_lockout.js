/* eslint-disable no-console */
require('dotenv').config({ quiet: true });

const db = require('../config/db');

const APPLY_FLAG = '--apply';
const ACCOUNT_TABLES = Object.freeze(['Admins', 'Students']);
const REQUIRED_COLUMNS = Object.freeze({
  failed_login_attempts: 'TINYINT UNSIGNED NOT NULL DEFAULT 0',
  login_locked_until: 'DATETIME(3) NULL'
});

async function columnExists(tableName, columnName) {
  const rows = await db.query(
    `SELECT COUNT(*) AS total
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  return Number(rows[0]?.total || 0) > 0;
}

async function getState() {
  const tables = {};
  for (const tableName of ACCOUNT_TABLES) {
    tables[tableName] = {};
    for (const columnName of Object.keys(REQUIRED_COLUMNS)) {
      tables[tableName][columnName] = await columnExists(tableName, columnName);
    }
  }
  return {
    ready: Object.values(tables).every((columns) => Object.values(columns).every(Boolean)),
    tables
  };
}

async function apply() {
  for (const tableName of ACCOUNT_TABLES) {
    for (const [columnName, definition] of Object.entries(REQUIRED_COLUMNS)) {
      if (!(await columnExists(tableName, columnName))) {
        await db.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
      }
    }
  }
}

function parseArguments(argv = process.argv.slice(2), env = process.env) {
  const applyRequested = argv.includes(APPLY_FLAG);
  const confirmation = argv.find((arg) => arg.startsWith('--confirm-database='))?.slice(19) || '';
  const unknown = argv.filter((arg) => arg !== APPLY_FLAG && !arg.startsWith('--confirm-database='));
  if (unknown.length) throw new Error(`Tham số không được hỗ trợ: ${unknown.join(', ')}`);
  if (applyRequested && confirmation !== String(env.DB_NAME || '')) {
    throw new Error(`Phải xác nhận đúng database bằng --confirm-database=${env.DB_NAME || '<database>'}`);
  }
  return { applyRequested };
}

async function main() {
  const { applyRequested } = parseArguments();
  const connection = await db.testConnection();
  if (!connection.connected) {
    throw new Error(`Không kết nối được database: ${connection.reason || 'unknown'}`);
  }

  console.log(JSON.stringify({ mode: 'preflight', ...(await getState()) }, null, 2));
  if (!applyRequested) {
    console.log(
      `Dùng "npm run db:login-lockout -- --apply --confirm-database=${process.env.DB_NAME}" để áp dụng.`
    );
    return;
  }

  await apply();
  console.log(JSON.stringify({ mode: 'post-apply', ...(await getState()) }, null, 2));
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error('Migration khóa tạm đăng nhập thất bại:', error.message);
      process.exitCode = 1;
    })
    .finally(() => db.close());
}

module.exports = {
  ACCOUNT_TABLES,
  APPLY_FLAG,
  REQUIRED_COLUMNS,
  apply,
  getState,
  parseArguments
};
