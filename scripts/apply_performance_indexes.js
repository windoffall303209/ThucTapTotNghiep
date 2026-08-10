// Script apply performance indexes h? tr? nh?p, xu?t, ki?m tra ho?c b?o tr? d? li?u v? c?u h?nh c?a d? ?n.
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

// H?m indexExists d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
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

// H?m main d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function main() {
  const connection = await db.testConnection();
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!connection.connected) {
    throw new Error(`Không kết nối được MySQL: ${connection.reason || 'missing_config'}`);
  }

  const report = [];
  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const index of INDEXES) {
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
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
