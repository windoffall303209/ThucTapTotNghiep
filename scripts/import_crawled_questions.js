// Script import crawled questions h? tr? nh?p, xu?t, ki?m tra ho?c b?o tr? d? li?u v? c?u h?nh c?a d? ?n.
require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const db = require('../config/db');
const Question = require('../models/Question');
const { MIN_GRADE, MAX_GRADE, isSupportedGrade } = require('../config/grades');

const ROOT = path.join(__dirname, '..');
const DEFAULT_INPUT = path.join(ROOT, 'output', 'doc', 'crawled_questions.json');
const DEFAULT_IMAGE_DIR = path.join(ROOT, 'output', 'doc', 'images');
const DEFAULT_PUBLIC_IMAGE_DIR = path.join(ROOT, 'public', 'uploads', 'images', 'crawled');
const DEFAULT_REPORT = path.join(ROOT, 'output', 'doc', 'import_crawled_questions_report.json');

// H?m parseArgs d?ng ?? ph?n t?ch ??u v?o th?nh c?u tr?c c? th? s? d?ng; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT,
    imageDir: DEFAULT_IMAGE_DIR,
    publicImageDir: DEFAULT_PUBLIC_IMAGE_DIR,
    report: DEFAULT_REPORT,
    imageMode: 'local',
    minScore: 45,
    limit: 0,
    grade: 0,
    commit: false,
    replace: false,
    reset: false,
    destroyHistory: false,
    backupConfirmed: false,
    allowDuplicates: false
  };

  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const arg of argv) {
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (arg === '--commit') args.commit = true;
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    else if (arg === '--replace') {
      args.replace = true;
      args.reset = true;
    } else if (arg === '--reset') args.reset = true;
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    else if (arg === '--destroy-history') args.destroyHistory = true;
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    else if (arg === '--backup-confirmed') args.backupConfirmed = true;
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    else if (arg === '--allow-duplicates') args.allowDuplicates = true;
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    else if (arg.startsWith('--input=')) args.input = path.resolve(arg.split('=').slice(1).join('='));
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    else if (arg.startsWith('--image-dir=')) args.imageDir = path.resolve(arg.split('=').slice(1).join('='));
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    else if (arg.startsWith('--public-image-dir=')) args.publicImageDir = path.resolve(arg.split('=').slice(1).join('='));
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    else if (arg.startsWith('--report=')) args.report = path.resolve(arg.split('=').slice(1).join('='));
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    else if (arg.startsWith('--image-mode=')) args.imageMode = arg.split('=')[1] || args.imageMode;
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    else if (arg.startsWith('--min-score=')) args.minScore = Number(arg.split('=')[1] || args.minScore);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    else if (arg.startsWith('--limit=')) args.limit = Number(arg.split('=')[1] || 0);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    else if (arg.startsWith('--grade=')) args.grade = Number(arg.split('=')[1] || 0);
  }

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (args.reset) {
    args.commit = true;
    args.allowDuplicates = true;
  }

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (args.destroyHistory !== args.backupConfirmed) {
    throw new Error(
      'Xóa lịch sử bắt buộc phải có đồng thời --destroy-history và --backup-confirmed.'
    );
  }
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if ((args.destroyHistory || args.backupConfirmed) && !args.reset) {
    throw new Error(
      'Hai cờ xác nhận xóa lịch sử chỉ hợp lệ khi đi cùng --reset (hoặc --replace).'
    );
  }

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!['local', 'remote'].includes(args.imageMode)) {
    throw new Error('--image-mode chỉ nhận local hoặc remote.');
  }

  return args;
}

// H?m stripDiacritics d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function stripDiacritics(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

// H?m normalizeName d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function normalizeName(value) {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/^trac nghiem\s+/g, '')
    .replace(/^bai tap trac nghiem\s+/g, '')
    .replace(/\btoan lop \d+\b/g, '')
    .replace(/\bcanh dieu\b/g, '')
    .replace(/\bket noi tri thuc\b/g, '')
    .replace(/\bhoc ki \d+\b/g, '')
    .replace(/\btrang\s+\d+(,\s*\d+)*/g, '')
    .replace(/\bbai\s+(\d+)\s*[:.]\s*/g, 'bai $1 ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// H?m lessonNumber d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function lessonNumber(value) {
  const match = normalizeName(value).match(/\bbai\s+(\d+)\b/);
  return match ? Number(match[1]) : null;
}

