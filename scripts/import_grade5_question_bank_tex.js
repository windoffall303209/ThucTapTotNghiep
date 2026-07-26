require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const db = require('../config/db');

const ROOT = path.join(__dirname, '..');
const DEFAULT_INPUT = path.join(ROOT, 'data', 'grade5_question_bank.tex');
const DEFAULT_IMAGE_DIR = path.join(ROOT, 'public', 'uploads', 'images', 'grade5');

function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT,
    imageDir: DEFAULT_IMAGE_DIR,
    commit: false,
    replace: false,
    validateOnly: false,
    createMissingLessons: false
  };
  for (const arg of argv) {
    if (arg === '--commit') args.commit = true;
    else if (arg === '--validate-only') args.validateOnly = true;
    else if (arg === '--create-missing-lessons') args.createMissingLessons = true;
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

async function grade5Lessons() {
  return db.query(
    `SELECT l.id, l.lesson_name, c.id AS chapter_id, c.chapter_name
       FROM Lessons l
       JOIN Chapters c ON c.id = l.chapter_id
      WHERE c.grade = 5
      ORDER BY c.sort_order, l.sort_order, l.id`
  );
}

async function grade5Chapters() {
  return db.query(
    `SELECT id, chapter_name, sort_order
       FROM Chapters
      WHERE grade = 5
      ORDER BY sort_order, id`
  );
}

function sourceLessonNumber(lessonName) {
  const match = String(lessonName || '').match(/\bBài\s+(\d+)\b/i);
  return match ? Number(match[1]) : null;
}

function chapterIndexForLesson(lessonNumber) {
  if (lessonNumber <= 24) return 0;
  if (lessonNumber <= 45) return 1;
  if (lessonNumber <= 78) return 2;
  return 3;
}

function sourceLessons(payloads) {
  const result = new Map();
  for (const payload of payloads) {
    if (!result.has(payload.lesson_number)) {
      result.set(payload.lesson_number, payload.lesson_title);
    }
  }
  return result;
}

async function materializeImages(payload, imageDir) {
  const images = payload.content?.images || [];
  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    if (!image.source_path) continue;
    const extension = path.extname(image.source_path) || '.png';
    const fileName = `${payload.external_id.toLowerCase()}-${String(index + 1).padStart(2, '0')}${extension}`;
    const target = path.join(imageDir, fileName);
    await fs.mkdir(imageDir, { recursive: true });
    await fs.copyFile(image.source_path, target);
    image.url = `/uploads/images/grade5/${fileName}`;
  }
  return payload;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const tex = await fs.readFile(args.input, 'utf8');
  const payloads = parsePayloads(tex);

  const invalid = payloads.filter(
    (item) =>
      item.grade !== 5 ||
      !Number.isInteger(item.lesson_number) ||
      item.lesson_number < 1 ||
      item.lesson_number > 91 ||
      !Array.isArray(item.choices) ||
      item.choices.length !== 4
  );
  if (invalid.length) {
    throw new Error(`Có ${invalid.length} payload không hợp lệ; dừng import.`);
  }
  if (args.validateOnly) {
    const lessonCount = new Set(payloads.map((item) => item.lesson_number)).size;
    const imageCount = payloads.reduce((sum, item) => sum + (item.content?.images?.length || 0), 0);
    console.log(`Hợp lệ: ${payloads.length} câu, ${lessonCount} bài, ${imageCount} ảnh.`);
    return;
  }

  const lessons = await grade5Lessons();
  const chapters = await grade5Chapters();
  if (chapters.length !== 4) {
    throw new Error(`Database có ${chapters.length} chủ đề Toán 5; cần đúng 4 chủ đề để map Bài 1-91.`);
  }
  const lessonBySourceNumber = new Map(
    lessons
      .map((lesson) => [sourceLessonNumber(lesson.lesson_name), lesson])
      .filter(([number]) => Number.isInteger(number))
  );
  const missingLessonNumbers = [...sourceLessons(payloads).keys()].filter(
    (number) => !lessonBySourceNumber.has(number)
  );

  console.log(
    `Đã kiểm tra ${payloads.length} câu: ${lessonBySourceNumber.size} bài đã có trong DB, ` +
      `${missingLessonNumbers.length} bài cần tạo thêm.`
  );
  if (!args.commit) {
    console.log(
      'Dry run hoàn tất. Dùng --commit --create-missing-lessons để nạp đủ 91 bài, ' +
        'hoặc thêm --replace để thay toàn bộ câu hỏi lớp 5.'
    );
    return;
  }
  if (missingLessonNumbers.length && !args.createMissingLessons) {
    throw new Error(
      `Còn thiếu ${missingLessonNumbers.length} bài trong Curriculum. ` +
        'Chạy lại với --create-missing-lessons để tạo đủ trước khi import.'
    );
  }

  const prepared = [];
  for (const payload of payloads) {
    prepared.push(await materializeImages(payload, args.imageDir));
  }

  await db.transaction(async (connection) => {
    const allSourceLessons = sourceLessons(prepared);
    for (const [lessonNumber, title] of allSourceLessons.entries()) {
      let lesson = lessonBySourceNumber.get(lessonNumber);
      const chapter = chapters[chapterIndexForLesson(lessonNumber)];
      if (!lesson) {
        const [result] = await connection.execute(
          `INSERT INTO Lessons (chapter_id, lesson_name, theory_cards, sort_order)
           VALUES (?, ?, CAST(? AS JSON), ?)`,
          [chapter.id, `Bài ${lessonNumber}. ${title}`, JSON.stringify([]), lessonNumber]
        );
        lesson = {
          id: result.insertId,
          lesson_name: `Bài ${lessonNumber}. ${title}`,
          chapter_id: chapter.id
        };
        lessonBySourceNumber.set(lessonNumber, lesson);
      } else {
        await connection.execute(
          'UPDATE Lessons SET sort_order = ? WHERE id = ?',
          [lessonNumber, lesson.id]
        );
      }
    }

    if (args.replace) {
      await connection.execute(
        `DELETE q FROM QuestionBank q
          JOIN Lessons l ON l.id = q.lesson_id
          JOIN Chapters c ON c.id = l.chapter_id
         WHERE c.grade = 5`
      );
    }
    for (const payload of prepared) {
      const lesson = lessonBySourceNumber.get(payload.lesson_number);
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
  console.log(`Đã import ${prepared.length} câu hỏi Toán 5${args.replace ? ' (chế độ thay thế)' : ''}.`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (typeof db.close === 'function') await db.close().catch(() => {});
  });
