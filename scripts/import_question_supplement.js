/* eslint-disable no-console */
require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');

const db = require('../config/db');

const ALLOWED_DIFFICIES = new Set(['EASY', 'MEDIUM', 'HARD', 'EXPERT']);
const ALLOWED_TYPES = new Set(['MULTIPLE_CHOICE', 'FILL_IN_THE_BLANK']);
const ALLOWED_LAYOUTS = new Set([
  'STACK_VERTICAL',
  'SPLIT_HORIZONTAL_LEFT_IMAGE',
  'SPLIT_HORIZONTAL_RIGHT_IMAGE',
  'IMAGE_IN_CHOICES'
]);

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function publicPathForUrl(imageUrl, rootDir = path.resolve(__dirname, '..')) {
  if (!nonEmpty(imageUrl) || !imageUrl.startsWith('/') || imageUrl.includes('..')) return null;
  const relativePath = imageUrl.replace(/^\/+/, '').split('/').join(path.sep);
  const resolved = path.resolve(rootDir, 'public', relativePath);
  const publicRoot = path.resolve(rootDir, 'public');
  return resolved.startsWith(`${publicRoot}${path.sep}`) ? resolved : null;
}

function validateQuestion(question, index, options = {}) {
  const errors = [];
  const label = `questions[${index}]`;
  const imageExists = options.imageExists || fs.existsSync;
  const rootDir = options.rootDir || path.resolve(__dirname, '..');

  if (!nonEmpty(question?.source_key)) errors.push(`${label}.source_key không hợp lệ`);
  if (!Number.isInteger(Number(question?.lesson_id)) || Number(question.lesson_id) <= 0) {
    errors.push(`${label}.lesson_id không hợp lệ`);
  }
  if (!ALLOWED_TYPES.has(question?.question_type)) errors.push(`${label}.question_type không hợp lệ`);
  if (!ALLOWED_DIFFICIES.has(question?.difficulty)) errors.push(`${label}.difficulty không hợp lệ`);
  if (!ALLOWED_LAYOUTS.has(question?.layout_template)) errors.push(`${label}.layout_template không hợp lệ`);
  if (!nonEmpty(question?.content?.text)) errors.push(`${label}.content.text không được để trống`);
  if (!nonEmpty(question?.correct_answer)) errors.push(`${label}.correct_answer không được để trống`);
  if (String(question?.correct_answer || '').length > 50) {
    errors.push(`${label}.correct_answer vượt quá giới hạn 50 ký tự của database`);
  }
  if (!nonEmpty(question?.explanation?.text)) errors.push(`${label}.explanation.text không được để trống`);

  const images = Array.isArray(question?.content?.images) ? question.content.images : [];
  for (const [imageIndex, image] of images.entries()) {
    const imagePath = publicPathForUrl(image?.url, rootDir);
    if (!imagePath) {
      errors.push(`${label}.content.images[${imageIndex}].url không an toàn`);
    } else if (!imageExists(imagePath)) {
      errors.push(`${label}.content.images[${imageIndex}] không tìm thấy tệp ${image.url}`);
    }
    if (!nonEmpty(image?.alt_text)) {
      errors.push(`${label}.content.images[${imageIndex}].alt_text không được để trống`);
    }
  }

  if (question?.question_type === 'MULTIPLE_CHOICE') {
    const choices = Array.isArray(question?.choices) ? question.choices : [];
    const keys = choices.map((choice) => String(choice?.key || '').trim().toUpperCase());
    if (choices.length !== 4 || new Set(keys).size !== 4 || keys.some((key) => !['A', 'B', 'C', 'D'].includes(key))) {
      errors.push(`${label}.choices phải có đủ bốn đáp án A, B, C, D`);
    }
    if (choices.some((choice) => !nonEmpty(choice?.text))) {
      errors.push(`${label}.choices có nội dung rỗng`);
    }
    if (!keys.includes(String(question?.correct_answer || '').trim().toUpperCase())) {
      errors.push(`${label}.correct_answer không khớp với choices`);
    }
  }

  const distractorKeys = new Set(
    (question?.misconceptions || []).map((item) => String(item?.distractor_key || '').toUpperCase())
  );
  if (distractorKeys.has(String(question?.correct_answer || '').toUpperCase())) {
    errors.push(`${label}.misconceptions không được gắn cho đáp án đúng`);
  }
  for (const [misconceptionIndex, misconception] of (question?.misconceptions || []).entries()) {
    if (!['A', 'B', 'C', 'D'].includes(String(misconception?.distractor_key || '').toUpperCase())) {
      errors.push(`${label}.misconceptions[${misconceptionIndex}].distractor_key không hợp lệ`);
    }
    if (!nonEmpty(misconception?.misconception_name) || !nonEmpty(misconception?.explanation)) {
      errors.push(`${label}.misconceptions[${misconceptionIndex}] thiếu tên hoặc lời giải thích`);
    }
  }

  return errors;
}

