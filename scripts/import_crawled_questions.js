require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const db = require('../config/db');
const Question = require('../models/Question');

const ROOT = path.join(__dirname, '..');
const DEFAULT_INPUT = path.join(ROOT, 'output', 'doc', 'crawled_questions.json');
const DEFAULT_IMAGE_DIR = path.join(ROOT, 'output', 'doc', 'images');
const DEFAULT_PUBLIC_IMAGE_DIR = path.join(ROOT, 'public', 'uploads', 'images', 'crawled');
const DEFAULT_REPORT = path.join(ROOT, 'output', 'doc', 'import_crawled_questions_report.json');

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
    allowDuplicates: false
  };

  for (const arg of argv) {
    if (arg === '--commit') args.commit = true;
    else if (arg === '--replace') args.replace = true;
    else if (arg === '--allow-duplicates') args.allowDuplicates = true;
    else if (arg.startsWith('--input=')) args.input = path.resolve(arg.split('=').slice(1).join('='));
    else if (arg.startsWith('--image-dir=')) args.imageDir = path.resolve(arg.split('=').slice(1).join('='));
    else if (arg.startsWith('--public-image-dir=')) args.publicImageDir = path.resolve(arg.split('=').slice(1).join('='));
    else if (arg.startsWith('--report=')) args.report = path.resolve(arg.split('=').slice(1).join('='));
    else if (arg.startsWith('--image-mode=')) args.imageMode = arg.split('=')[1] || args.imageMode;
    else if (arg.startsWith('--min-score=')) args.minScore = Number(arg.split('=')[1] || args.minScore);
    else if (arg.startsWith('--limit=')) args.limit = Number(arg.split('=')[1] || 0);
    else if (arg.startsWith('--grade=')) args.grade = Number(arg.split('=')[1] || 0);
  }

  if (args.replace) {
    args.commit = true;
    args.allowDuplicates = true;
  }

  if (!['local', 'remote'].includes(args.imageMode)) {
    throw new Error('--image-mode chỉ nhận local hoặc remote.');
  }

  return args;
}

