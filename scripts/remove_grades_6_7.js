/**
 * Xóa dữ liệu chương trình khối 6 và 7 khỏi cơ sở dữ liệu.
 *
 * Lý do: config/grades.js giới hạn hệ thống ở lớp 1 đến 5. Toàn bộ chương, bài
 * học và câu hỏi của khối 6, 7 không có đường nào truy cập từ giao diện, chỉ làm
 * phình dữ liệu và gây nhầm khi thống kê.
 *
 * Xóa Chapters là đủ: khóa ngoại khai báo ON DELETE CASCADE nên MySQL tự dọn
 * Lessons, rồi QuestionBank, rồi CommonMisconceptions và StudentLogs theo sau.
 * PracticeSessions dùng ON DELETE SET NULL nên phiên luyện tập không bị xóa mà
 * chỉ mất lesson_id/chapter_id; script dọn riêng các phiên trở thành vô nghĩa.
 *
 * Dùng:
 *   node scripts/remove_grades_6_7.js            -> chỉ xem trước, không thay đổi
 *   node scripts/remove_grades_6_7.js --commit   -> thực hiện xóa
 *
 * Sao lưu trước bằng: node scripts/backup_grades_6_7.js backup_lop6_7.sql
 */
require('dotenv').config();

const db = require('../config/db');

const GRADES = [6, 7];
const COMMIT = process.argv.includes('--commit');

async function count(sql, params = []) {
  const rows = await db.query(sql, params);
  return Number(rows[0]?.total || 0);
}

async function thongKe() {
  const gradeList = GRADES.join(', ');
  return {
    chapters: await count(`SELECT COUNT(*) AS total FROM Chapters WHERE grade IN (${gradeList})`),
    lessons: await count(
      `SELECT COUNT(*) AS total FROM Lessons l
       JOIN Chapters ch ON ch.id = l.chapter_id
       WHERE ch.grade IN (${gradeList})`
    ),
    questions: await count(
      `SELECT COUNT(*) AS total FROM QuestionBank q
       JOIN Lessons l ON l.id = q.lesson_id
       JOIN Chapters ch ON ch.id = l.chapter_id
       WHERE ch.grade IN (${gradeList})`
    ),
    logs: await count(
      `SELECT COUNT(*) AS total FROM StudentLogs sl
       JOIN QuestionBank q ON q.id = sl.question_id
       JOIN Lessons l ON l.id = q.lesson_id
       JOIN Chapters ch ON ch.id = l.chapter_id
       WHERE ch.grade IN (${gradeList})`
    )
  };
}

// Phiên luyện tập không còn câu hỏi nào tồn tại thì mở ra chỉ thấy trang trống,
// nên dọn luôn cùng lượt này.
async function timPhienRong() {
  const rows = await db.query(
    `SELECT ps.id, ps.student_id, ps.title, ps.question_ids
     FROM PracticeSessions ps`
  );

  const rong = [];
  for (const row of rows) {
    const ids = typeof row.question_ids === 'string'
      ? JSON.parse(row.question_ids || '[]')
      : (row.question_ids || []);

    if (!Array.isArray(ids) || ids.length === 0) {
      rong.push({ ...row, conLai: 0, tong: 0 });
      continue;
    }

    const conLai = await count(
      `SELECT COUNT(*) AS total FROM QuestionBank WHERE id IN (${ids.map(() => '?').join(',')})`,
      ids
    );
    if (conLai === 0) rong.push({ ...row, conLai, tong: ids.length });
  }
  return rong;
}

async function main() {
  const truoc = await thongKe();
  console.log(`Dữ liệu khối ${GRADES.join(' và ')} hiện có:`);
  console.log(`  Chapters:     ${truoc.chapters}`);
  console.log(`  Lessons:      ${truoc.lessons}`);
  console.log(`  QuestionBank: ${truoc.questions}`);
  console.log(`  StudentLogs bị kéo theo (CASCADE): ${truoc.logs}`);

  if (truoc.chapters === 0) {
    console.log('\nKhông còn gì để xóa.');
    return;
  }

  if (!COMMIT) {
    console.log('\nĐây là bản xem trước. Thêm --commit để thực hiện xóa.');
    return;
  }

  const result = await db.query(
    `DELETE FROM Chapters WHERE grade IN (${GRADES.join(', ')})`
  );
  console.log(`\nĐã xóa ${result.affectedRows} chương (CASCADE dọn phần còn lại).`);

  const sau = await thongKe();
  console.log('Còn lại sau khi xóa:');
  console.log(`  Chapters: ${sau.chapters} | Lessons: ${sau.lessons} | QuestionBank: ${sau.questions}`);

  const phienRong = await timPhienRong();
  if (phienRong.length === 0) {
    console.log('\nKhông có phiên luyện tập nào bị rỗng câu hỏi.');
    return;
  }

  const ids = phienRong.map((item) => item.id);
  console.log(`\nPhát hiện ${ids.length} phiên luyện tập không còn câu hỏi nào tồn tại:`);
  phienRong.forEach((item) => {
    console.log(`  phiên ${item.id} (học sinh ${item.student_id}): ${item.tong} câu, còn ${item.conLai}`);
  });

  await db.query(`DELETE FROM StudentLogs WHERE practice_session_id IN (${ids.join(',')})`);
  const xoaPhien = await db.query(`DELETE FROM PracticeSessions WHERE id IN (${ids.join(',')})`);
  console.log(`Đã dọn ${xoaPhien.affectedRows} phiên rỗng.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Thất bại:', error.message);
    process.exit(1);
  });
