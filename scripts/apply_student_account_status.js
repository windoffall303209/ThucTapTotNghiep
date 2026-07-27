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
    throw new Error(`Không kết nối được MySQL: ${connection.reason || 'thiếu cấu hình'}`);
  }

  if (!(await columnExists('Students', 'is_active'))) {
    await db.query(
      'ALTER TABLE Students ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER current_grade'
    );
  }

  if (!(await indexExists('Students', 'idx_students_is_active'))) {
    await db.query('CREATE INDEX idx_students_is_active ON Students(is_active)');
  }

  console.log('Đã sẵn sàng cột trạng thái hoạt động cho tài khoản học sinh.');
}

main()
  .then(() => db.close())
  .catch(async (error) => {
    console.error('Không thể cập nhật trạng thái tài khoản học sinh:', error.message);
    await db.close();
    process.exitCode = 1;
  });
