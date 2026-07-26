require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const db = require('../config/db');

const ROOT = path.join(__dirname, '..');
const DEFAULT_INPUT = path.join(ROOT, 'data', 'grade3_question_bank.tex');
const DEFAULT_IMAGE_DIR = path.join(ROOT, 'public', 'uploads', 'images', 'grade3');

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
    .replace(/\s+trang\s+\d+\s*$/i, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+trong\s+pham\s+vi\s+[\d\s]+$/i, '')
    .trim();
}

async function grade3Lessons() {
  return db.query(
    `SELECT l.id, l.lesson_name, c.chapter_name, c.sort_order AS chapter_order
       FROM Lessons l
       JOIN Chapters c ON c.id = l.chapter_id
      WHERE c.grade = 3
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
    image.url = `/uploads/images/grade3/${fileName}`;
  }
  return payload;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const tex = await fs.readFile(args.input, 'utf8');
  const payloads = parsePayloads(tex);
  const invalid = payloads.filter(
    (item) =>
      item.grade !== 3 ||
      !Number.isInteger(item.lesson_number) ||
      item.lesson_number < 1 ||
      item.lesson_number > 66 ||
      !Array.isArray(item.choices) ||
      item.choices.length !== 4 ||
      !['A', 'B', 'C', 'D'].includes(item.correct_answer) ||
      !item.choices.some((choice) => choice.key === item.correct_answer)
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
    console.log(`Hợp lệ: ${payloads.length} câu, ${lessonCount} bài có dữ liệu, ${imageCount} ảnh.`);
    return;
  }

  const lessons = await grade3Lessons();
  const sourceLessonTitles = new Map();
  for (const payload of payloads) {
    sourceLessonTitles.set(payload.lesson_number, payload.lesson_title);
  }
  const mapping = new Map();
  const unmatched = [];
  for (const [lessonNumber, title] of sourceLessonTitles.entries()) {
    const lesson = lessons[lessonNumber - 1];
    if (!lesson || normalizeTitle(lesson.lesson_name) !== normalizeTitle(title)) {
      unmatched.push(
        `Bài nguồn ${lessonNumber}: ${title}` +
          (lesson ? `; Curriculum: ${lesson.lesson_name}` : '; Curriculum: không tồn tại')
      );
    } else {
      mapping.set(lessonNumber, lesson);
    }
  }
  if (unmatched.length) {
    throw new Error(
      `Không map được ${unmatched.length} bài vào Curriculum lớp 3:\n${unmatched.join('\n')}`
    );
  }

  console.log(
    `Đã kiểm tra ${payloads.length} câu và map đủ ${mapping.size}/${sourceLessonTitles.size} bài có dữ liệu; Curriculum lớp 3 có ${lessons.length} bài.`
  );
  if (!args.commit) {
    console.log('Dry run hoàn tất. Dùng --commit để thêm hoặc --replace để thay dữ liệu của các bài đã map.');
    return;
  }

  const prepared = [];
  for (const payload of payloads) {
    prepared.push(await materializeImages(payload, args.imageDir));
  }
  const mappedLessonIds = [...new Set([...mapping.values()].map((lesson) => Number(lesson.id)))];

  await db.transaction(async (connection) => {
    if (args.replace) {
      const placeholders = mappedLessonIds.map(() => '?').join(',');
      await connection.execute(
        `DELETE FROM QuestionBank WHERE lesson_id IN (${placeholders})`,
        mappedLessonIds
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
  console.log(`Đã import ${prepared.length} câu hỏi Toán 3${args.replace ? ' (thay các bài có dữ liệu)' : ''}.`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (typeof db.close === 'function') await db.close().catch(() => {});
  });
