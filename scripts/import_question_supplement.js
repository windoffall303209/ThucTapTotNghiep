// Script import question supplement hỗ trợ nhập, xuất, kiểm tra hoặc bảo trì dữ liệu và cấu hình của dự án.
/* eslint-disable no-console */
require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');

const db = require('../config/db');

const ALLOWED_DIFFICIES = new Set(['EASY', 'MEDIUM', 'HARD']);
const ALLOWED_TYPES = new Set(['MULTIPLE_CHOICE', 'FILL_IN_THE_BLANK']);
const ALLOWED_LAYOUTS = new Set([
  'STACK_VERTICAL',
  'SPLIT_HORIZONTAL_LEFT_IMAGE',
  'SPLIT_HORIZONTAL_RIGHT_IMAGE',
  'IMAGE_IN_CHOICES'
]);
const APPROVED_STATUS = 'APPROVED';
const VERIFIED_SCOPE_STATUS = 'VERIFIED_FROM_TEXTBOOK';
const VERIFIED_QUESTION_SCOPE_STATUS = 'VERIFIED_AGAINST_SCOPE';

// Hàm nonEmpty dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

// Hàm publicPathForUrl dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function publicPathForUrl(imageUrl, rootDir = path.resolve(__dirname, '..')) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!nonEmpty(imageUrl) || !imageUrl.startsWith('/') || imageUrl.includes('..')) return null;
  const relativePath = imageUrl.replace(/^\/+/, '').split('/').join(path.sep);
  const resolved = path.resolve(rootDir, 'public', relativePath);
  const publicRoot = path.resolve(rootDir, 'public');
  return resolved.startsWith(`${publicRoot}${path.sep}`) ? resolved : null;
}

// Hàm curriculumScopePath dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function curriculumScopePath(scopeId, rootDir = path.resolve(__dirname, '..')) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!nonEmpty(scopeId) || !/^[a-z0-9-]+$/.test(scopeId)) return null;
  const scopeDirectory = path.resolve(rootDir, 'data', 'curriculum_scopes');
  const resolved = path.resolve(scopeDirectory, `${scopeId}.json`);
  return resolved.startsWith(`${scopeDirectory}${path.sep}`) ? resolved : null;
}

// Hàm loadCurriculumScope dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function loadCurriculumScope(scopeId, options = {}) {
  const scopeFile = curriculumScopePath(scopeId, options.rootDir);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!scopeFile || !(options.fileExists || fs.existsSync)(scopeFile)) {
    throw new Error(`Không tìm thấy hồ sơ phạm vi kiến thức: ${scopeId || '(trống)'}`);
  }
  return JSON.parse((options.readFile || fs.readFileSync)(scopeFile, 'utf8'));
}

// Hàm validateBatchAgainstCurriculumScope dùng để kiểm tra tính hợp lệ và các điều kiện an toàn; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function validateBatchAgainstCurriculumScope(batch, scope) {
  const errors = [];
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (scope?.status !== VERIFIED_SCOPE_STATUS) {
    errors.push(`Hồ sơ ${batch?.curriculum_scope_id || '(trống)'} chưa được xác minh từ sách giáo khoa`);
    return errors;
  }
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (scope?.scope_id !== batch?.curriculum_scope_id) {
    errors.push('curriculum_scope_id không khớp với hồ sơ phạm vi kiến thức');
  }

  const lessons = new Map((scope?.lessons || []).map((lesson) => [Number(lesson.lesson_id), lesson]));
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const [index, question] of (batch?.questions || []).entries()) {
    const label = `questions[${index}]`;
    const lesson = lessons.get(Number(question?.lesson_id));
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!lesson) {
      errors.push(`${label}.lesson_id chưa có trong hồ sơ phạm vi kiến thức`);
      continue;
    }

    const allowedTags = new Set(lesson.allowed_knowledge_tags || []);
    const knowledgeTags = Array.isArray(question?.knowledge_tags) ? question.knowledge_tags : [];
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (knowledgeTags.length === 0) {
      errors.push(`${label}.knowledge_tags phải chỉ rõ kiến thức được kiểm tra`);
    }
    // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
    for (const tag of knowledgeTags) {
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (!allowedTags.has(tag)) {
        errors.push(`${label}.knowledge_tags chứa kiến thức ngoài phạm vi: ${tag}`);
      }
    }

    const questionText = String(question?.content?.text || '').normalize('NFC').toLocaleLowerCase('vi');
    // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
    for (const pattern of lesson.forbidden_text_patterns || []) {
      let forbiddenPattern;
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      try {
        forbiddenPattern = new RegExp(pattern, 'iu');
      } catch {
        errors.push(`Hồ sơ bài ${lesson.lesson_id} chứa forbidden_text_patterns không hợp lệ: ${pattern}`);
        continue;
      }
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (forbiddenPattern.test(questionText)) {
        errors.push(`${label}.content.text chứa nội dung chưa được học ở bài này: ${pattern}`);
      }
    }

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (question?.curriculum_review?.status !== VERIFIED_QUESTION_SCOPE_STATUS) {
      errors.push(`${label}.curriculum_review.status phải là ${VERIFIED_QUESTION_SCOPE_STATUS}`);
    }
    const lessonPages = new Set((lesson.pdf_pages || []).map(Number));
    const evidencePages = Array.isArray(question?.curriculum_review?.evidence_pdf_pages)
      ? question.curriculum_review.evidence_pdf_pages.map(Number)
      : [];
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (evidencePages.length === 0) {
      errors.push(`${label}.curriculum_review.evidence_pdf_pages không được để trống`);
    } else if (evidencePages.some((page) => !lessonPages.has(page))) {
      errors.push(`${label}.curriculum_review.evidence_pdf_pages không thuộc trang SGK của bài`);
    }
  }
  return errors;
}

