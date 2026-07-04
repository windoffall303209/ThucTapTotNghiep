require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');

const db = require('../config/db');

const ROOT = path.join(__dirname, '..');

function parseArgs(argv) {
  const args = {
    input: path.join(ROOT, 'output', 'doc', 'crawled_questions_structured_source.json'),
    output: path.join(ROOT, 'output', 'doc', 'crawled_questions_structured_mapping.json'),
    minScore: 45
  };

  for (const arg of argv) {
    if (arg.startsWith('--input=')) args.input = path.resolve(arg.split('=').slice(1).join('='));
    else if (arg.startsWith('--output=')) args.output = path.resolve(arg.split('=').slice(1).join('='));
    else if (arg.startsWith('--min-score=')) args.minScore = Number(arg.split('=')[1] || args.minScore);
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

function buildMappingForLesson(crawledLesson, lessons, minScore) {
  const candidates = lessons
    .filter((lesson) => Number(lesson.grade) === Number(crawledLesson.grade))
    .map((lesson) => {
      const score = Math.max(
        scoreLesson(crawledLesson.title, lesson.lesson_name),
        scoreLesson(crawledLesson.title, `${lesson.chapter_name} ${lesson.lesson_name}`)
      );
      return { ...lesson, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = candidates[0] || null;
  const second = candidates[1] || null;
  const riskFlags = [];

  if (!best || best.score < minScore) {
    riskFlags.push('unmatched');
  } else {
    const margin = second ? best.score - second.score : best.score;
    const sourceNo = lessonNumber(crawledLesson.title);
    const bestNo = lessonNumber(best.lesson_name);
    if (best.score < 70) riskFlags.push('low_score');
    if (second && margin <= 8) riskFlags.push('ambiguous_match');
    if (sourceNo && bestNo && sourceNo !== bestNo) riskFlags.push('lesson_number_mismatch');
  }

  return {
    sourceUrl: crawledLesson.url,
    grade: crawledLesson.grade,
    sourceChapter: crawledLesson.chapter,
    sourceLesson: crawledLesson.title,
    questionCount: (crawledLesson.questions || []).length,
    bestMatch: best
      ? {
          lessonId: best.lesson_id,
          lessonName: best.lesson_name,
          chapterId: best.chapter_id,
          chapterName: best.chapter_name,
          grade: best.grade,
          score: best.score
        }
      : null,
    secondMatch: second
      ? {
          lessonId: second.lesson_id,
          lessonName: second.lesson_name,
          chapterName: second.chapter_name,
          score: second.score
        }
      : null,
    riskFlags,
    reviewStatus: riskFlags.length === 0 ? 'OK' : 'Cần duyệt lại'
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const payload = JSON.parse(await fs.readFile(options.input, 'utf8'));
  const lessons = await loadDbLessons();
  const mappings = {};

  for (const crawledLesson of payload.lessons || []) {
    mappings[crawledLesson.url] = buildMappingForLesson(crawledLesson, lessons, options.minScore);
  }

  const values = Object.values(mappings);
  const report = {
    generatedAt: new Date().toISOString(),
    input: options.input,
    minScore: options.minScore,
    summary: {
      totalLessons: values.length,
      okLessons: values.filter((item) => item.riskFlags.length === 0).length,
      reviewLessons: values.filter((item) => item.riskFlags.length > 0).length,
      unmatchedLessons: values.filter((item) => item.riskFlags.includes('unmatched')).length
    },
    mappings
  };

  await fs.mkdir(path.dirname(options.output), { recursive: true });
  await fs.writeFile(options.output, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`Mapping: ${options.output}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).then(() => process.exit(0));
