// Script import crawled theory hỗ trợ nhập, xuất, kiểm tra hoặc bảo trì dữ liệu và cấu hình của dự án.
require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');

const db = require('../config/db');

const ROOT = path.join(__dirname, '..');
const DEFAULT_INPUT = path.join(ROOT, 'output', 'doc', 'crawled_theory_cards.json');
const DEFAULT_REPORT = path.join(ROOT, 'output', 'doc', 'import_crawled_theory_report.json');

// Hàm parseArgs dùng để phân tích đầu vào thành cấu trúc có thể sử dụng; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT,
    report: DEFAULT_REPORT
  };

  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const arg of argv) {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (arg.startsWith('--input=')) args.input = path.resolve(arg.split('=').slice(1).join('='));
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    else if (arg.startsWith('--report=')) args.report = path.resolve(arg.split('=').slice(1).join('='));
  }

  return args;
}

// Hàm normalizeTheoryCards dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function normalizeTheoryCards(cards) {
  return (Array.isArray(cards) ? cards : [])
    .map((card, index) => {
      const images = normalizeImages(card.images);
      return {
        id: String(card.id || `card-${index + 1}`),
        title: String(card.title || '').trim(),
        body: String(card.body || '').trim(),
        formulas: normalizeFormulaList(card.formulas || card.formula),
        formula: normalizeFormulaList(card.formulas || card.formula).join('\n'),
        example: String(card.example || '').trim(),
        images
      };
    })
    .filter((card) => card.title || card.body || card.formulas.length > 0 || card.example || card.images.length > 0)
    .map((card, index) => ({
      ...card,
      id: `card-${index + 1}`
    }));
}

// Hàm normalizeFormulaList dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function normalizeFormulaList(value) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }

  return String(value || '')
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

// Hàm normalizeImages dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function normalizeImages(images) {
  return (Array.isArray(images) ? images : [])
    .map((image, index) => ({
      id: String(image.id || `theory-image-${index + 1}`),
      url: String(image.url || '').trim(),
      alt_text: String(image.alt_text || image.alt || 'Hình minh họa lý thuyết').trim(),
      width_percent: Number(image.width_percent || 100),
      storage_provider: image.storage_provider || '',
      public_id: image.public_id || null
    }))
    .filter((image) => image.url);
}

// Hàm timestamp dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function timestamp() {
  const now = new Date();
  // Hàm pad dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  const pad = (value) => String(value).padStart(2, '0');
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    '_',
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds())
  ].join('');
}

// Hàm main dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const raw = await fs.readFile(args.input, 'utf8');
  const crawledItems = JSON.parse(raw);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!Array.isArray(crawledItems) || crawledItems.length === 0) {
    throw new Error('File crawl không có dữ liệu lý thuyết hợp lệ.');
  }

  const normalizedByLessonId = new Map();
  const duplicateLessonIds = [];

  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const item of crawledItems) {
    const lessonId = Number(item.lesson_id);
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!lessonId) continue;
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (normalizedByLessonId.has(lessonId)) duplicateLessonIds.push(lessonId);
    normalizedByLessonId.set(lessonId, {
      lesson_id: lessonId,
      grade: item.grade,
      chapter_name: item.chapter_name,
      lesson_name: item.lesson_name,
      source_url: item.source_url || item.lesson_url || '',
      source_type: item.source_type || '',
      status: item.status || '',
      theory_cards: normalizeTheoryCards(item.theory_cards)
    });
  }

  const report = {
    input: args.input,
    backup: '',
    totalCrawledItems: crawledItems.length,
    uniqueLessonIds: normalizedByLessonId.size,
    duplicateLessonIds,
    totalLessonsInDb: 0,
    clearedLessons: 0,
    importedLessons: 0,
    importedCards: 0,
    unmatchedCrawledLessonIds: [],
    lessonsWithoutCrawledTheory: [],
    generatedAt: new Date().toISOString()
  };

  await db.transaction(async (connection) => {
    const [existingLessons] = await connection.execute(
      `SELECT
          l.id,
          l.lesson_name,
          c.grade,
          c.chapter_name,
          l.theory_cards
       FROM Lessons l
       JOIN Chapters c ON c.id = l.chapter_id
       ORDER BY c.grade, c.sort_order, l.sort_order, l.id`
    );

    report.totalLessonsInDb = existingLessons.length;
    const existingIds = new Set(existingLessons.map((lesson) => Number(lesson.id)));
    const backupPath = path.join(ROOT, 'output', 'doc', `theory_cards_backup_${timestamp()}.json`);
    await fs.writeFile(backupPath, JSON.stringify(existingLessons, null, 2), 'utf8');
    report.backup = backupPath;

    await connection.execute('UPDATE Lessons SET theory_cards = JSON_ARRAY()');
    report.clearedLessons = existingLessons.length;

    // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
    for (const [lessonId, item] of normalizedByLessonId.entries()) {
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (!existingIds.has(lessonId)) {
        report.unmatchedCrawledLessonIds.push(lessonId);
        continue;
      }

      await connection.execute(
        'UPDATE Lessons SET theory_cards = ? WHERE id = ?',
        [JSON.stringify(item.theory_cards), lessonId]
      );
      report.importedLessons += 1;
      report.importedCards += item.theory_cards.length;
    }

    report.lessonsWithoutCrawledTheory = existingLessons
      .filter((lesson) => !normalizedByLessonId.has(Number(lesson.id)))
      .map((lesson) => ({
        lesson_id: Number(lesson.id),
        grade: Number(lesson.grade),
        chapter_name: lesson.chapter_name,
        lesson_name: lesson.lesson_name
      }));
  });

  await fs.writeFile(args.report, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

main().catch((error) => {
  console.error('Không thể import lý thuyết:', error);
  process.exit(1);
});