function validateBatch(batch, options = {}) {
  const errors = [];
  if (!nonEmpty(batch?.batch_id)) errors.push('batch_id không hợp lệ');
  if (!Array.isArray(batch?.questions) || batch.questions.length === 0) {
    errors.push('questions phải là một mảng không rỗng');
    return errors;
  }

  const keys = batch.questions.map((question) => question?.source_key).filter(Boolean);
  if (new Set(keys).size !== keys.length) errors.push('source_key bị trùng trong cùng lô dữ liệu');
  batch.questions.forEach((question, index) => errors.push(...validateQuestion(question, index, options)));
  return errors;
}

function parseArguments(argv) {
  const args = argv.slice(2);
  const file = args.find((arg) => !arg.startsWith('--'));
  const confirmation = args.find((arg) => arg.startsWith('--confirm-database='));
  return {
    file,
    apply: args.includes('--apply'),
    confirmedDatabase: confirmation?.slice('--confirm-database='.length) || ''
  };
}

async function existingSourceKeys(sourceKeys) {
  if (sourceKeys.length === 0) return new Set();
  const placeholders = sourceKeys.map(() => '?').join(', ');
  const rows = await db.query(
    `SELECT JSON_UNQUOTE(JSON_EXTRACT(content, '$.source_key')) AS source_key
     FROM QuestionBank
     WHERE JSON_UNQUOTE(JSON_EXTRACT(content, '$.source_key')) IN (${placeholders})`,
    sourceKeys
  );
  return new Set(rows.map((row) => row.source_key));
}

async function validateLessons(questions) {
  const lessonIds = [...new Set(questions.map((question) => Number(question.lesson_id)))];
  const placeholders = lessonIds.map(() => '?').join(', ');
  const rows = await db.query(`SELECT id FROM Lessons WHERE id IN (${placeholders})`, lessonIds);
  const existing = new Set(rows.map((row) => Number(row.id)));
  return lessonIds.filter((lessonId) => !existing.has(lessonId));
}

async function insertQuestions(questions) {
  return db.transaction(async (connection) => {
    const inserted = [];
    for (const question of questions) {
      const content = { ...question.content, source_key: question.source_key };
      const [result] = await connection.execute(
        `INSERT INTO QuestionBank
           (lesson_id, concept_id, question_type, difficulty, layout_template,
            content, choices, correct_answer, explanation, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          Number(question.lesson_id),
          question.concept_id ? Number(question.concept_id) : null,
          question.question_type,
          question.difficulty,
          question.layout_template,
          JSON.stringify(content),
          question.choices ? JSON.stringify(question.choices) : null,
          question.correct_answer,
          JSON.stringify(question.explanation)
        ]
      );

      for (const misconception of question.misconceptions || []) {
        await connection.execute(
          `INSERT INTO CommonMisconceptions
             (question_id, distractor_key, misconception_name, explanation)
           VALUES (?, ?, ?, ?)`,
          [
            result.insertId,
            String(misconception.distractor_key).toUpperCase(),
            misconception.misconception_name,
            misconception.explanation
          ]
        );
      }
      inserted.push({ sourceKey: question.source_key, questionId: result.insertId });
    }
    return inserted;
  });
}

async function runImport(options) {
  if (!options.file) throw new Error('Thiếu đường dẫn tệp JSON bổ sung');
  const absoluteFile = path.resolve(options.file);
  const batch = JSON.parse(fs.readFileSync(absoluteFile, 'utf8'));
  const errors = validateBatch(batch);
  if (errors.length > 0) throw new Error(`Dữ liệu không hợp lệ:\n- ${errors.join('\n- ')}`);

  const connection = await db.testConnection();
  if (!connection.connected) throw new Error(`Không kết nối được database: ${connection.reason}`);
  const missingLessonIds = await validateLessons(batch.questions);
  if (missingLessonIds.length > 0) throw new Error(`Không tìm thấy lesson_id: ${missingLessonIds.join(', ')}`);

  const sourceKeys = batch.questions.map((question) => question.source_key);
  const existing = await existingSourceKeys(sourceKeys);
  const pending = batch.questions.filter((question) => !existing.has(question.source_key));
  const summary = {
    batchId: batch.batch_id,
    total: batch.questions.length,
    alreadyImported: existing.size,
    pending: pending.length,
    mode: options.apply ? 'apply' : 'preflight'
  };

  if (!options.apply) return { ...summary, inserted: [] };
  if (!options.confirmedDatabase || options.confirmedDatabase !== process.env.DB_NAME) {
    throw new Error('Muốn ghi dữ liệu phải truyền --confirm-database đúng bằng DB_NAME');
  }
  return { ...summary, inserted: await insertQuestions(pending) };
}

async function main() {
  try {
    console.log(JSON.stringify(await runImport(parseArguments(process.argv)), null, 2));
  } finally {
    await db.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArguments,
  publicPathForUrl,
  runImport,
  validateBatch,
  validateQuestion
};
