require('dotenv').config();

const db = require('../config/db');

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

async function main() {
  const connection = await db.testConnection();
  if (!connection.connected) {
    throw new Error(`Không kết nối được MySQL: ${connection.reason || 'missing_config'}`);
  }

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
