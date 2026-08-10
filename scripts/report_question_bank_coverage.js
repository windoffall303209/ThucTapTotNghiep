// Script report question bank coverage h? tr? nh?p, xu?t, ki?m tra ho?c b?o tr? d? li?u v? c?u h?nh c?a d? ?n.
require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const db = require('../config/db');

const ROOT = path.join(__dirname, '..');
const JSON_OUTPUT = path.join(ROOT, 'data', 'question_bank_coverage_report.json');
const MD_OUTPUT = path.join(ROOT, 'data', 'question_bank_coverage_report.md');

// H?m main d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
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
  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
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
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!shortages.length) {
    markdown.push('Không có. Tất cả bài học đều có ít nhất 20 câu.');
  } else {
    let currentGrade = null;
    // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
    for (const item of shortages) {
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
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
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (typeof db.close === 'function') await db.close().catch(() => {});
  });
