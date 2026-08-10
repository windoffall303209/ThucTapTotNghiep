// Migration 20260807 remove unapproved question supplements cập nhật cấu trúc hoặc dữ liệu cơ sở dữ liệu theo cách có thể kiểm tra và lặp lại.
/* eslint-disable no-console */
require('dotenv').config({ quiet: true });

const db = require('../config/db');

const APPLY_FLAG = '--apply';
const CONFIRM_PREFIX = '--confirm-db=';
const SOURCE_PATTERN = 'SUP-20260807-%';

// Hàm parseArguments dùng để phân tích đầu vào thành cấu trúc có thể sử dụng; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function parseArguments(argv) {
  const unknown = argv.filter((value) => value !== APPLY_FLAG && !value.startsWith(CONFIRM_PREFIX));
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (unknown.length) throw new Error(`Tham số không hợp lệ: ${unknown.join(', ')}`);
  return {
    apply: argv.includes(APPLY_FLAG),
    confirmDatabase: argv.find((value) => value.startsWith(CONFIRM_PREFIX))?.slice(CONFIRM_PREFIX.length) || ''
  };
}

// Hàm execute dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function execute(executor, sql, params = []) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (executor === db) return db.query(sql, params);
  const [rows] = await executor.execute(sql, params);
  return rows;
}

// Hàm countAffected dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function countAffected(executor = db) {
  const rows = await execute(executor,
    `WITH supplemental AS (
       SELECT id
       FROM QuestionBank
       WHERE JSON_UNQUOTE(JSON_EXTRACT(content, '$.source_key')) LIKE ?
     )
     SELECT
       (SELECT COUNT(*) FROM supplemental) AS questions,
       (SELECT COUNT(*) FROM CommonMisconceptions m JOIN supplemental s ON s.id = m.question_id) AS misconceptions,
       (SELECT COUNT(*) FROM PracticeSessionQuestions p JOIN supplemental s ON s.id = p.question_id) AS session_questions,
       (SELECT COUNT(*) FROM StudentLogs l JOIN supplemental s ON s.id = l.question_id) AS student_logs,
       (SELECT COUNT(*) FROM PracticeSessionChats c JOIN supplemental s ON s.id = c.question_id) AS chats,
       (SELECT COUNT(*) FROM AIConversationLogs a JOIN supplemental s ON s.id = a.question_id) AS ai_logs`,
    [SOURCE_PATTERN]
  );
  return Object.fromEntries(Object.entries(rows[0]).map(([key, value]) => [key, Number(value)]));
}

// Hàm hasUsage dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function hasUsage(counts) {
  return counts.session_questions > 0 || counts.student_logs > 0 || counts.chats > 0 || counts.ai_logs > 0;
}

// Hàm main dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function main() {
  const options = parseArguments(process.argv.slice(2));
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  try {
    const connectionState = await db.testConnection();
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!connectionState.connected) throw new Error(`Không kết nối được database: ${connectionState.reason}`);
    const [databaseRow] = await db.query('SELECT DATABASE() AS database_name');
    const databaseName = String(databaseRow.database_name || '');
    const before = await countAffected(db);

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!options.apply) {
      console.log(JSON.stringify({ readOnly: true, database: databaseName, sourcePattern: SOURCE_PATTERN, affected: before }, null, 2));
      return;
    }
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!databaseName || options.confirmDatabase !== databaseName) {
      throw new Error(`Để xóa dữ liệu, cần truyền ${CONFIRM_PREFIX}${databaseName}`);
    }
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (hasUsage(before)) {
      throw new Error('Lô câu hỏi đã phát sinh dữ liệu học tập; từ chối xóa tự động để bảo vệ lịch sử học sinh.');
    }

    const result = await db.transaction(async (connection) => {
      const locked = await execute(
        connection,
        `SELECT id
         FROM QuestionBank
         WHERE JSON_UNQUOTE(JSON_EXTRACT(content, '$.source_key')) LIKE ?
         FOR UPDATE`,
        [SOURCE_PATTERN]
      );
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (locked.length !== before.questions) throw new Error('Số câu thay đổi trong lúc khóa dữ liệu; đã hủy thao tác.');
      const [deletion] = await connection.execute(
        `DELETE FROM QuestionBank
         WHERE JSON_UNQUOTE(JSON_EXTRACT(content, '$.source_key')) LIKE ?`,
        [SOURCE_PATTERN]
      );
      const after = await countAffected(connection);
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (after.questions !== 0 || after.misconceptions !== 0) {
        throw new Error('Vẫn còn dữ liệu bổ sung sau khi xóa; đã rollback transaction.');
      }
      return { deletedQuestions: Number(deletion.affectedRows), after };
    });
    console.log(JSON.stringify({ readOnly: false, database: databaseName, before, ...result }, null, 2));
  } finally {
    await db.close();
  }
}

// Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { SOURCE_PATTERN, countAffected, hasUsage, parseArguments };
