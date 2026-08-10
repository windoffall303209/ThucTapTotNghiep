// Script sync theory images hỗ trợ nhập, xuất, kiểm tra hoặc bảo trì dữ liệu và cấu hình của dự án.
'use strict';

require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../config/db');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_ROOT = path.resolve(process.env.THEORY_IMAGE_SOURCE || 'C:/Users/WIND-OF-FALL/Pictures/DataToan');
const PUBLIC_ROOT = path.join(ROOT, 'public', 'uploads', 'images', 'theory');
const MANIFEST_PATH = path.join(ROOT, 'data', 'theory_image_manifest.json');
const MISSING_PATH = path.join(ROOT, 'data', 'theory_missing_lessons.json');
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

// Hàm naturalCompare dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function naturalCompare(left, right) {
  return left.localeCompare(right, 'vi', { numeric: true, sensitivity: 'base' });
}

// Hàm normalizeText dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Hàm chapterNumber dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function chapterNumber(name) {
  const match = normalizeText(name).match(/(?:chuong|chu de)\s*0*(\d+)/);
  return match ? Number(match[1]) : null;
}

// Hàm globalLessonNumber dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function globalLessonNumber(name) {
  const match = String(name || '').match(/\bBài\s*0*(\d+)\b/i);
  return match ? Number(match[1]) : null;
}

// Hàm localLessonNumber dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function localLessonNumber(name) {
  const match = String(name || '').trim().match(/^0*(\d+)\s*[.\-_]/);
  return match ? Number(match[1]) : null;
}

// Hàm lessonKey dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function lessonKey(grade, name) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (grade >= 4) return globalLessonNumber(name);
  return localLessonNumber(name) ?? globalLessonNumber(name);
}

// Hàm cleanLessonTitle dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function cleanLessonTitle(value) {
  let title = String(value || '').trim();
  title = title.replace(/^\d+\s*[.]\s*/, '');
  title = title.replace(/^Bài\s*\d+\s*[.:\-]?\s*/i, '');
  return title.trim();
}

// Hàm listDirectories dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function listDirectories(directory) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ name: entry.name, fullPath: path.join(directory, entry.name) }))
    .sort((a, b) => naturalCompare(a.name, b.name));
}

// Hàm listImages dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function listImages(directory) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!directory || !fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => path.join(directory, entry.name))
    .sort(naturalCompare);
}

// Hàm sha256 dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

// Hàm sourceIndex dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function sourceIndex() {
  const result = new Map();
  const unmatchedSpecialFolders = [];

  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (let grade = 1; grade <= 5; grade += 1) {
    const gradePath = path.join(SOURCE_ROOT, `Lop_${String(grade).padStart(2, '0')}`);
    // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
    for (const chapter of listDirectories(gradePath)) {
      const chapterOrder = chapterNumber(chapter.name);
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (!chapterOrder) continue;

      const chapterKey = `${grade}:${chapterOrder}`;
      const lessonMap = new Map();
      // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
      for (const lessonFolder of listDirectories(chapter.fullPath)) {
        const key = lessonKey(grade, lessonFolder.name);
        // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
        if (!key) {
          unmatchedSpecialFolders.push(path.relative(SOURCE_ROOT, lessonFolder.fullPath));
          continue;
        }
        lessonMap.set(key, {
          name: lessonFolder.name,
          fullPath: lessonFolder.fullPath,
          images: listImages(lessonFolder.fullPath)
        });
      }
      result.set(chapterKey, { chapter, lessons: lessonMap });
    }
  }

  return { chapters: result, unmatchedSpecialFolders };
}

// Hàm curriculumRows dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function curriculumRows() {
  return db.query(
    `SELECT
       c.grade,
       c.id AS chapter_id,
       c.chapter_name,
       c.sort_order AS chapter_order,
       l.id AS lesson_id,
       l.lesson_name,
       l.sort_order AS lesson_order,
       l.theory_cards
     FROM Chapters c
     JOIN Lessons l ON l.chapter_id = c.id
     WHERE c.grade BETWEEN 1 AND 5
     ORDER BY c.grade, c.sort_order, l.sort_order, l.id`
  );
}

// Hàm parseCards dùng để phân tích đầu vào thành cấu trúc có thể sử dụng; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function parseCards(value) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (Array.isArray(value)) return value;
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!value) return [];
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (Buffer.isBuffer(value)) value = value.toString('utf8');
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

