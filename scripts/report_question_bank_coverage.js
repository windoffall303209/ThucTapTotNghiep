// Script report question bank coverage hỗ trợ nhập, xuất, kiểm tra hoặc bảo trì dữ liệu và cấu hình của dự án.
require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const db = require('../config/db');

const ROOT = path.join(__dirname, '..');
const JSON_OUTPUT = path.join(ROOT, 'data', 'question_bank_coverage_report.json');
const MD_OUTPUT = path.join(ROOT, 'data', 'question_bank_coverage_report.md');

// Hàm main dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function main() {
  const rows = await db.query(
    `SELECT c.grade,
            c.sort_order AS chapter_order,
            c.chapter_name,
            l.id AS lesson_id,
            l.sort_order AS lesson_order,
            l.lesson_name,
            COUNT(q.id) AS question_count
       FROM Chapters c
       JOIN Lessons l ON l.chapter_id = c.id
       LEFT JOIN QuestionBank q ON q.lesson_id = l.id
      WHERE c.grade BETWEEN 1 AND 5
      GROUP BY c.grade, c.sort_order, c.chapter_name, l.id, l.sort_order, l.lesson_name
      ORDER BY c.grade, c.sort_order, l.sort_order, l.id`
  );

  const normalized = rows.map((row) => ({
    grade: Number(row.grade),
    chapter_order: Number(row.chapter_order),
    chapter_name: row.chapter_name,
    lesson_id: Number(row.lesson_id),
    lesson_order: Number(row.lesson_order),
    lesson_name: row.lesson_name,
    question_count: Number(row.question_count)
  }));
  const shortages = normalized.filter((row) => row.question_count < 20);
  const summary = [];
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (let grade = 1; grade <= 5; grade += 1) {
    const gradeRows = normalized.filter((row) => row.grade === grade);
    summary.push({
      grade,
      lesson_count: gradeRows.length,
      question_count: gradeRows.reduce((sum, row) => sum + row.question_count, 0),
      zero_question_lessons: gradeRows.filter((row) => row.question_count === 0).length,
      under_20_lessons: gradeRows.filter((row) => row.question_count < 20).length
    });
  }

  const report = {
    generated_at: new Date().toISOString(),
    minimum_questions_per_lesson: 20,
    summary,
    shortage_count: shortages.length,
    shortages
  };
  await fs.writeFile(JSON_OUTPUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const markdown = [
    '# Báo cáo độ phủ ngân hàng câu hỏi lớp 1–5',
    '',
    `Thời điểm tạo: ${report.generated_at}`,
    '',
    'Ngưỡng yêu cầu: ít nhất 20 câu cho mỗi bài học.',
    '',
    '| Lớp | Số bài | Số câu | Bài 0 câu | Bài dưới 20 câu |',
    '| ---: | ---: | ---: | ---: | ---: |',
    ...summary.map((item) =>
      `| ${item.grade} | ${item.lesson_count} | ${item.question_count} | ${item.zero_question_lessons} | ${item.under_20_lessons} |`
    ),
    '',
    `## Các bài chưa đạt ngưỡng (${shortages.length} bài)`,
    ''
  ];
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!shortages.length) {
    markdown.push('Không có. Tất cả bài học đều có ít nhất 20 câu.');
  } else {
    let currentGrade = null;
    // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
    for (const item of shortages) {
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (currentGrade !== item.grade) {
        currentGrade = item.grade;
        markdown.push(`### Lớp ${currentGrade}`, '');
      }
      markdown.push(
        `- Chương ${item.chapter_order} — ${item.lesson_name}: **${item.question_count} câu** ` +
          `(lesson_id: ${item.lesson_id})`
      );
    }
  }
  markdown.push('');
  await fs.writeFile(MD_OUTPUT, markdown.join('\n'), 'utf8');

  console.log(JSON.stringify({ summary, shortage_count: shortages.length, json: JSON_OUTPUT, markdown: MD_OUTPUT }, null, 2));
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (typeof db.close === 'function') await db.close().catch(() => {});
  });
