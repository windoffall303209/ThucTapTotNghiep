// Script report practice session h? tr? nh?p, xu?t, ki?m tra ho?c b?o tr? d? li?u v? c?u h?nh c?a d? ?n.
require('dotenv').config();

const db = require('../config/db');
const { parseJsonField } = require('../utils/json');

// H?m main d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function main() {
  const sessionId = Number(process.argv[2]);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    throw new Error('Cách dùng: node scripts/report_practice_session.js <session_id>');
  }

  const connection = await db.testConnection();
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
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
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
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
