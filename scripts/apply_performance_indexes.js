require('dotenv').config();

const db = require('../config/db');

const INDEXES = [
  {
    table: 'Chapters',
    name: 'idx_chapters_grade_sort',
    sql: 'CREATE INDEX idx_chapters_grade_sort ON Chapters(grade, sort_order, id)'
  },
  {
    table: 'Lessons',
    name: 'idx_lessons_chapter_sort',
    sql: 'CREATE INDEX idx_lessons_chapter_sort ON Lessons(chapter_id, sort_order, id)'
  },
  {
    table: 'QuestionBank',
    name: 'idx_questions_lesson_difficulty_id',
    sql: 'CREATE INDEX idx_questions_lesson_difficulty_id ON QuestionBank(lesson_id, difficulty, id)'
  },
  {
    table: 'StudentLogs',
    name: 'idx_logs_session_created',
    sql: 'CREATE INDEX idx_logs_session_created ON StudentLogs(practice_session_id, created_at, id)'
  },
  {
    table: 'StudentLogs',
    name: 'idx_logs_student_created',
    sql: 'CREATE INDEX idx_logs_student_created ON StudentLogs(student_id, created_at, id)'
  },
  {
    table: 'StudentLogs',
    name: 'idx_logs_student_correct_question',
    sql: 'CREATE INDEX idx_logs_student_correct_question ON StudentLogs(student_id, is_correct, question_id)'
  },
  {
    table: 'PracticeSessions',
    name: 'idx_practice_sessions_student_started',
    sql: 'CREATE INDEX idx_practice_sessions_student_started ON PracticeSessions(student_id, started_at, id)'
  },
  {
    table: 'PracticeSessions',
    name: 'idx_practice_sessions_student_status_started',
    sql: 'CREATE INDEX idx_practice_sessions_student_status_started ON PracticeSessions(student_id, status, started_at, id)'
  },
  {
    table: 'PracticeSessionChats',
    name: 'idx_practice_chats_session_role',
    sql: 'CREATE INDEX idx_practice_chats_session_role ON PracticeSessionChats(practice_session_id, role, created_at, id)'
  }
];

async function indexExists(table, name) {
  const rows = await db.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND INDEX_NAME = ?`,
    [table, name]
  );
  return Number(rows[0]?.count || 0) > 0;
}

async function main() {
  const connection = await db.testConnection();
  if (!connection.connected) {
    throw new Error(`Không kết nối được MySQL: ${connection.reason || 'missing_config'}`);
  }

  const report = [];
  for (const index of INDEXES) {
    if (await indexExists(index.table, index.name)) {
      report.push({ ...index, status: 'exists' });
      continue;
    }

    await db.query(index.sql);
    report.push({ ...index, status: 'created' });
  }

  console.log(JSON.stringify(report.map(({ table, name, status }) => ({ table, name, status })), null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Lỗi áp index tối ưu:', error.message);
    process.exit(1);
  });
