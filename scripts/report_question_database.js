// Script report question database hỗ trợ nhập, xuất, kiểm tra hoặc bảo trì dữ liệu và cấu hình của dự án.
require('dotenv').config();

const db = require('../config/db');
const { MIN_GRADE, MAX_GRADE } = require('../config/grades');

// Hàm main dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function main() {
  const connection = await db.testConnection();
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!connection.connected) {
    throw new Error(`Không kết nối được MySQL: ${connection.reason || 'missing_config'}`);
  }

  const rows = await db.query(
    `SELECT
        c.grade,
        COUNT(DISTINCT c.id) AS chapter_count,
        COUNT(DISTINCT l.id) AS lesson_count,
        COUNT(DISTINCT CASE WHEN q.id IS NOT NULL THEN l.id END) AS lessons_with_questions,
        COUNT(q.id) AS question_count,
        MIN(per_lesson.question_count) AS min_questions_per_lesson,
        MAX(per_lesson.question_count) AS max_questions_per_lesson
     FROM Chapters c
     JOIN Lessons l ON l.chapter_id = c.id
     LEFT JOIN QuestionBank q ON q.lesson_id = l.id
     LEFT JOIN (
       SELECT lesson_id, COUNT(*) AS question_count
       FROM QuestionBank
       GROUP BY lesson_id
     ) per_lesson ON per_lesson.lesson_id = l.id
     WHERE c.grade BETWEEN ? AND ?
     GROUP BY c.grade
     ORDER BY c.grade`,
    [MIN_GRADE, MAX_GRADE]
  );

  const report = rows.map((row) => ({
    grade: Number(row.grade),
    chapterCount: Number(row.chapter_count),
    lessonCount: Number(row.lesson_count),
    lessonsWithQuestions: Number(row.lessons_with_questions),
    questionCount: Number(row.question_count),
    minQuestionsPerLesson: Number(row.min_questions_per_lesson || 0),
    maxQuestionsPerLesson: Number(row.max_questions_per_lesson || 0)
  }));
  const missingLessons = await db.query(
    `SELECT
        c.grade,
        c.chapter_name,
        l.id AS lesson_id,
        l.lesson_name
     FROM Lessons l
     JOIN Chapters c ON c.id = l.chapter_id
     LEFT JOIN QuestionBank q ON q.lesson_id = l.id
     WHERE c.grade BETWEEN ? AND ?
     GROUP BY c.grade, c.chapter_name, l.id, l.lesson_name, c.sort_order, l.sort_order
     HAVING COUNT(q.id) = 0
     ORDER BY c.grade, c.sort_order, l.sort_order, l.id`,
    [MIN_GRADE, MAX_GRADE]
  );
  const total = report.reduce((sum, row) => sum + row.questionCount, 0);

  console.log(JSON.stringify({
    grades: report,
    totalQuestions: total,
    lessonsWithoutQuestions: missingLessons
  }, null, 2));
}

main()
  .then(() => db.close())
  .catch(async (error) => {
    console.error('Lỗi thống kê ngân hàng câu hỏi trong DB:', error.message);
    await db.close();
    process.exitCode = 1;
  });
