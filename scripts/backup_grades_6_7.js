// Script backup grades 6 7 hỗ trợ nhập, xuất, kiểm tra hoặc bảo trì dữ liệu và cấu hình của dự án.
/**
 * Sao lưu toàn bộ dữ liệu khối 6 và 7 ra một file .sql trước khi xóa.
 *
 * Hệ thống chỉ hỗ trợ lớp 1 đến 5 (config/grades.js) nên dữ liệu hai khối này
 * không truy cập được từ giao diện. Script tạo bản sao lưu để vẫn nạp lại được
 * nếu sau này mở rộng phạm vi khối lớp.
 *
 * Dùng: node scripts/backup_grades_6_7.js [duong_dan_file_dich]
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const db = require('../config/db');

const GRADES = [6, 7];

// Hàm quote dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function quote(value) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (value === null || value === undefined) return 'NULL';
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (typeof value === 'number') return String(value);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (value instanceof Date) return `'${value.toISOString().slice(0, 19).replace('T', ' ')}'`;

  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const escaped = text
    .split('\\').join('\\\\')
    .split("'").join("\\'")
    .split('\n').join('\\n')
    .split('\r').join('\\r');
  return `'${escaped}'`;
}

// Hàm insertStatement dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function insertStatement(table, columns, row) {
  const values = columns.map((column) => quote(row[column])).join(', ');
  return `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${values});`;
}

// Hàm main dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function main() {
  const target = process.argv[2] || path.join(__dirname, '..', 'backup_lop6_7.sql');
  const gradeList = GRADES.join(', ');

  const chapters = await db.query(
    `SELECT * FROM Chapters WHERE grade IN (${gradeList}) ORDER BY id`
  );
  const lessons = await db.query(
    `SELECT l.* FROM Lessons l
     JOIN Chapters ch ON ch.id = l.chapter_id
     WHERE ch.grade IN (${gradeList}) ORDER BY l.id`
  );
  const questions = await db.query(
    `SELECT q.* FROM QuestionBank q
     JOIN Lessons l ON l.id = q.lesson_id
     JOIN Chapters ch ON ch.id = l.chapter_id
     WHERE ch.grade IN (${gradeList}) ORDER BY q.id`
  );
  const misconceptions = await db.query(
    `SELECT cm.* FROM CommonMisconceptions cm
     JOIN QuestionBank q ON q.id = cm.question_id
     JOIN Lessons l ON l.id = q.lesson_id
     JOIN Chapters ch ON ch.id = l.chapter_id
     WHERE ch.grade IN (${gradeList}) ORDER BY cm.id`
  );
  const logs = await db.query(
    `SELECT sl.* FROM StudentLogs sl
     JOIN QuestionBank q ON q.id = sl.question_id
     JOIN Lessons l ON l.id = q.lesson_id
     JOIN Chapters ch ON ch.id = l.chapter_id
     WHERE ch.grade IN (${gradeList}) ORDER BY sl.id`
  );

  const lines = [
    `-- Sao lưu dữ liệu khối ${gradeList}`,
    '-- Tạo bởi scripts/backup_grades_6_7.js',
    '-- Nạp lại: mysql -u <user> -p <database> < file_nay.sql',
    '',
    'SET FOREIGN_KEY_CHECKS = 0;',
    ''
  ];

  // Hàm push dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  const push = (title, table, columns, rows) => {
    lines.push(`-- ${title}: ${rows.length} bản ghi`);
    rows.forEach((row) => lines.push(insertStatement(table, columns, row)));
    lines.push('');
  };

  push('Chương', 'Chapters', ['id', 'grade', 'semester', 'chapter_name', 'sort_order'], chapters);
  push('Bài học', 'Lessons', ['id', 'chapter_id', 'lesson_name', 'theory_cards', 'sort_order'], lessons);
  push(
    'Câu hỏi',
    'QuestionBank',
    [
      'id', 'lesson_id', 'concept_id', 'question_type', 'difficulty',
      'layout_template', 'content', 'choices', 'correct_answer', 'explanation'
    ],
    questions
  );
  push(
    'Lỗi sai thường gặp',
    'CommonMisconceptions',
    ['id', 'question_id', 'distractor_key', 'misconception_name', 'explanation'],
    misconceptions
  );
  push(
    'Lịch sử làm bài',
    'StudentLogs',
    [
      'id', 'student_id', 'practice_session_id', 'question_id', 'selected_answer',
      'is_correct', 'detected_misconception_id', 'time_spent_seconds'
    ],
    logs
  );

  lines.push('SET FOREIGN_KEY_CHECKS = 1;');

  fs.writeFileSync(target, lines.join('\n'), 'utf8');

  const sizeMb = (fs.statSync(target).size / 1024 / 1024).toFixed(2);
  console.log(`Đã ghi ${target} (${sizeMb} MB)`);
  console.log(`  Chapters: ${chapters.length}`);
  console.log(`  Lessons: ${lessons.length}`);
  console.log(`  QuestionBank: ${questions.length}`);
  console.log(`  CommonMisconceptions: ${misconceptions.length}`);
  console.log(`  StudentLogs: ${logs.length}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Sao lưu thất bại:', error.message);
    process.exit(1);
  });