function stripDiacritics(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

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

function lessonNumber(value) {
  const match = normalizeName(value).match(/\bbai\s+(\d+)\b/);
  return match ? Number(match[1]) : null;
}

function tokenSet(value) {
  const stopWords = new Set(['bai', 'tap', 'luyen', 'chung', 'on', 'nhung', 'gi', 'da', 'hoc', 'em']);
  return new Set(
    normalizeName(value)
      .split(' ')
      .filter((token) => token.length > 1 && !stopWords.has(token))
  );
}

function scoreLesson(crawledTitle, dbLessonName) {
  const crawled = normalizeName(crawledTitle);
  const dbName = normalizeName(dbLessonName);
  if (!crawled || !dbName) return 0;
  if (crawled === dbName) return 100;
  if (crawled.includes(dbName) || dbName.includes(crawled)) return 92;

  const crawledTokens = tokenSet(crawledTitle);
  const dbTokens = tokenSet(dbLessonName);
  const intersection = [...crawledTokens].filter((token) => dbTokens.has(token)).length;
  const union = new Set([...crawledTokens, ...dbTokens]).size || 1;
  let score = Math.round((intersection / union) * 80);

  const crawledNumber = lessonNumber(crawledTitle);
  const dbNumber = lessonNumber(dbLessonName);
  if (crawledNumber && dbNumber && crawledNumber === dbNumber) score += 20;
  if (crawledNumber && dbNumber && crawledNumber !== dbNumber) score -= 20;

  return Math.max(0, Math.min(100, score));
}

function findBestLesson(crawledLesson, lessons, minScore) {
  const candidates = lessons.filter((lesson) => Number(lesson.grade) === Number(crawledLesson.grade));
  let best = null;

  for (const lesson of candidates) {
    const score = Math.max(
      scoreLesson(crawledLesson.title, lesson.lesson_name),
      scoreLesson(crawledLesson.title, `${lesson.chapter_name} ${lesson.lesson_name}`)
    );
    if (!best || score > best.score) {
      best = { ...lesson, score };
    }
  }

  return best && best.score >= minScore ? best : null;
}

function difficultyForIndex(index) {
  if (index % 5 === 0) return 'HARD';
  if (index % 2 === 0) return 'MEDIUM';
  return 'EASY';
}

function sha1(value) {
  return crypto.createHash('sha1').update(value).digest('hex');
}

async function buildImageFileCache(imageDir) {
  const entries = await fs.readdir(imageDir).catch(() => []);
  const cache = new Map();
  for (const entry of entries) {
    const key = entry.split('.')[0];
    if (!cache.has(key)) {
      cache.set(key, path.join(imageDir, entry));
    }
  }
  return cache;
}

async function findCachedImage(options, imageUrl) {
  const prefix = sha1(imageUrl);
  if (!options.imageFileCache) {
    options.imageFileCache = await buildImageFileCache(options.imageDir);
  }
  return options.imageFileCache.get(prefix) || null;
}

async function mapImages(images, options) {
  const result = [];
  await fs.mkdir(options.publicImageDir, { recursive: true });

  for (let index = 0; index < (images || []).length; index += 1) {
    const image = images[index];
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

function normalizeChoices(choices) {
  return (choices || [])
    .filter((choice) => choice && choice.key && String(choice.text || '').trim())
    .map((choice) => ({
      key: String(choice.key).trim().toUpperCase(),
      text: String(choice.text || '').trim()
    }));
}

function isImportableQuestion(question) {
  const choices = normalizeChoices(question.choices);
  return Boolean(question.text && choices.length >= 2 && question.correct_answer);
}

async function questionExists(lessonId, questionText) {
  const rows = await db.query(
    `SELECT id
     FROM QuestionBank
     WHERE lesson_id = ?
       AND JSON_UNQUOTE(JSON_EXTRACT(content, '$.text')) = ?
     LIMIT 1`,
    [lessonId, questionText]
  );
  return rows[0] || null;
}

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

async function writeReport(reportPath, report) {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
}

async function resetQuestionData() {
  await db.transaction(async (connection) => {
    await connection.execute('DELETE FROM PracticeSessionChats');
    await connection.execute('DELETE FROM PracticeSessions');
    await connection.execute("DELETE FROM AIConversationLogs WHERE session_type = 'EXERCISE_HELP'");
    await connection.execute('DELETE FROM StudentLogs');
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

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const raw = await fs.readFile(options.input, 'utf8');
  const payload = JSON.parse(raw);

  const connection = await db.testConnection();
  if (!connection.connected) {
    throw new Error(`Không kết nối được MySQL: ${connection.reason || 'missing_config'}`);
  }

  const lessons = await loadDbLessons();
  const crawledLessons = (payload.lessons || [])
    .filter((lesson) => !options.grade || Number(lesson.grade) === Number(options.grade));

  if (options.replace) {
    await resetQuestionData();
  }

  const report = {
    mode: options.commit ? 'commit' : 'dry-run',
    replace: options.replace,
    input: options.input,
    imageMode: options.imageMode,
    minScore: options.minScore,
    totalCrawledLessons: crawledLessons.length,
    matchedLessons: 0,
    unmatchedLessons: [],
    skippedQuestions: [],
    duplicateQuestions: 0,
    insertedQuestions: 0,
    wouldInsertQuestions: 0,
    copiedImages: 0,
    startedAt: new Date().toISOString()
  };

  let processedQuestions = 0;

  for (const crawledLesson of crawledLessons) {
    const matchedLesson = findBestLesson(crawledLesson, lessons, options.minScore);
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

    for (let index = 0; index < (crawledLesson.questions || []).length; index += 1) {
      if (options.limit && processedQuestions >= options.limit) break;
      const question = crawledLesson.questions[index];
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
      if (!options.allowDuplicates) {
        const duplicate = await questionExists(matchedLesson.lesson_id, contentText);
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
      if (options.commit) {
        report.copiedImages += explanationImages.filter((image) => image.url.startsWith('/uploads/images/crawled/')).length;
      }

      const importPayload = {
        lesson_id: matchedLesson.lesson_id,
        question_type: 'MULTIPLE_CHOICE',
        difficulty: difficultyForIndex(index + 1),
        layout_template: 'STACK_VERTICAL',
        content: {
          text: contentText,
          images
        },
        choices: normalizeChoices(question.choices),
        correct_answer: String(question.correct_answer || '').trim().toUpperCase(),
        explanation: {
          text: String(question.explanation || 'Chưa có lời giải chi tiết.').trim() || 'Chưa có lời giải chi tiết.',
          images: explanationImages
        },
        misconceptions: []
      };

      if (options.commit) {
        await Question.createQuestion(importPayload);
        report.insertedQuestions += 1;
      } else {
        report.wouldInsertQuestions += 1;
      }

      processedQuestions += 1;
    }

    if (options.limit && processedQuestions >= options.limit) break;
  }

  report.finishedAt = new Date().toISOString();
  await writeReport(options.report, report);

  console.log('Hoàn tất kiểm tra/import câu hỏi crawl.');
  console.log(`Chế độ: ${options.commit ? 'GHI DATABASE' : 'DRY-RUN, chưa ghi database'}`);
  console.log(`Bài match được: ${report.matchedLessons}/${report.totalCrawledLessons}`);
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
