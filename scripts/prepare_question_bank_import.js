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

function payloadFromLine(line) {
  return JSON.parse(Buffer.from(line.slice(9).trim(), 'base64').toString('utf8'));
}

function explanationText(explanation) {
  if (typeof explanation === 'string') return explanation.trim();
  return String(explanation?.text || explanation?.body || '').trim();
}

async function inspectBank(bank, writeLayout) {
  const filePath = path.join(ROOT, 'data', bank.file);
  const original = await fs.readFile(filePath, 'utf8');
  const lines = original.split(/\r?\n/);
  const payloads = [];
  let changedLayouts = 0;

  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].startsWith('% DBJSON ')) continue;
    const payload = payloadFromLine(lines[index]);
    payloads.push(payload);
    if (writeLayout && payload.layout_template !== 'STACK_VERTICAL') {
      payload.layout_template = 'STACK_VERTICAL';
      lines[index] = `% DBJSON ${Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')}`;
      changedLayouts += 1;
    }
  }

  const errors = [];
  const ids = new Set();
  for (const payload of payloads) {
    if (payload.grade !== bank.grade) errors.push(`${payload.external_id}: sai lớp`);
    if (!Number.isInteger(payload.lesson_number) || payload.lesson_number < 1) {
      errors.push(`${payload.external_id}: lesson_number không hợp lệ`);
    }
    if (!payload.content?.text?.trim()) errors.push(`${payload.external_id}: thiếu đề bài`);
    if (!Array.isArray(payload.choices) || payload.choices.length < 2) {
      errors.push(`${payload.external_id}: thiếu phương án`);
    } else if (!payload.choices.some((choice) => choice.key === payload.correct_answer)) {
      errors.push(`${payload.external_id}: đáp án đúng không thuộc danh sách phương án`);
    }
    if (!explanationText(payload.explanation)) errors.push(`${payload.external_id}: thiếu lời giải`);
    if (ids.has(payload.external_id)) errors.push(`${payload.external_id}: trùng mã câu hỏi`);
    ids.add(payload.external_id);
    for (const image of payload.content?.images || []) {
      if (image.source_path) {
        try {
          await fs.access(image.source_path);
        } catch {
          errors.push(`${payload.external_id}: thiếu ảnh nguồn ${image.source_path}`);
        }
      }
    }
  }

  if (writeLayout && changedLayouts) {
    const newline = original.includes('\r\n') ? '\r\n' : '\n';
    await fs.writeFile(filePath, lines.join(newline), 'utf8');
  }

  const countsByLesson = new Map();
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

async function main() {
  const writeLayout = process.argv.includes('--write-layout');
  const makeBackup = process.argv.includes('--backup');
  const reports = [];
  for (const bank of BANKS) reports.push(await inspectBank(bank, writeLayout));

  const errors = reports.flatMap((report) => report.errors);
  console.log(JSON.stringify({
    total_questions: reports.reduce((sum, report) => sum + report.question_count, 0),
    total_images: reports.reduce((sum, report) => sum + report.image_count, 0),
    changed_layouts: reports.reduce((sum, report) => sum + report.changed_layouts, 0),
    banks: reports.map(({ lessons, errors: bankErrors, ...summary }) => ({ ...summary, error_count: bankErrors.length })),
    error_count: errors.length
  }, null, 2));
  if (errors.length) throw new Error(`Phát hiện ${errors.length} lỗi:\n${errors.slice(0, 30).join('\n')}`);

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
    if (typeof db.close === 'function') await db.close().catch(() => {});
  });