// Hàm targetInfo dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function targetInfo(row, sourcePath, index) {
  const extension = path.extname(sourcePath).toLowerCase() || '.png';
  const relativeFile = path.join(
    `grade-${row.grade}`,
    `chapter-${String(row.chapter_order).padStart(2, '0')}`,
    `lesson-${String(row.lesson_id).padStart(3, '0')}`,
    `theory-${String(index + 1).padStart(2, '0')}${extension}`
  );
  return {
    relativeFile,
    targetPath: path.join(PUBLIC_ROOT, relativeFile),
    url: `/uploads/images/theory/${relativeFile.split(path.sep).join('/')}`
  };
}

// Hàm buildManifest dùng để xây dựng kết quả từ các nguồn dữ liệu và quy tắc liên quan; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function buildManifest(rows, source) {
  const entries = [];
  const missing = [];
  const usedFolders = new Set();

  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const row of rows) {
    const chapter = source.chapters.get(`${row.grade}:${row.chapter_order}`);
    const key = lessonKey(row.grade, row.lesson_name);
    const folder = chapter?.lessons.get(key);
    const images = folder?.images || [];
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (folder) usedFolders.add(folder.fullPath);

    const imageEntries = images.map((sourcePath, index) => {
      const target = targetInfo(row, sourcePath, index);
      return {
        source_path: sourcePath,
        source_relative: path.relative(SOURCE_ROOT, sourcePath),
        source_sha256: sha256(sourcePath),
        target_path: target.targetPath,
        url: target.url
      };
    });

    const entry = {
      grade: Number(row.grade),
      chapter_id: Number(row.chapter_id),
      chapter_order: Number(row.chapter_order),
      chapter_name: row.chapter_name,
      lesson_id: Number(row.lesson_id),
      lesson_order: Number(row.lesson_order),
      lesson_name: row.lesson_name,
      title: cleanLessonTitle(row.lesson_name),
      source_folder: folder ? folder.fullPath : null,
      source_folder_relative: folder ? path.relative(SOURCE_ROOT, folder.fullPath) : null,
      images: imageEntries,
      status: imageEntries.length ? 'MAPPED' : folder ? 'EMPTY_FOLDER' : 'MISSING_FOLDER'
    };
    entries.push(entry);
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!imageEntries.length) missing.push(entry);
  }

  const unusedFolders = [];
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const chapter of source.chapters.values()) {
    // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
    for (const folder of chapter.lessons.values()) {
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (!usedFolders.has(folder.fullPath)) {
        unusedFolders.push(path.relative(SOURCE_ROOT, folder.fullPath));
      }
    }
  }

  return { entries, missing, unusedFolders };
}

// Hàm hydrateGeneratedImages dùng để xây dựng kết quả từ các nguồn dữ liệu và quy tắc liên quan; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function hydrateGeneratedImages(manifest) {
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const entry of manifest.entries) {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (entry.images.length) continue;
    const generated = targetInfo(entry, 'theory.png', 0);
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!fs.existsSync(generated.targetPath)) continue;
    entry.images = [{
      source_path: generated.targetPath,
      source_relative: path.relative(ROOT, generated.targetPath),
      source_sha256: sha256(generated.targetPath),
      target_path: generated.targetPath,
      url: generated.url,
      generated_by_ai: true
    }];
    entry.status = 'GENERATED';
  }
  manifest.missing = manifest.entries.filter((entry) => !entry.images.length);
  return manifest;
}

// Hàm theoryImage dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function theoryImage(image, index, entry) {
  return {
    id: `theory-image-${index + 1}`,
    url: image.url,
    alt_text: `Thẻ lý thuyết: ${entry.title}`,
    width_percent: 100,
    storage_provider: 'local',
    public_id: null
  };
}

// Hàm cardsWithImages dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function cardsWithImages(_rawCards, entry) {
  return entry.images.map((image, index) => ({
    id: `card-${index + 1}`,
    type: 'concept',
    layout: 'visual_top',
    title: '',
    display_text: '',
    body: '',
    formulas: [],
    formula: '',
    example: '',
    student_task: '',
    remember: '',
    interaction: 'none',
    grid_layout: { enabled: false },
    images: [theoryImage(image, index, entry)]
  }));
}

