/* eslint-disable no-console */
require('dotenv').config({ quiet: true });

const db = require('../config/db');

const APPLY_FLAG = '--apply';
const REQUIRED_COLUMNS = Object.freeze({
  email: 'VARCHAR(254) NULL AFTER fullname',
  email_verified_at: 'DATETIME NULL AFTER email',
  pending_email: 'VARCHAR(254) NULL AFTER email_verified_at'
});

async function getState() {
  const [columnRows, tableRows, indexRows] = await Promise.all([
    db.query(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'Students'
         AND COLUMN_NAME IN (?, ?, ?)`,
      Object.keys(REQUIRED_COLUMNS)
    ),
    db.query(
      `SELECT COUNT(*) AS total
       FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'AccountVerificationCodes'`
    ),
    db.query(
      `SELECT COUNT(*) AS total
       FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'Students'
         AND INDEX_NAME = 'uq_students_verified_email'`
    )
  ]);
  const columns = new Set(columnRows.map((row) => String(row.COLUMN_NAME).toLowerCase()));
  return {
    ready: Object.keys(REQUIRED_COLUMNS).every((name) => columns.has(name))
      && Number(tableRows[0]?.total || 0) === 1
      && Number(indexRows[0]?.total || 0) === 1,
    missingColumns: Object.keys(REQUIRED_COLUMNS).filter((name) => !columns.has(name)),
    verificationTableReady: Number(tableRows[0]?.total || 0) === 1,
    emailIndexReady: Number(indexRows[0]?.total || 0) === 1
  };
}

async function apply() {
  const state = await getState();
  for (const column of state.missingColumns) {
    await db.query(`ALTER TABLE Students ADD COLUMN ${column} ${REQUIRED_COLUMNS[column]}`);
  }
  if (!state.emailIndexReady) {
    await db.query('CREATE UNIQUE INDEX uq_students_verified_email ON Students(email)');
  }
  if (!state.verificationTableReady) {
    await db.query(
      `CREATE TABLE AccountVerificationCodes (
         id BIGINT AUTO_INCREMENT PRIMARY KEY,
         student_id INT NOT NULL,
         purpose VARCHAR(30) NOT NULL,
         target_email VARCHAR(254) NOT NULL,
         code_hash CHAR(64) NOT NULL,
         attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
         expires_at DATETIME NOT NULL,
         consumed_at DATETIME NULL,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         CONSTRAINT fk_verification_code_student
           FOREIGN KEY (student_id) REFERENCES Students(id) ON DELETE CASCADE,
         INDEX idx_verification_code_lookup
           (student_id, purpose, target_email, consumed_at, created_at),
         INDEX idx_verification_code_expiry (expires_at)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    );
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
  const args = parseArguments();
  const connection = await db.testConnection();
  if (!connection.connected) throw new Error(`Không kết nối được database: ${connection.reason || 'unknown'}`);
  console.log(JSON.stringify({ mode: 'preflight', ...(await getState()) }, null, 2));
  if (!args.applyRequested) {
    console.log(`Dùng "npm run db:email-recovery -- --apply --confirm-database=${process.env.DB_NAME}" để áp dụng.`);
    return;
  }
  await apply();
  console.log(JSON.stringify({ mode: 'post-apply', ...(await getState()) }, null, 2));
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error('Migration email recovery thất bại:', error.message);
      process.exitCode = 1;
    })
    .finally(() => db.close());
}

module.exports = { APPLY_FLAG, REQUIRED_COLUMNS, apply, getState, parseArguments };
