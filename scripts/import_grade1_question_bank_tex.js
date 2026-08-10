// Script import grade1 question bank tex hỗ trợ nhập, xuất, kiểm tra hoặc bảo trì dữ liệu và cấu hình của dự án.
require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const db = require('../config/db');

const ROOT = path.join(__dirname, '..');
const DEFAULT_INPUT = path.join(ROOT, 'data', 'grade1_question_bank_reviewed.tex');
const DEFAULT_IMAGE_DIR = path.join(ROOT, 'public', 'uploads', 'images', 'grade1');

// Hàm parseArgs dùng để phân tích đầu vào thành cấu trúc có thể sử dụng; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT,
    imageDir: DEFAULT_IMAGE_DIR,
    commit: false,
    replace: false,
    validateOnly: false
  };
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const arg of argv) {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (arg === '--commit') args.commit = true;
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    else if (arg === '--validate-only') args.validateOnly = true;
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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

// Hàm parsePayloads dùng để phân tích đầu vào thành cấu trúc có thể sử dụng; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function parsePayloads(tex) {
  return tex
    .split(/\r?\n/)
    .filter((line) => line.startsWith('% DBJSON '))
    .map((line, index) => {
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      try {
        return JSON.parse(Buffer.from(line.slice(9).trim(), 'base64').toString('utf8'));
      } catch (error) {
        throw new Error(`DBJSON dòng ${index + 1} không hợp lệ: ${error.message}`);
      }
    });
}

// Hàm normalizeTitle dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
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
    .trim();
}

// Hàm grade1Lessons dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function grade1Lessons() {
  return db.query(
    `SELECT l.id, l.lesson_name, c.chapter_name, c.sort_order AS chapter_order
       FROM Lessons l
       JOIN Chapters c ON c.id = l.chapter_id
      WHERE c.grade = 1
      ORDER BY c.sort_order, l.sort_order, l.id`
  );
}

// Hàm materializeImages dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function materializeImages(payload, imageDir) {
  const images = payload.content?.images || [];
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!image.source_path) continue;
    const extension = path.extname(image.source_path) || '.jpg';
    const fileName =
      `${payload.external_id.toLowerCase()}-${String(index + 1).padStart(2, '0')}${extension}`;
    await fs.mkdir(imageDir, { recursive: true });
    await fs.copyFile(image.source_path, path.join(imageDir, fileName));
    image.url = `/uploads/images/grade1/${fileName}`;
  }
  return payload;
}

// Hàm main dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const tex = await fs.readFile(args.input, 'utf8');
  const payloads = parsePayloads(tex);
  const invalid = payloads.filter(
    (item) =>
      item.grade !== 1 ||
      !Number.isInteger(item.lesson_number) ||
      item.lesson_number < 1 ||
      item.lesson_number > 39 ||
      !Array.isArray(item.choices) ||
      item.choices.length < 2 ||
      item.choices.length > 4 ||
      !item.choices.some((choice) => choice.key === item.correct_answer)
  );
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (invalid.length) {
    throw new Error(`Có ${invalid.length} payload không hợp lệ; dừng import.`);
  }

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (args.validateOnly) {
    const lessonCount = new Set(payloads.map((item) => item.lesson_number)).size;
    const imageCount = payloads.reduce(
      (sum, item) => sum + (item.content?.images?.length || 0),
      0
    );
    console.log(`Hợp lệ: ${payloads.length} câu, ${lessonCount} bài, ${imageCount} ảnh.`);
    return;
  }

  const lessons = await grade1Lessons();
  const lessonByTitle = new Map();
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const lesson of lessons) {
    const key = normalizeTitle(lesson.lesson_name);
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (lessonByTitle.has(key)) {
      throw new Error(`Tên bài bị trùng sau chuẩn hóa: ${lesson.lesson_name}`);
    }
    lessonByTitle.set(key, lesson);
  }

  const sourceLessonTitles = new Map();
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const payload of payloads) {
    sourceLessonTitles.set(payload.lesson_number, payload.lesson_title);
  }
  const mapping = new Map();
  const unmatched = [];
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const [lessonNumber, title] of sourceLessonTitles.entries()) {
    const lesson = lessonByTitle.get(normalizeTitle(title));
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!lesson) unmatched.push(`Bài nguồn ${lessonNumber}: ${title}`);
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    else mapping.set(lessonNumber, lesson);
  }
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (unmatched.length) {
    throw new Error(
      `Không map được ${unmatched.length} bài vào Curriculum lớp 1:\n${unmatched.join('\n')}`
    );
  }

  console.log(
    `Đã kiểm tra ${payloads.length} câu và map đủ ${mapping.size}/39 bài có ngân hàng lớp 1.`
  );
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!args.commit) {
    console.log(
      'Dry run hoàn tất. Dùng --commit để thêm hoặc --replace để lưu trữ bản cũ rồi nạp dữ liệu mới cho 39 bài này.'
    );
    return;
  }

  const prepared = [];
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const payload of payloads) {
    prepared.push(await materializeImages(payload, args.imageDir));
  }
  const mappedLessonIds = [...new Set([...mapping.values()].map((lesson) => Number(lesson.id)))];

  await db.transaction(async (connection) => {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (args.replace) {
      const placeholders = mappedLessonIds.map(() => '?').join(',');
      await connection.execute(
        `UPDATE QuestionBank
         SET is_active = 0, archived_at = CURRENT_TIMESTAMP
         WHERE lesson_id IN (${placeholders}) AND is_active = 1`,
        mappedLessonIds
      );
    }
    // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
    for (const payload of prepared) {
      const lesson = mapping.get(payload.lesson_number);
      const [result] = await connection.execute(
        `INSERT INTO QuestionBank
          (lesson_id, concept_id, question_type, difficulty, layout_template, content, choices, correct_answer, explanation, is_active)
         VALUES (?, NULL, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), ?, CAST(? AS JSON), 1)`,
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
      // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
      for (const misconception of payload.misconceptions || []) {
        await connection.execute(
          `INSERT INTO CommonMisconceptions
            (question_id, distractor_key, misconception_name, explanation)
           VALUES (?, ?, ?, ?)`,
          [
            result.insertId,
            misconception.distractor_key,
            misconception.misconception_name,
            misconception.explanation
          ]
        );
      }
    }
  });
  console.log(
    `Đã import ${prepared.length} câu hỏi Toán 1${args.replace ? ' (đã lưu trữ bản cũ của 39 bài)' : ''}.`
  );
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