// Hàm writeReports dùng để cập nhật trạng thái hoặc dữ liệu theo quy tắc nghiệp vụ; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function writeReports(manifest) {
  const generated = manifest.entries.filter((entry) => entry.status === 'GENERATED');
  const payload = {
    generated_at: new Date().toISOString(),
    source_root: SOURCE_ROOT,
    scope: 'Grades 1-5 all chapters',
    lesson_count: manifest.entries.length,
    mapped_lesson_count: manifest.entries.filter((entry) => entry.status === 'MAPPED').length,
    missing_lesson_count: manifest.missing.length,
    generated_lesson_count: generated.length,
    image_count: manifest.entries.reduce((sum, entry) => sum + entry.images.length, 0),
    unused_source_folders: manifest.unusedFolders,
    entries: manifest.entries
  };
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.writeFileSync(MISSING_PATH, `${JSON.stringify({
    generated_at: payload.generated_at,
    scope: payload.scope,
    originally_missing_lesson_count: generated.length + manifest.missing.length,
    generated_lesson_count: generated.length,
    remaining_missing_lesson_count: manifest.missing.length,
    generated_lessons: generated,
    remaining_missing_lessons: manifest.missing
  }, null, 2)}\n`, 'utf8');
}

// Hàm copyImages dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function copyImages(entries) {
  let copied = 0;
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const entry of entries) {
    // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
    for (const image of entry.images) {
      fs.mkdirSync(path.dirname(image.target_path), { recursive: true });
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (path.resolve(image.source_path) !== path.resolve(image.target_path)) {
        fs.copyFileSync(image.source_path, image.target_path);
      }
      copied += 1;
    }
  }
  return copied;
}

// Hàm removeStaleImages dùng để xóa hoặc giải phóng tài nguyên theo điều kiện an toàn; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function removeStaleImages(entries) {
  const expected = new Set(
    entries.flatMap((entry) => entry.images.map((image) => path.resolve(image.target_path)))
  );
  const root = path.resolve(PUBLIC_ROOT);
  const removed = [];

  // Hàm visit dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  function visit(directory) {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!fs.existsSync(directory)) return;
    // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.resolve(directory, item.name);
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (fullPath !== root && !fullPath.startsWith(`${root}${path.sep}`)) {
        throw new Error(`Refusing to inspect path outside theory image root: ${fullPath}`);
      }
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (item.isDirectory()) visit(fullPath);
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      else if (IMAGE_EXTENSIONS.has(path.extname(item.name).toLowerCase()) && !expected.has(fullPath)) {
        fs.unlinkSync(fullPath);
        removed.push(fullPath);
      }
    }
  }

  visit(root);
  return removed;
}

// Hàm importMappedImages dùng để đồng bộ dữ liệu giữa các định dạng hoặc nguồn khác nhau; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function importMappedImages(rows, entries) {
  const byLesson = new Map(entries.map((entry) => [entry.lesson_id, entry]));
  const updates = rows
    .map((row) => ({ row, entry: byLesson.get(Number(row.lesson_id)) }))
    .filter(({ entry }) => entry?.images.length);

  await db.transaction(async (connection) => {
    // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
    for (const { row, entry } of updates) {
      const cards = cardsWithImages(row.theory_cards, entry);
      await connection.execute(
        'UPDATE Lessons SET theory_cards = ? WHERE id = ?',
        [JSON.stringify(cards), Number(row.lesson_id)]
      );
    }
  });
  return updates.length;
}

// Hàm main dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function main() {
  const args = new Set(process.argv.slice(2));
  const rows = await curriculumRows();
  const source = sourceIndex();
  const manifest = hydrateGeneratedImages(buildManifest(rows, source));
  writeReports(manifest);

  let copied = 0;
  let imported = 0;
  let removed = [];
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (args.has('--commit')) {
    copied = copyImages(manifest.entries);
    removed = removeStaleImages(manifest.entries);
    imported = await importMappedImages(rows, manifest.entries);
  }

  console.log(JSON.stringify({
    mode: args.has('--commit') ? 'commit' : 'dry-run',
    lesson_count: manifest.entries.length,
    mapped_lesson_count: manifest.entries.length - manifest.missing.length,
    missing_lesson_count: manifest.missing.length,
    image_count: manifest.entries.reduce((sum, entry) => sum + entry.images.length, 0),
    copied_image_count: copied,
    removed_stale_image_count: removed.length,
    removed_stale_images: removed.map((filePath) => path.relative(PUBLIC_ROOT, filePath)),
    imported_lesson_count: imported,
    unused_source_folder_count: manifest.unusedFolders.length,
    unmatched_special_folder_count: source.unmatchedSpecialFolders.length,
    manifest: MANIFEST_PATH,
    missing_report: MISSING_PATH
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.close());
