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

function naturalCompare(left, right) {
  return left.localeCompare(right, 'vi', { numeric: true, sensitivity: 'base' });
}

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

function chapterNumber(name) {
  const match = normalizeText(name).match(/(?:chuong|chu de)\s*0*(\d+)/);
  return match ? Number(match[1]) : null;
}

function globalLessonNumber(name) {
  const match = String(name || '').match(/\bBài\s*0*(\d+)\b/i);
  return match ? Number(match[1]) : null;
}

function localLessonNumber(name) {
  const match = String(name || '').trim().match(/^0*(\d+)\s*[.\-_]/);
  return match ? Number(match[1]) : null;
}

function lessonKey(grade, name) {
  if (grade >= 4) return globalLessonNumber(name);
  return localLessonNumber(name) ?? globalLessonNumber(name);
}

function cleanLessonTitle(value) {
  let title = String(value || '').trim();
  title = title.replace(/^\d+\s*[.]\s*/, '');
  title = title.replace(/^Bài\s*\d+\s*[.:\-]?\s*/i, '');
  return title.trim();
}

function listDirectories(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ name: entry.name, fullPath: path.join(directory, entry.name) }))
    .sort((a, b) => naturalCompare(a.name, b.name));
}

function listImages(directory) {
  if (!directory || !fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => path.join(directory, entry.name))
    .sort(naturalCompare);
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function sourceIndex() {
  const result = new Map();
  const unmatchedSpecialFolders = [];

  for (let grade = 1; grade <= 5; grade += 1) {
    const gradePath = path.join(SOURCE_ROOT, `Lop_${String(grade).padStart(2, '0')}`);
    for (const chapter of listDirectories(gradePath)) {
      const chapterOrder = chapterNumber(chapter.name);
      if (!chapterOrder || (grade === 5 && chapterOrder > 2)) continue;

      const chapterKey = `${grade}:${chapterOrder}`;
      const lessonMap = new Map();
      for (const lessonFolder of listDirectories(chapter.fullPath)) {
        const key = lessonKey(grade, lessonFolder.name);
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
       AND (c.grade < 5 OR c.sort_order <= 2)
     ORDER BY c.grade, c.sort_order, l.sort_order, l.id`
  );
}

function parseCards(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (Buffer.isBuffer(value)) value = value.toString('utf8');
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

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

function buildManifest(rows, source) {
  const entries = [];
  const missing = [];
  const usedFolders = new Set();

  for (const row of rows) {
    const chapter = source.chapters.get(`${row.grade}:${row.chapter_order}`);
    const key = lessonKey(row.grade, row.lesson_name);
    const folder = chapter?.lessons.get(key);
    const images = folder?.images || [];
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
    if (!imageEntries.length) missing.push(entry);
  }

  const unusedFolders = [];
  for (const chapter of source.chapters.values()) {
    for (const folder of chapter.lessons.values()) {
      if (!usedFolders.has(folder.fullPath)) {
        unusedFolders.push(path.relative(SOURCE_ROOT, folder.fullPath));
      }
    }
  }

  return { entries, missing, unusedFolders };
}

function hydrateGeneratedImages(manifest) {
  for (const entry of manifest.entries) {
    if (entry.images.length) continue;
    const generated = targetInfo(entry, 'theory.png', 0);
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

function cardsWithImages(rawCards, entry) {
  const cards = parseCards(rawCards).map((card) => ({ ...card, images: [] }));
  if (!entry.images.length) return cards;

  const availableCards = cards.length ? cards : [{
    id: 'card-1',
    type: 'concept',
    layout: 'visual_top',
    title: entry.title,
    display_text: '',
    body: `Quan sát thẻ lý thuyết để ghi nhớ kiến thức trọng tâm của bài ${entry.title}.`,
    formulas: [],
    formula: '',
    example: '',
    student_task: '',
    remember: '',
    interaction: 'none',
    grid_layout: { enabled: false },
    images: []
  }];

  entry.images.forEach((image, index) => {
    const cardIndex = availableCards.length > 1 ? Math.min(index, availableCards.length - 1) : 0;
    availableCards[cardIndex].images.push(theoryImage(image, index, entry));
    availableCards[cardIndex].layout = 'visual_top';
  });
  return availableCards;
}

function writeReports(manifest) {
  const generated = manifest.entries.filter((entry) => entry.status === 'GENERATED');
  const payload = {
    generated_at: new Date().toISOString(),
    source_root: SOURCE_ROOT,
    scope: 'Grades 1-4 all chapters; Grade 5 chapters 1-2 only',
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

function copyImages(entries) {
  let copied = 0;
  for (const entry of entries) {
    for (const image of entry.images) {
      fs.mkdirSync(path.dirname(image.target_path), { recursive: true });
      if (path.resolve(image.source_path) !== path.resolve(image.target_path)) {
        fs.copyFileSync(image.source_path, image.target_path);
      }
      copied += 1;
    }
  }
  return copied;
}

async function importMappedImages(rows, entries) {
  const byLesson = new Map(entries.map((entry) => [entry.lesson_id, entry]));
  const updates = rows
    .map((row) => ({ row, entry: byLesson.get(Number(row.lesson_id)) }))
    .filter(({ entry }) => entry?.images.length);

  await db.transaction(async (connection) => {
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

async function main() {
  const args = new Set(process.argv.slice(2));
  const rows = await curriculumRows();
  const source = sourceIndex();
  const manifest = hydrateGeneratedImages(buildManifest(rows, source));
  writeReports(manifest);

  let copied = 0;
  let imported = 0;
  if (args.has('--commit')) {
    copied = copyImages(manifest.entries);
    imported = await importMappedImages(rows, manifest.entries);
  }

  console.log(JSON.stringify({
    mode: args.has('--commit') ? 'commit' : 'dry-run',
    lesson_count: manifest.entries.length,
    mapped_lesson_count: manifest.entries.length - manifest.missing.length,
    missing_lesson_count: manifest.missing.length,
    image_count: manifest.entries.reduce((sum, entry) => sum + entry.images.length, 0),
    copied_image_count: copied,
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
