// Script apply practice session scopes hỗ trợ nhập, xuất, kiểm tra hoặc bảo trì dữ liệu và cấu hình của dự án.
require('dotenv').config();

const db = require('../config/db');

const ALLOWED_MODES = ['REVIEW', 'LESSON', 'CHAPTER', 'COMPREHENSIVE'];

// Hàm columnExists dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
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

// Hàm getSessionModeChecks dùng để kiểm tra tính hợp lệ và các điều kiện an toàn; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function getSessionModeChecks() {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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

// Hàm dropCheckConstraint dùng để kiểm tra tính hợp lệ và các điều kiện an toàn; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
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

// Hàm main dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function main() {
  const connection = await db.testConnection();
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!connection.connected) {
    throw new Error(`Không kết nối được MySQL: ${connection.reason || 'missing_config'}`);
  }

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!(await columnExists('PracticeSessions', 'chapter_id'))) {
    await db.query(
      'ALTER TABLE PracticeSessions ADD COLUMN chapter_id INT NULL AFTER lesson_id'
    );
  }
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!(await columnExists('PracticeSessions', 'scope_semester'))) {
    await db.query(
      'ALTER TABLE PracticeSessions ADD COLUMN scope_semester TINYINT NULL AFTER chapter_id'
    );
  }

  const checks = await getSessionModeChecks();
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const check of checks) {
    await dropCheckConstraint(check.constraint_name);
  }

  await db.query(
    `UPDATE PracticeSessions
     SET session_mode = 'COMPREHENSIVE'
     WHERE session_mode = 'EXAM'`
  );

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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
