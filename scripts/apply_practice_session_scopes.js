require('dotenv').config();

const db = require('../config/db');

const ALLOWED_MODES = ['REVIEW', 'LESSON', 'CHAPTER', 'COMPREHENSIVE'];

async function columnExists(table, column) {
  const rows = await db.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [table, column]
  );
  return Number(rows[0]?.count || 0) > 0;
}

async function getSessionModeChecks() {
  try {
    return await db.query(
      `SELECT tc.CONSTRAINT_NAME AS constraint_name
       FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
       JOIN INFORMATION_SCHEMA.CHECK_CONSTRAINTS cc
         ON cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
        AND cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
       WHERE tc.CONSTRAINT_SCHEMA = DATABASE()
         AND tc.TABLE_NAME = 'PracticeSessions'
         AND tc.CONSTRAINT_TYPE = 'CHECK'
         AND LOWER(cc.CHECK_CLAUSE) LIKE '%session_mode%'`
    );
  } catch (error) {
    return [];
  }
}

async function dropCheckConstraint(name) {
  const escapedName = String(name).replace(/`/g, '``');
  try {
    await db.query(
      `ALTER TABLE PracticeSessions DROP CHECK \`${escapedName}\``
    );
  } catch (error) {
    await db.query(
      `ALTER TABLE PracticeSessions DROP CONSTRAINT \`${escapedName}\``
    );
  }
}

async function main() {
  const connection = await db.testConnection();
  if (!connection.connected) {
    throw new Error(`Không kết nối được MySQL: ${connection.reason || 'missing_config'}`);
  }

  if (!(await columnExists('PracticeSessions', 'chapter_id'))) {
    await db.query(
      'ALTER TABLE PracticeSessions ADD COLUMN chapter_id INT NULL AFTER lesson_id'
    );
  }
  if (!(await columnExists('PracticeSessions', 'scope_semester'))) {
    await db.query(
      'ALTER TABLE PracticeSessions ADD COLUMN scope_semester TINYINT NULL AFTER chapter_id'
    );
  }

  const checks = await getSessionModeChecks();
  for (const check of checks) {
    await dropCheckConstraint(check.constraint_name);
  }

  await db.query(
    `UPDATE PracticeSessions
     SET session_mode = 'COMPREHENSIVE'
     WHERE session_mode = 'EXAM'`
  );

  if (checks.length > 0) {
    const allowedSql = ALLOWED_MODES.map((mode) => `'${mode}'`).join(', ');
    await db.query(
      `ALTER TABLE PracticeSessions
       ADD CONSTRAINT chk_practice_session_mode
       CHECK (session_mode IN (${allowedSql}))`
    );
  }

  console.log(JSON.stringify({
    addedColumns: ['chapter_id', 'scope_semester'],
    allowedModes: ALLOWED_MODES,
    migratedLegacyExamMode: true
  }, null, 2));
}

main()
  .then(() => db.close())
  .catch(async (error) => {
    console.error('Lỗi cập nhật phạm vi phiên luyện tập:', error.message);
    await db.close();
    process.exitCode = 1;
  });