// H?m tokenSet d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function tokenSet(value) {
  const stopWords = new Set(['bai', 'tap', 'luyen', 'chung', 'on', 'nhung', 'gi', 'da', 'hoc', 'em']);
  return new Set(
    normalizeName(value)
      .split(' ')
      .filter((token) => token.length > 1 && !stopWords.has(token))
  );
}

// H?m scoreLesson d?ng ?? t?nh to?n k?t qu? t? c?c tham s? ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function scoreLesson(crawledTitle, dbLessonName) {
  const crawled = normalizeName(crawledTitle);
  const dbName = normalizeName(dbLessonName);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!crawled || !dbName) return 0;
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (crawled === dbName) return 100;
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (crawled.includes(dbName) || dbName.includes(crawled)) return 92;

  const crawledTokens = tokenSet(crawledTitle);
  const dbTokens = tokenSet(dbLessonName);
  const intersection = [...crawledTokens].filter((token) => dbTokens.has(token)).length;
  const union = new Set([...crawledTokens, ...dbTokens]).size || 1;
  let score = Math.round((intersection / union) * 80);

  const crawledNumber = lessonNumber(crawledTitle);
  const dbNumber = lessonNumber(dbLessonName);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (crawledNumber && dbNumber && crawledNumber === dbNumber) score += 20;
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (crawledNumber && dbNumber && crawledNumber !== dbNumber) score -= 20;

  return Math.max(0, Math.min(100, score));
}

// H?m findBestLesson d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function findBestLesson(crawledLesson, lessons, minScore) {
  const candidates = lessons.filter((lesson) => Number(lesson.grade) === Number(crawledLesson.grade));
  let best = null;

  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const lesson of candidates) {
    const score = Math.max(
      scoreLesson(crawledLesson.title, lesson.lesson_name),
      scoreLesson(crawledLesson.title, `${lesson.chapter_name} ${lesson.lesson_name}`)
    );
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!best || score > best.score) {
      best = { ...lesson, score };
    }
  }

  return best && best.score >= minScore ? best : null;
}

// H?m difficultyForIndex d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function difficultyForIndex(index) {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (index % 5 === 0) return 'HARD';
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (index % 2 === 0) return 'MEDIUM';
  return 'EASY';
}

// H?m sha1 d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function sha1(value) {
  return crypto.createHash('sha1').update(value).digest('hex');
}

// H?m buildImageFileCache d?ng ?? x?y d?ng k?t qu? t? c?c ngu?n d? li?u v? quy t?c li?n quan; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function buildImageFileCache(imageDir) {
  const entries = await fs.readdir(imageDir).catch(() => []);
  const cache = new Map();
  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const entry of entries) {
    const key = entry.split('.')[0];
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!cache.has(key)) {
      cache.set(key, path.join(imageDir, entry));
    }
  }
  return cache;
}

// H?m findCachedImage d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function findCachedImage(options, imageUrl) {
  const prefix = sha1(imageUrl);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!options.imageFileCache) {
    options.imageFileCache = await buildImageFileCache(options.imageDir);
  }
  return options.imageFileCache.get(prefix) || null;
}

// H?m mapImages d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function mapImages(images, options) {
  const result = [];
  await fs.mkdir(options.publicImageDir, { recursive: true });

  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (let index = 0; index < (images || []).length; index += 1) {
    const image = images[index];
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (options.imageMode === 'remote') {
      result.push({
        id: `img-${index + 1}`,
        url: image.url,
        alt: image.alt || '',
        width: image.width || '',
        height: image.height || '',
        source_url: image.url
      });
      continue;
    }

    const cachedPath = await findCachedImage(options, image.url);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!cachedPath) {
      result.push({
        id: `img-${index + 1}`,
        url: image.url,
        alt: image.alt || '',
        width: image.width || '',
        height: image.height || '',
        source_url: image.url,
        missing_local_cache: true
      });
      continue;
    }

    const targetName = path.basename(cachedPath);
    const targetPath = path.join(options.publicImageDir, targetName);
    await fs.copyFile(cachedPath, targetPath).catch(async (error) => {
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (error.code !== 'EEXIST') throw error;
    });

    result.push({
      id: `img-${index + 1}`,
      url: `/uploads/images/crawled/${targetName}`,
      alt: image.alt || '',
      width: image.width || '',
      height: image.height || '',
      source_url: image.url
    });
  }

  return result;
}

