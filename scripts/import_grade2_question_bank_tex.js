// Script import grade2 question bank tex hỗ trợ nhập, xuất, kiểm tra hoặc bảo trì dữ liệu và cấu hình của dự án.
require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const db = require('../config/db');

const ROOT = path.join(__dirname, '..');
const DEFAULT_INPUT = path.join(ROOT, 'data', 'grade2_question_bank.tex');
const DEFAULT_IMAGE_DIR = path.join(ROOT, 'public', 'uploads', 'images', 'grade2');

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
    .replace(/\s+1$/, '')
    .trim();
}

// Hàm grade2Lessons dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function grade2Lessons() {
  return db.query(
    `SELECT l.id, l.lesson_name, c.id AS chapter_id, c.chapter_name, c.sort_order AS chapter_order
       FROM Lessons l
       JOIN Chapters c ON c.id = l.chapter_id
      WHERE c.grade = 2
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
    const extension = path.extname(image.source_path) || '.png';
    const fileName =
      `${payload.external_id.toLowerCase()}-${String(index + 1).padStart(2, '0')}${extension}`;
    await fs.mkdir(imageDir, { recursive: true });
    await fs.copyFile(image.source_path, path.join(imageDir, fileName));
    image.url = `/uploads/images/grade2/${fileName}`;
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
      item.grade !== 2 ||
      !Number.isInteger(item.lesson_number) ||
      item.lesson_number < 1 ||
      item.lesson_number > 51 ||
      !Array.isArray(item.choices) ||
      item.choices.length !== 4 ||
      !['A', 'B', 'C', 'D'].includes(item.correct_answer)
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

  const lessons = await grade2Lessons();
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
  const sourceTitleCounts = new Map();
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const title of sourceLessonTitles.values()) {
    const key = normalizeTitle(title);
    sourceTitleCounts.set(key, (sourceTitleCounts.get(key) || 0) + 1);
  }
  const mapping = new Map();
  const unmatched = [];
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const [lessonNumber, title] of sourceLessonTitles.entries()) {
    const normalizedTitle = normalizeTitle(title);
    const lesson = sourceTitleCounts.get(normalizedTitle) > 1
      ? lessons[lessonNumber - 1]
      : lessonByTitle.get(normalizedTitle);
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!lesson) unmatched.push(`Bài ${lessonNumber}: ${title}`);
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    else mapping.set(lessonNumber, lesson);
  }
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (unmatched.length) {
    throw new Error(
      `Không map được ${unmatched.length} bài vào Curriculum lớp 2:\n${unmatched.join('\n')}`
    );
  }
  const mappedLessonIds = new Set(
    [...mapping.values()].map((lesson) => Number(lesson.id))
  );
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (mappedLessonIds.size !== mapping.size) {
    throw new Error(
      `Chỉ map được ${mappedLessonIds.size}/${mapping.size} bài đích duy nhất; dừng import để tránh gộp nhầm câu hỏi.`
    );
  }

  console.log(`Đã kiểm tra ${payloads.length} câu và map đủ ${mapping.size}/51 bài lớp 2.`);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!args.commit) {
    console.log(
      'Dry run hoàn tất. Dùng --commit để thêm hoặc --replace để lưu trữ câu hỏi lớp 2 cũ rồi nạp bản mới.'
    );
    return;
  }

  const prepared = [];
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const payload of payloads) {
    prepared.push(await materializeImages(payload, args.imageDir));
  }

  await db.transaction(async (connection) => {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (args.replace) {
      await connection.execute(
        `UPDATE QuestionBank q
          JOIN Lessons l ON l.id = q.lesson_id
          JOIN Chapters c ON c.id = l.chapter_id
         SET q.is_active = 0, q.archived_at = CURRENT_TIMESTAMP
         WHERE c.grade = 2 AND q.is_active = 1`
      );
    }
    // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
    for (const payload of prepared) {
      const lesson = mapping.get(payload.lesson_number);
      await connection.execute(
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
    }
  });
  console.log(
    `Đã import ${prepared.length} câu hỏi Toán 2${args.replace ? ' (đã lưu trữ bản cũ)' : ''}.`
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
