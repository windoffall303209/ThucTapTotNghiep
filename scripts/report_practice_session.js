// Script report practice session hỗ trợ nhập, xuất, kiểm tra hoặc bảo trì dữ liệu và cấu hình của dự án.
require('dotenv').config();

const db = require('../config/db');
const { parseJsonField } = require('../utils/json');

// Hàm main dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function main() {
  const sessionId = Number(process.argv[2]);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    throw new Error('Cách dùng: node scripts/report_practice_session.js <session_id>');
  }

  const connection = await db.testConnection();
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!connection.connected) {
    throw new Error(`Không kết nối được MySQL: ${connection.reason || 'missing_config'}`);
  }

  const sessions = await db.query(
    `SELECT id, session_mode, title, question_ids, question_count
     FROM PracticeSessions
     WHERE id = ?
     LIMIT 1`,
    [sessionId]
  );
  const session = sessions[0];
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!session) {
    throw new Error(`Không tìm thấy phiên ${sessionId}.`);
  }

  const questionIds = parseJsonField(session.question_ids, [])
    .map(Number)
    .filter(Boolean);
  const placeholders = questionIds.map(() => '?').join(',');
  const distribution = questionIds.length > 0
    ? await db.query(
      `SELECT
          c.id AS chapter_id,
          c.chapter_name,
          l.id AS lesson_id,
          l.lesson_name,
          COUNT(*) AS question_count
       FROM QuestionBank q
       JOIN Lessons l ON l.id = q.lesson_id
       JOIN Chapters c ON c.id = l.chapter_id
       WHERE q.id IN (${placeholders})
       GROUP BY c.id, c.chapter_name, l.id, l.lesson_name, c.sort_order, l.sort_order
       ORDER BY c.sort_order, l.sort_order, l.id`,
      questionIds
    )
    : [];

  const counts = distribution.map((row) => Number(row.question_count));
  const report = {
    sessionId: Number(session.id),
    mode: session.session_mode,
    title: session.title,
    storedQuestionCount: Number(session.question_count),
    questionIds: questionIds.length,
    uniqueQuestionIds: new Set(questionIds).size,
    coveredChapters: new Set(distribution.map((row) => row.chapter_id)).size,
    coveredLessons: distribution.length,
    minQuestionsPerLesson: counts.length ? Math.min(...counts) : 0,
    maxQuestionsPerLesson: counts.length ? Math.max(...counts) : 0,
    distribution: distribution.map((row) => ({
      chapter: row.chapter_name,
      lesson: row.lesson_name,
      questionCount: Number(row.question_count)
    }))
  };

  console.log(JSON.stringify(report, null, 2));
}

main()
  .then(() => db.close())
  .catch(async (error) => {
    console.error('Lỗi kiểm tra phiên luyện tập:', error.message);
    await db.close();
    process.exitCode = 1;
  });
