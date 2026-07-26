require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const db = require('../config/db');

const ROOT = path.join(__dirname, '..');
const DEFAULT_INPUT = path.join(ROOT, 'data', 'grade2_question_bank.tex');
const DEFAULT_IMAGE_DIR = path.join(ROOT, 'public', 'uploads', 'images', 'grade2');

function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT,
    imageDir: DEFAULT_IMAGE_DIR,
    commit: false,
    replace: false,
    validateOnly: false
  };
  for (const arg of argv) {
    if (arg === '--commit') args.commit = true;
    else if (arg === '--validate-only') args.validateOnly = true;
    else if (arg === '--replace') {
      args.replace = true;
      args.commit = true;
    } else if (arg.startsWith('--input=')) {
      args.input = path.resolve(arg.slice('--input='.length));
    } else if (arg.startsWith('--image-dir=')) {
      args.imageDir = path.resolve(arg.slice('--image-dir='.length));
    }
  }
  return args;
}

function parsePayloads(tex) {
  return tex
    .split(/\r?\n/)
    .filter((line) => line.startsWith('% DBJSON '))
    .map((line, index) => {
      try {
        return JSON.parse(Buffer.from(line.slice(9).trim(), 'base64').toString('utf8'));
      } catch (error) {
        throw new Error(`DBJSON dòng ${index + 1} không hợp lệ: ${error.message}`);
      }
    });
}

function normalizeTitle(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/^\s*\d+\s*[.)-]\s*/, '')
    .replace(/^\s*bai\s+\d+\s*[.)-]\s*/, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+1$/, '')
    .trim();
}

async function grade2Lessons() {
  return db.query(
    `SELECT l.id, l.lesson_name, c.id AS chapter_id, c.chapter_name, c.sort_order AS chapter_order
       FROM Lessons l
       JOIN Chapters c ON c.id = l.chapter_id
      WHERE c.grade = 2
      ORDER BY c.sort_order, l.sort_order, l.id`
  );
}

async function materializeImages(payload, imageDir) {
  const images = payload.content?.images || [];
  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    if (!image.source_path) continue;
    const extension = path.extname(image.source_path) || '.png';
    const fileName =
      `${payload.external_id.toLowerCase()}-${String(index + 1).padStart(2, '0')}${extension}`;
    await fs.mkdir(imageDir, { recursive: true });
    await fs.copyFile(image.source_path, path.join(imageDir, fileName));
    image.url = `/uploads/images/grade2/${fileName}`;
  }
  return payload;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const tex = await fs.readFile(args.input, 'utf8');
  const payloads = parsePayloads(tex);
  const invalid = payloads.filter(
    (item) =>
      item.grade !== 2 ||
      !Number.isInteger(item.lesson_number) ||
      item.lesson_number < 1 ||
      item.lesson_number > 51 ||
      !Array.isArray(item.choices) ||
      item.choices.length !== 4 ||
      !['A', 'B', 'C', 'D'].includes(item.correct_answer)
  );
  if (invalid.length) {
    throw new Error(`Có ${invalid.length} payload không hợp lệ; dừng import.`);
  }

  if (args.validateOnly) {
    const lessonCount = new Set(payloads.map((item) => item.lesson_number)).size;
    const imageCount = payloads.reduce(
      (sum, item) => sum + (item.content?.images?.length || 0),
      0
    );
    console.log(`Hợp lệ: ${payloads.length} câu, ${lessonCount} bài, ${imageCount} ảnh.`);
    return;
  }

  const lessons = await grade2Lessons();
  const lessonByTitle = new Map();
  for (const lesson of lessons) {
    const key = normalizeTitle(lesson.lesson_name);
    if (lessonByTitle.has(key)) {
      throw new Error(`Tên bài bị trùng sau chuẩn hóa: ${lesson.lesson_name}`);
    }
    lessonByTitle.set(key, lesson);
  }

  const sourceLessonTitles = new Map();
  for (const payload of payloads) {
    sourceLessonTitles.set(payload.lesson_number, payload.lesson_title);
  }
  const mapping = new Map();
  const unmatched = [];
  for (const [lessonNumber, title] of sourceLessonTitles.entries()) {
    const lesson = lessonByTitle.get(normalizeTitle(title));
    if (!lesson) unmatched.push(`Bài ${lessonNumber}: ${title}`);
    else mapping.set(lessonNumber, lesson);
  }
  if (unmatched.length) {
    throw new Error(
      `Không map được ${unmatched.length} bài vào Curriculum lớp 2:\n${unmatched.join('\n')}`
    );
  }

  console.log(`Đã kiểm tra ${payloads.length} câu và map đủ ${mapping.size}/51 bài lớp 2.`);
  if (!args.commit) {
    console.log('Dry run hoàn tất. Dùng --commit để thêm hoặc --replace để thay câu hỏi lớp 2.');
    return;
  }

  const prepared = [];
  for (const payload of payloads) {
    prepared.push(await materializeImages(payload, args.imageDir));
  }

  await db.transaction(async (connection) => {
    if (args.replace) {
      await connection.execute(
        `DELETE q FROM QuestionBank q
          JOIN Lessons l ON l.id = q.lesson_id
          JOIN Chapters c ON c.id = l.chapter_id
         WHERE c.grade = 2`
      );
    }
    for (const payload of prepared) {
      const lesson = mapping.get(payload.lesson_number);
      await connection.execute(
        `INSERT INTO QuestionBank
          (lesson_id, concept_id, question_type, difficulty, layout_template, content, choices, correct_answer, explanation)
         VALUES (?, NULL, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), ?, CAST(? AS JSON))`,
        [
          lesson.id,
          payload.question_type,
          payload.difficulty,
          payload.layout_template,
          JSON.stringify(payload.content),
          JSON.stringify(payload.choices),
          payload.correct_answer,
          JSON.stringify(payload.explanation)
        ]
      );
    }
  });
  console.log(`Đã import ${prepared.length} câu hỏi Toán 2${args.replace ? ' (thay thế)' : ''}.`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (typeof db.close === 'function') await db.close().catch(() => {});
  });