// H?m normalizeChoices d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function normalizeChoices(choices) {
  return (choices || [])
    .filter((choice) => choice && choice.key && (String(choice.text || '').trim() || hasImages(choice.images)))
    .map((choice) => ({
      key: String(choice.key).trim().toUpperCase(),
      text: String(choice.text || '').trim(),
      images: normalizeImageMetadata(choice.images, `choice-${String(choice.key).trim().toUpperCase()}-image`, `Hình minh họa đáp án ${String(choice.key).trim().toUpperCase()}`)
    }));
}

// H?m hasImages d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function hasImages(images) {
  return Array.isArray(images) && images.some((image) => image?.url);
}

// H?m normalizeImageMetadata d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function normalizeImageMetadata(images, idPrefix, defaultAlt) {
  return (Array.isArray(images) ? images : [])
    .map((image, index) => ({
      id: String(image.id || `${idPrefix}-${index + 1}`),
      url: String(image.url || image.src || '').trim(),
      width_percent: normalizeWidthPercent(image.width_percent || image.width || 100),
      alt_text: String(image.alt_text || image.alt || defaultAlt || 'Hình minh họa').trim(),
      source_url: image.source_url || image.url || ''
    }))
    .filter((image) => image.url);
}

// H?m normalizeWidthPercent d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function normalizeWidthPercent(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(Math.max(Math.round(numeric), 20), 100) : 100;
}

// H?m inferLayoutTemplate d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function inferLayoutTemplate(question, contentImages, choices) {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (choices.some((choice) => hasImages(choice.images))) return 'IMAGE_IN_CHOICES';
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if ((contentImages || []).length > 0 && String(question.text || '').length > 140) return 'SPLIT_HORIZONTAL_LEFT_IMAGE';
  return 'STACK_VERTICAL';
}

// H?m normalizeMisconceptions d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function normalizeMisconceptions(question, choices) {
  const allowedWrongKeys = new Set(
    choices
      .map((choice) => choice.key)
      .filter((key) => key !== String(question.correct_answer || '').trim().toUpperCase())
  );

  return (Array.isArray(question.misconceptions) ? question.misconceptions : [])
    .map((item) => ({
      distractor_key: String(item.distractor_key || item.key || '').trim().toUpperCase(),
      misconception_name: String(item.misconception_name || item.name || 'Lỗi sai thường gặp').trim(),
      explanation: String(item.explanation || item.reason || '').trim()
    }))
    .filter((item) => allowedWrongKeys.has(item.distractor_key) && item.explanation);
}

// H?m isImportableQuestion d?ng ?? ??ng b? d? li?u gi?a c?c ??nh d?ng ho?c ngu?n kh?c nhau; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function isImportableQuestion(question) {
  const choices = normalizeChoices(question.choices);
  return Boolean(question.text && choices.length >= 2 && question.correct_answer);
}

// H?m questionExists d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function questionExists(lessonId, questionText) {
  const rows = await db.query(
    `SELECT id
     FROM QuestionBank
     WHERE lesson_id = ?
       AND is_active = 1
       AND JSON_UNQUOTE(JSON_EXTRACT(content, '$.text')) = ?
     LIMIT 1`,
    [lessonId, questionText]
  );
  return rows[0] || null;
}

// H?m loadDbLessons d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function loadDbLessons() {
  return db.query(
    `SELECT
        l.id AS lesson_id,
        l.lesson_name,
        c.id AS chapter_id,
        c.chapter_name,
        c.grade
     FROM Lessons l
     JOIN Chapters c ON c.id = l.chapter_id
     ORDER BY c.grade, c.sort_order, l.sort_order, l.id`
  );
}

// H?m writeReport d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function writeReport(reportPath, report) {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
}

