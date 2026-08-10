// Script apply practice session scopes h? tr? nh?p, xu?t, ki?m tra ho?c b?o tr? d? li?u v? c?u h?nh c?a d? ?n.
require('dotenv').config();

const db = require('../config/db');

const ALLOWED_MODES = ['REVIEW', 'LESSON', 'CHAPTER', 'COMPREHENSIVE'];

// H?m columnExists d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
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

// H?m getSessionModeChecks d?ng ?? ki?m tra t?nh h?p l? v? c?c ?i?u ki?n an to?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function getSessionModeChecks() {
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
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

// H?m dropCheckConstraint d?ng ?? ki?m tra t?nh h?p l? v? c?c ?i?u ki?n an to?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
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

// H?m main d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function main() {
  const connection = await db.testConnection();
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!connection.connected) {
    throw new Error(`Không kết nối được MySQL: ${connection.reason || 'missing_config'}`);
  }

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!(await columnExists('PracticeSessions', 'chapter_id'))) {
    await db.query(
      'ALTER TABLE PracticeSessions ADD COLUMN chapter_id INT NULL AFTER lesson_id'
    );
  }
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!(await columnExists('PracticeSessions', 'scope_semester'))) {
    await db.query(
      'ALTER TABLE PracticeSessions ADD COLUMN scope_semester TINYINT NULL AFTER chapter_id'
    );
  }

  const checks = await getSessionModeChecks();
  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const check of checks) {
    await dropCheckConstraint(check.constraint_name);
  }

  await db.query(
    `UPDATE PracticeSessions
     SET session_mode = 'COMPREHENSIVE'
     WHERE session_mode = 'EXAM'`
  );

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
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
