// Script prepare question bank import hỗ trợ nhập, xuất, kiểm tra hoặc bảo trì dữ liệu và cấu hình của dự án.
require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const db = require('../config/db');

const ROOT = path.join(__dirname, '..');
const BANKS = [
  { grade: 1, file: 'grade1_question_bank_reviewed.tex' },
  { grade: 2, file: 'grade2_question_bank.tex' },
  { grade: 3, file: 'grade3_question_bank.tex' },
  { grade: 4, file: 'grade4_question_bank.tex' },
  { grade: 5, file: 'grade5_question_bank.tex' }
];

// Hàm payloadFromLine dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function payloadFromLine(line) {
  return JSON.parse(Buffer.from(line.slice(9).trim(), 'base64').toString('utf8'));
}

// Hàm explanationText dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function explanationText(explanation) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (typeof explanation === 'string') return explanation.trim();
  return String(explanation?.text || explanation?.body || '').trim();
}

// Hàm inspectBank dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function inspectBank(bank, writeLayout) {
  const filePath = path.join(ROOT, 'data', bank.file);
  const original = await fs.readFile(filePath, 'utf8');
  const lines = original.split(/\r?\n/);
  const payloads = [];
  let changedLayouts = 0;

  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (let index = 0; index < lines.length; index += 1) {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!lines[index].startsWith('% DBJSON ')) continue;
    const payload = payloadFromLine(lines[index]);
    payloads.push(payload);
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (writeLayout && payload.layout_template !== 'STACK_VERTICAL') {
      payload.layout_template = 'STACK_VERTICAL';
      lines[index] = `% DBJSON ${Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')}`;
      changedLayouts += 1;
    }
  }

  const errors = [];
  const ids = new Set();
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const payload of payloads) {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (payload.grade !== bank.grade) errors.push(`${payload.external_id}: sai lớp`);
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!Number.isInteger(payload.lesson_number) || payload.lesson_number < 1) {
      errors.push(`${payload.external_id}: lesson_number không hợp lệ`);
    }
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!payload.content?.text?.trim()) errors.push(`${payload.external_id}: thiếu đề bài`);
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!Array.isArray(payload.choices) || payload.choices.length < 2) {
      errors.push(`${payload.external_id}: thiếu phương án`);
    } else if (!payload.choices.some((choice) => choice.key === payload.correct_answer)) {
      errors.push(`${payload.external_id}: đáp án đúng không thuộc danh sách phương án`);
    }
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!explanationText(payload.explanation)) errors.push(`${payload.external_id}: thiếu lời giải`);
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (ids.has(payload.external_id)) errors.push(`${payload.external_id}: trùng mã câu hỏi`);
    ids.add(payload.external_id);
    // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
    for (const image of payload.content?.images || []) {
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (image.source_path) {
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        try {
          await fs.access(image.source_path);
        } catch {
          errors.push(`${payload.external_id}: thiếu ảnh nguồn ${image.source_path}`);
        }
      }
    }
  }

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (writeLayout && changedLayouts) {
    const newline = original.includes('\r\n') ? '\r\n' : '\n';
    await fs.writeFile(filePath, lines.join(newline), 'utf8');
  }

  const countsByLesson = new Map();
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const payload of payloads) {
    const current = countsByLesson.get(payload.lesson_number) || {
      lesson_number: payload.lesson_number,
      lesson_title: payload.lesson_title,
      question_count: 0
    };
    current.question_count += 1;
    countsByLesson.set(payload.lesson_number, current);
  }

  return {
    grade: bank.grade,
    file: bank.file,
    question_count: payloads.length,
    lesson_count: countsByLesson.size,
    image_count: payloads.reduce((sum, payload) => sum + (payload.content?.images?.length || 0), 0),
    changed_layouts: changedLayouts,
    errors,
    lessons: [...countsByLesson.values()].sort((a, b) => a.lesson_number - b.lesson_number)
  };
}

// Hàm backupQuestionData dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function backupQuestionData() {
  const rows = await db.query(
    `SELECT q.*, c.grade
       FROM QuestionBank q
       JOIN Lessons l ON l.id = q.lesson_id
       JOIN Chapters c ON c.id = l.chapter_id
      WHERE c.grade BETWEEN 1 AND 5
      ORDER BY q.id`
  );
  const misconceptions = await db.query(
    `SELECT m.*
       FROM CommonMisconceptions m
       JOIN QuestionBank q ON q.id = m.question_id
       JOIN Lessons l ON l.id = q.lesson_id
       JOIN Chapters c ON c.id = l.chapter_id
      WHERE c.grade BETWEEN 1 AND 5
      ORDER BY m.id`
  );
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDir = path.join(ROOT, 'output', 'backups');
  const outputPath = path.join(outputDir, `question-bank-grades-1-5-${stamp}.json`);
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify({ created_at: new Date().toISOString(), rows, misconceptions }, null, 2));
  return { outputPath, question_count: rows.length, misconception_count: misconceptions.length };
}

// Hàm main dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function main() {
  const writeLayout = process.argv.includes('--write-layout');
  const makeBackup = process.argv.includes('--backup');
  const reports = [];
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const bank of BANKS) reports.push(await inspectBank(bank, writeLayout));

  const errors = reports.flatMap((report) => report.errors);
  console.log(JSON.stringify({
    total_questions: reports.reduce((sum, report) => sum + report.question_count, 0),
    total_images: reports.reduce((sum, report) => sum + report.image_count, 0),
    changed_layouts: reports.reduce((sum, report) => sum + report.changed_layouts, 0),
    banks: reports.map(({ lessons, errors: bankErrors, ...summary }) => ({ ...summary, error_count: bankErrors.length })),
    error_count: errors.length
  }, null, 2));
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (errors.length) throw new Error(`Phát hiện ${errors.length} lỗi:\n${errors.slice(0, 30).join('\n')}`);

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (makeBackup) {
    const backup = await backupQuestionData();
    console.log(`Đã sao lưu ${backup.question_count} câu và ${backup.misconception_count} lỗi thường gặp vào ${backup.outputPath}`);
  }
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