// Hàm validateQuestion dùng để kiểm tra tính hợp lệ và các điều kiện an toàn; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function validateQuestion(question, index, options = {}) {
  const errors = [];
  const label = `questions[${index}]`;
  const imageExists = options.imageExists || fs.existsSync;
  const rootDir = options.rootDir || path.resolve(__dirname, '..');

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!nonEmpty(question?.source_key)) errors.push(`${label}.source_key không hợp lệ`);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!Number.isInteger(Number(question?.lesson_id)) || Number(question.lesson_id) <= 0) {
    errors.push(`${label}.lesson_id không hợp lệ`);
  }
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!ALLOWED_TYPES.has(question?.question_type)) errors.push(`${label}.question_type không hợp lệ`);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!ALLOWED_DIFFICIES.has(question?.difficulty)) errors.push(`${label}.difficulty không hợp lệ`);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!ALLOWED_LAYOUTS.has(question?.layout_template)) errors.push(`${label}.layout_template không hợp lệ`);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!nonEmpty(question?.content?.text)) errors.push(`${label}.content.text không được để trống`);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!nonEmpty(question?.correct_answer)) errors.push(`${label}.correct_answer không được để trống`);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (String(question?.correct_answer || '').length > 50) {
    errors.push(`${label}.correct_answer vượt quá giới hạn 50 ký tự của database`);
  }
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!nonEmpty(question?.explanation?.text)) errors.push(`${label}.explanation.text không được để trống`);

  const images = Array.isArray(question?.content?.images) ? question.content.images : [];
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const [imageIndex, image] of images.entries()) {
    const imagePath = publicPathForUrl(image?.url, rootDir);
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!imagePath) {
      errors.push(`${label}.content.images[${imageIndex}].url không an toàn`);
    } else if (!imageExists(imagePath)) {
      errors.push(`${label}.content.images[${imageIndex}] không tìm thấy tệp ${image.url}`);
    }
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!nonEmpty(image?.alt_text)) {
      errors.push(`${label}.content.images[${imageIndex}].alt_text không được để trống`);
    }
  }

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (question?.question_type === 'MULTIPLE_CHOICE') {
    const choices = Array.isArray(question?.choices) ? question.choices : [];
    const keys = choices.map((choice) => String(choice?.key || '').trim().toUpperCase());
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (choices.length !== 4 || new Set(keys).size !== 4 || keys.some((key) => !['A', 'B', 'C', 'D'].includes(key))) {
      errors.push(`${label}.choices phải có đủ bốn đáp án A, B, C, D`);
    }
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (choices.some((choice) => !nonEmpty(choice?.text))) {
      errors.push(`${label}.choices có nội dung rỗng`);
    }
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!keys.includes(String(question?.correct_answer || '').trim().toUpperCase())) {
      errors.push(`${label}.correct_answer không khớp với choices`);
    }
  }

  const distractorKeys = new Set(
    (question?.misconceptions || []).map((item) => String(item?.distractor_key || '').toUpperCase())
  );
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (distractorKeys.has(String(question?.correct_answer || '').toUpperCase())) {
    errors.push(`${label}.misconceptions không được gắn cho đáp án đúng`);
  }
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const [misconceptionIndex, misconception] of (question?.misconceptions || []).entries()) {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!['A', 'B', 'C', 'D'].includes(String(misconception?.distractor_key || '').toUpperCase())) {
      errors.push(`${label}.misconceptions[${misconceptionIndex}].distractor_key không hợp lệ`);
    }
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!nonEmpty(misconception?.misconception_name) || !nonEmpty(misconception?.explanation)) {
      errors.push(`${label}.misconceptions[${misconceptionIndex}] thiếu tên hoặc lời giải thích`);
    }
  }

  return errors;
}

