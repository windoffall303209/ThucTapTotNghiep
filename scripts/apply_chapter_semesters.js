// Script apply chapter semesters h? tr? nh?p, xu?t, ki?m tra ho?c b?o tr? d? li?u v? c?u h?nh c?a d? ?n.
require('dotenv').config();

const db = require('../config/db');

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

// H?m indexExists d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function indexExists(table, index) {
  const rows = await db.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND INDEX_NAME = ?`,
    [table, index]
  );
  return Number(rows[0]?.count || 0) > 0;
}

// H?m main d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function main() {
  const connection = await db.testConnection();
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!connection.connected) {
    throw new Error(`Không kết nối được MySQL: ${connection.reason || 'missing_config'}`);
  }

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!(await columnExists('Chapters', 'semester'))) {
    await db.query(
      'ALTER TABLE Chapters ADD COLUMN semester TINYINT NOT NULL DEFAULT 1 AFTER grade'
    );
  }

  await db.query(
    `UPDATE Chapters c
     JOIN (
       SELECT grade, CEIL(COUNT(*) / 2) AS first_semester_count
       FROM Chapters
       GROUP BY grade
     ) totals ON totals.grade = c.grade
     SET c.semester = CASE
       WHEN c.sort_order <= totals.first_semester_count THEN 1
       ELSE 2
     END`
  );

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!(await indexExists('Chapters', 'idx_chapters_grade_semester_sort'))) {
    await db.query(
      'CREATE INDEX idx_chapters_grade_semester_sort ON Chapters(grade, semester, sort_order, id)'
    );
  }

  const summary = await db.query(
    `SELECT grade, semester, COUNT(*) AS chapter_count
     FROM Chapters
     GROUP BY grade, semester
     ORDER BY grade, semester`
  );
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .then(() => db.close())
  .catch(async (error) => {
    console.error('Lỗi cập nhật học kỳ cho chương:', error.message);
    await db.close();
    process.exitCode = 1;
  });