// H?m archiveQuestionData d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function archiveQuestionData() {
  const result = await db.query(
    `UPDATE QuestionBank
     SET is_active = 0, archived_at = CURRENT_TIMESTAMP
     WHERE is_active = 1`
  );
  return Number(result.affectedRows || 0);
}

// H?m destroyQuestionHistory d?ng ?? x?a ho?c gi?i ph?ng t?i nguy?n theo ?i?u ki?n an to?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function destroyQuestionHistory() {
  await db.transaction(async (connection) => {
    await connection.execute('DELETE FROM PracticeSessionChats');
    await connection.execute("DELETE FROM AIConversationLogs WHERE session_type = 'EXERCISE_HELP'");
    await connection.execute('DELETE FROM StudentLogs');
    await connection.execute('DELETE FROM PracticeSessions');
    await connection.execute('DELETE FROM CommonMisconceptions');
    await connection.execute('DELETE FROM QuestionBank');
  });

  await Promise.allSettled([
    db.query('ALTER TABLE PracticeSessionChats AUTO_INCREMENT = 1'),
    db.query('ALTER TABLE PracticeSessions AUTO_INCREMENT = 1'),
    db.query('ALTER TABLE StudentLogs AUTO_INCREMENT = 1'),
    db.query('ALTER TABLE CommonMisconceptions AUTO_INCREMENT = 1'),
    db.query('ALTER TABLE QuestionBank AUTO_INCREMENT = 1')
  ]);
}