// Hàm validateBatch dùng để kiểm tra tính hợp lệ và các điều kiện an toàn; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function validateBatch(batch, options = {}) {
  const errors = [];
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!nonEmpty(batch?.batch_id)) errors.push('batch_id không hợp lệ');
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (options.requireApproval) {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (batch?.approval?.status !== APPROVED_STATUS) {
      errors.push('approval.status phải là APPROVED trước khi ghi database');
    }
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!nonEmpty(batch?.approval?.approved_by)) {
      errors.push('approval.approved_by không được để trống');
    }
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!nonEmpty(batch?.approval?.approved_at) || Number.isNaN(Date.parse(batch.approval.approved_at))) {
      errors.push('approval.approved_at phải là thời điểm hợp lệ');
    }
  }
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!Array.isArray(batch?.questions) || batch.questions.length === 0) {
    errors.push('questions phải là một mảng không rỗng');
    return errors;
  }

  const keys = batch.questions.map((question) => question?.source_key).filter(Boolean);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (new Set(keys).size !== keys.length) errors.push('source_key bị trùng trong cùng lô dữ liệu');
  batch.questions.forEach((question, index) => errors.push(...validateQuestion(question, index, options)));
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (options.curriculumScope) {
    errors.push(...validateBatchAgainstCurriculumScope(batch, options.curriculumScope));
  }
  return errors;
}

// Hàm parseArguments dùng để phân tích đầu vào thành cấu trúc có thể sử dụng; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function parseArguments(argv) {
  const args = argv.slice(2);
  const file = args.find((arg) => !arg.startsWith('--'));
  const confirmation = args.find((arg) => arg.startsWith('--confirm-database='));
  const approvalConfirmation = args.find((arg) => arg.startsWith('--confirm-approval='));
  return {
    file,
    apply: args.includes('--apply'),
    confirmedDatabase: confirmation?.slice('--confirm-database='.length) || '',
    confirmedApproval: approvalConfirmation?.slice('--confirm-approval='.length) || ''
  };
}

// Hàm existingSourceKeys dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function existingSourceKeys(sourceKeys) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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

// Hàm validateLessons dùng để kiểm tra tính hợp lệ và các điều kiện an toàn; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function validateLessons(questions) {
  const lessonIds = [...new Set(questions.map((question) => Number(question.lesson_id)))];
  const placeholders = lessonIds.map(() => '?').join(', ');
  const rows = await db.query(`SELECT id FROM Lessons WHERE id IN (${placeholders})`, lessonIds);
  const existing = new Set(rows.map((row) => Number(row.id)));
  return lessonIds.filter((lessonId) => !existing.has(lessonId));
}

// Hàm insertQuestions dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function insertQuestions(questions) {
  return db.transaction(async (connection) => {
    const inserted = [];
    // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
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

      // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
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

// Hàm runImport dùng để đồng bộ dữ liệu giữa các định dạng hoặc nguồn khác nhau; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function runImport(options) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!options.file) throw new Error('Thiếu đường dẫn tệp JSON bổ sung');
  const absoluteFile = path.resolve(options.file);
  const batch = JSON.parse(fs.readFileSync(absoluteFile, 'utf8'));
  const curriculumScope = loadCurriculumScope(batch.curriculum_scope_id);
  const errors = validateBatch(batch, {
    requireApproval: options.apply,
    curriculumScope
  });
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (errors.length > 0) throw new Error(`Dữ liệu không hợp lệ:\n- ${errors.join('\n- ')}`);

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (options.apply && options.confirmedApproval !== batch.batch_id) {
    throw new Error('Muốn ghi dữ liệu phải truyền --confirm-approval đúng bằng batch_id đã được duyệt');
  }

  const connection = await db.testConnection();
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!connection.connected) throw new Error(`Không kết nối được database: ${connection.reason}`);
  const missingLessonIds = await validateLessons(batch.questions);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!options.apply) return { ...summary, inserted: [] };
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!options.confirmedDatabase || options.confirmedDatabase !== process.env.DB_NAME) {
    throw new Error('Muốn ghi dữ liệu phải truyền --confirm-database đúng bằng DB_NAME');
  }
  return { ...summary, inserted: await insertQuestions(pending) };
}

// Hàm main dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function main() {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  try {
    console.log(JSON.stringify(await runImport(parseArguments(process.argv)), null, 2));
  } finally {
    await db.close();
  }
}

// Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  curriculumScopePath,
  loadCurriculumScope,
  parseArguments,
  publicPathForUrl,
  runImport,
  validateBatch,
  validateBatchAgainstCurriculumScope,
  validateQuestion
};