// H?m main d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function main() {
  const options = parseArgs(process.argv.slice(2));
  const raw = await fs.readFile(options.input, 'utf8');
  const payload = JSON.parse(raw);

  const connection = await db.testConnection();
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!connection.connected) {
    throw new Error(`Không kết nối được MySQL: ${connection.reason || 'missing_config'}`);
  }

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (options.grade && !isSupportedGrade(options.grade)) {
    throw new Error(`--grade chỉ hỗ trợ khối lớp từ ${MIN_GRADE} đến ${MAX_GRADE}.`);
  }

  const lessons = await loadDbLessons();
  const skippedOutOfScopeLessons = [];
  const crawledLessons = (payload.lessons || [])
    .filter((lesson) => {
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (!isSupportedGrade(lesson.grade)) {
        skippedOutOfScopeLessons.push({
          grade: lesson.grade,
          title: lesson.title,
          chapter: lesson.chapter,
          url: lesson.url
        });
        return false;
      }
      return !options.grade || Number(lesson.grade) === Number(options.grade);
    });

  let archivedQuestions = 0;
  const destructiveHistoryReset =
    options.reset && options.destroyHistory && options.backupConfirmed;
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (destructiveHistoryReset) {
    await destroyQuestionHistory();
    console.warn(
      'Đã xóa vĩnh viễn ngân hàng câu hỏi và lịch sử liên quan sau khi nhận đủ hai cờ xác nhận.'
    );
  } else if (options.reset) {
    archivedQuestions = await archiveQuestionData();
    console.log(`Đã lưu trữ ${archivedQuestions} câu hỏi đang hoạt động; lịch sử được giữ nguyên.`);
  }

  const report = {
    mode: options.commit ? 'commit' : 'dry-run',
    replace: options.replace,
    reset: options.reset,
    destructiveHistoryReset,
    archivedQuestions,
    input: options.input,
    imageMode: options.imageMode,
    minScore: options.minScore,
    totalCrawledLessons: crawledLessons.length,
    matchedLessons: 0,
    unmatchedLessons: [],
    skippedOutOfScopeLessons,
    skippedQuestions: [],
    duplicateQuestions: 0,
    insertedQuestions: 0,
    wouldInsertQuestions: 0,
    copiedImages: 0,
    startedAt: new Date().toISOString()
  };

  let processedQuestions = 0;

  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const crawledLesson of crawledLessons) {
    const matchedLesson = findBestLesson(crawledLesson, lessons, options.minScore);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!matchedLesson) {
      report.unmatchedLessons.push({
        grade: crawledLesson.grade,
        title: crawledLesson.title,
        chapter: crawledLesson.chapter,
        url: crawledLesson.url
      });
      continue;
    }

    report.matchedLessons += 1;

    // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
    for (let index = 0; index < (crawledLesson.questions || []).length; index += 1) {
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (options.limit && processedQuestions >= options.limit) break;
      const question = crawledLesson.questions[index];
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (!isImportableQuestion(question)) {
        report.skippedQuestions.push({
          reason: 'missing_text_choices_or_answer',
          lesson: crawledLesson.title,
          sourceUrl: crawledLesson.url,
          number: question.number
        });
        continue;
      }

      const contentText = String(question.text || '').trim();
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (!options.allowDuplicates) {
        const duplicate = await questionExists(matchedLesson.lesson_id, contentText);
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (duplicate) {
          report.duplicateQuestions += 1;
          continue;
        }
      }

      const images = options.commit
        ? await mapImages(question.images || [], options)
        : (question.images || []).map((image, imageIndex) => ({
            id: `img-${imageIndex + 1}`,
            url: image.url,
            alt: image.alt || '',
            width: image.width || '',
            height: image.height || '',
            source_url: image.url
          }));
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (options.commit) {
        report.copiedImages += images.filter((image) => image.url.startsWith('/uploads/images/crawled/')).length;
      }
      const explanationImages = options.commit
        ? await mapImages(question.explanation_images || [], options)
        : (question.explanation_images || []).map((image, imageIndex) => ({
            id: `explanation-img-${imageIndex + 1}`,
            url: image.url,
            alt: image.alt || '',
            width: image.width || '',
            height: image.height || '',
            source_url: image.url
          }));
      explanationImages.forEach((image, imageIndex) => {
        image.id = `explanation-img-${imageIndex + 1}`;
        image.alt_text = image.alt_text || image.alt || 'Hình minh họa lời giải';
      });
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (options.commit) {
        report.copiedImages += explanationImages.filter((image) => image.url.startsWith('/uploads/images/crawled/')).length;
      }

      const choices = normalizeChoices(question.choices);
      const importPayload = {
        lesson_id: matchedLesson.lesson_id,
        question_type: 'MULTIPLE_CHOICE',
        difficulty: difficultyForIndex(index + 1),
        layout_template: question.layout_template || inferLayoutTemplate(question, images, choices),
        content: {
          text: contentText,
          images: normalizeImageMetadata(images, 'image', 'Hình minh họa đề bài')
        },
        choices,
        correct_answer: String(question.correct_answer || '').trim().toUpperCase(),
        explanation: {
          text: String(question.explanation || 'Chưa có lời giải chi tiết.').trim() || 'Chưa có lời giải chi tiết.',
          images: normalizeImageMetadata(explanationImages, 'explanation-image', 'Hình minh họa lời giải')
        },
        misconceptions: normalizeMisconceptions(question, choices)
      };

      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (options.commit) {
        await Question.createQuestion(importPayload);
        report.insertedQuestions += 1;
      } else {
        report.wouldInsertQuestions += 1;
      }

      processedQuestions += 1;
    }

    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (options.limit && processedQuestions >= options.limit) break;
  }

  report.finishedAt = new Date().toISOString();
  await writeReport(options.report, report);

  console.log('Hoàn tất kiểm tra/import câu hỏi crawl.');
  console.log(`Chế độ: ${options.commit ? 'GHI DATABASE' : 'DRY-RUN, chưa ghi database'}`);
  console.log(`Bài match được: ${report.matchedLessons}/${report.totalCrawledLessons}`);
  console.log(`Bài ngoài phạm vi lớp ${MIN_GRADE}-${MAX_GRADE} đã bỏ qua: ${report.skippedOutOfScopeLessons.length}`);
  console.log(`Bài chưa match: ${report.unmatchedLessons.length}`);
  console.log(`Câu sẽ import: ${report.wouldInsertQuestions}`);
  console.log(`Câu đã import: ${report.insertedQuestions}`);
  console.log(`Câu trùng đã bỏ qua: ${report.duplicateQuestions}`);
  console.log(`Câu bị bỏ qua do thiếu dữ liệu: ${report.skippedQuestions.length}`);
  console.log(`Ảnh local đã copy: ${report.copiedImages}`);
  console.log(`Report: ${options.report}`);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Lỗi import câu hỏi crawl:', error.message);
    process.exit(1);
  });
