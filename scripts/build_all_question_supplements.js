/* eslint-disable no-console */
require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');

const db = require('../config/db');
const {
  DIFFICULTY_PATTERN_17,
  buildGrade5ReviewQuestions,
  compositeQuestion,
  manualQuestion
} = require('../utils/supplementQuestionFactory');

const ROOT = path.resolve(__dirname, '..');
const MANUAL_DIR = path.join(ROOT, 'data', 'manual_question_batches');
const OUTPUT_DIR = path.join(ROOT, 'database', 'question_supplements', 'generated');
const IMAGE_ROOT = path.join(ROOT, 'public', 'images', 'question-supplements', 'generated');

function parseGrade(argv) {
  const flag = argv.find((arg) => arg.startsWith('--grade='));
  const grade = Number(flag?.slice('--grade='.length));
  if (![1, 3, 4, 5].includes(grade)) {
    throw new Error('Phải truyền --grade=1, --grade=3, --grade=4 hoặc --grade=5');
  }
  return grade;
}

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function xmlEscape(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapText(value, maxChars = 68) {
  const words = String(value || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function visualIcon(type, x, y) {
  if (type === 'geometry') {
    return `<rect x="${x}" y="${y}" width="118" height="82" rx="8" fill="#DBEAFE" stroke="#2563EB" stroke-width="5"/><circle cx="${x + 168}" cy="${y + 41}" r="40" fill="#FDE68A" stroke="#D97706" stroke-width="5"/>`;
  }
  if (type === 'chart') {
    return [34, 62, 91, 48].map((height, index) => `<rect x="${x + index * 42}" y="${y + 100 - height}" width="28" height="${height}" rx="5" fill="${['#60A5FA', '#34D399', '#FBBF24', '#F87171'][index]}"/>`).join('');
  }
  if (type === 'clock') {
    return `<circle cx="${x + 75}" cy="${y + 58}" r="54" fill="#FFFFFF" stroke="#2563EB" stroke-width="6"/><path d="M ${x + 75} ${y + 58} L ${x + 75} ${y + 25} M ${x + 75} ${y + 58} L ${x + 105} ${y + 76}" stroke="#0F172A" stroke-width="7" stroke-linecap="round"/>`;
  }
  if (type === 'fraction') {
    return `<circle cx="${x + 70}" cy="${y + 58}" r="54" fill="#E0F2FE" stroke="#0369A1" stroke-width="5"/><path d="M ${x + 70} ${y + 58} L ${x + 70} ${y + 4} A 54 54 0 0 1 ${x + 124} ${y + 58} Z" fill="#F97316"/><line x1="${x + 70}" y1="${y + 4}" x2="${x + 70}" y2="${y + 112}" stroke="#0369A1" stroke-width="4"/>`;
  }
  if (type === 'measurement') {
    return `<rect x="${x}" y="${y + 30}" width="180" height="52" rx="8" fill="#FEF3C7" stroke="#D97706" stroke-width="5"/>${Array.from({ length: 10 }, (_, i) => `<line x1="${x + 10 + i * 17}" y1="${y + 30}" x2="${x + 10 + i * 17}" y2="${y + (i % 2 ? 48 : 58)}" stroke="#92400E" stroke-width="3"/>`).join('')}`;
  }
  return `<circle cx="${x + 42}" cy="${y + 56}" r="38" fill="#DBEAFE"/><circle cx="${x + 103}" cy="${y + 56}" r="38" fill="#DCFCE7"/><circle cx="${x + 164}" cy="${y + 56}" r="38" fill="#FEF3C7"/>`;
}

function cardSvg(question, grade, lesson) {
  const width = 1200;
  const height = 675;
  const visual = question.visual || { type: 'numbers', title: 'BÀI TOÁN', lines: [question.content.text] };
  const panels = visual.type === 'two_panel' ? visual.lines : [visual.lines.join(' ')];
  const panelHeight = panels.length === 2 ? 205 : 285;
  const panelStart = panels.length === 2 ? 170 : 205;
  const panelGap = 20;
  let panelMarkup = '';
  panels.forEach((text, panelIndex) => {
    const y = panelStart + panelIndex * (panelHeight + panelGap);
    const lines = wrapText(text, panels.length === 2 ? 55 : 58).slice(0, panels.length === 2 ? 5 : 7);
    panelMarkup += `<rect x="58" y="${y}" width="1084" height="${panelHeight}" rx="24" fill="#FFFFFF" stroke="#BFDBFE" stroke-width="3"/>`;
    if (panels.length === 2) {
      panelMarkup += `<circle cx="102" cy="${y + 48}" r="27" fill="#2563EB"/><text x="102" y="${y + 58}" text-anchor="middle" font-size="28" font-weight="700" fill="#FFFFFF">${panelIndex + 1}</text>`;
    } else {
      panelMarkup += visualIcon(visual.type, 85, y + 50);
    }
    const textX = panels.length === 2 ? 150 : 315;
    const textY = y + 54;
    lines.forEach((line, lineIndex) => {
      panelMarkup += `<text x="${textX}" y="${textY + lineIndex * 36}" font-family="Arial, sans-serif" font-size="26" font-weight="${lineIndex === 0 ? 700 : 500}" fill="#172554">${xmlEscape(line)}</text>`;
    });
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="1200" height="675" fill="#EFF6FF"/>
    <rect x="0" y="0" width="1200" height="112" fill="#1D4ED8"/>
    <text x="58" y="47" font-family="Arial, sans-serif" font-size="23" font-weight="700" fill="#BFDBFE">TOÁN LỚP ${grade} • ${xmlEscape(lesson.chapter_name)}</text>
    <text x="58" y="86" font-family="Arial, sans-serif" font-size="31" font-weight="700" fill="#FFFFFF">${xmlEscape(visual.title)}</text>
    <text x="1142" y="67" text-anchor="end" font-family="Arial, sans-serif" font-size="21" fill="#DBEAFE">${xmlEscape(lesson.lesson_name)}</text>
    ${panelMarkup}
    <rect x="58" y="625" width="1084" height="2" fill="#BFDBFE"/>
    <text x="58" y="653" font-family="Arial, sans-serif" font-size="18" fill="#475569">Đọc đủ dữ kiện trong hình trước khi chọn đáp án.</text>
  </svg>`;
}

async function writeQuestionImage(question, grade, lesson) {
  const sharp = require('sharp');
  const image = question.content.images[0];
  const relative = image.url.replace(/^\/+/, '').split('/').join(path.sep);
  const absolute = path.join(ROOT, 'public', relative);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  await sharp(Buffer.from(cardSvg(question, grade, lesson)))
    .png({ compressionLevel: 9, palette: true, quality: 90 })
    .toFile(absolute);
  return absolute;
}

async function curriculumRows(grade) {
  return db.query(
    `SELECT c.grade, c.id AS chapter_id, c.chapter_name, c.sort_order AS chapter_order,
            l.id AS lesson_id, l.lesson_name, l.sort_order AS lesson_order,
            COUNT(q.id) AS question_count,
            SUM(CASE WHEN q.difficulty IN ('HARD','EXPERT') THEN 1 ELSE 0 END) AS hard_count
     FROM Chapters c
     JOIN Lessons l ON l.chapter_id = c.id
     LEFT JOIN QuestionBank q ON q.lesson_id = l.id AND q.is_active = 1
     WHERE c.grade = ?
     GROUP BY c.grade, c.id, c.chapter_name, c.sort_order, l.id, l.lesson_name, l.sort_order
     ORDER BY c.sort_order, l.sort_order`,
    [grade]
  );
}

async function sourceQuestions(lessonIds) {
  if (!lessonIds.length) return new Map();
  const placeholders = lessonIds.map(() => '?').join(', ');
  const rows = await db.query(
    `SELECT id, lesson_id, difficulty, content, choices, correct_answer, explanation
     FROM QuestionBank
     WHERE is_active = 1
       AND question_type = 'MULTIPLE_CHOICE'
       AND JSON_LENGTH(choices) = 4
       AND JSON_LENGTH(JSON_EXTRACT(content, '$.images')) = 0
       AND lesson_id IN (${placeholders})
     ORDER BY FIELD(difficulty, 'MEDIUM', 'EASY', 'HARD', 'EXPERT'),
              CHAR_LENGTH(JSON_UNQUOTE(JSON_EXTRACT(content, '$.text'))), id`,
    lessonIds
  );
  const byLesson = new Map();
  for (const row of rows) {
    row.content = parseJson(row.content, { text: '', images: [] });
    row.choices = parseJson(row.choices, []);
    row.explanation = parseJson(row.explanation, { text: '', images: [] });
    if (!byLesson.has(Number(row.lesson_id))) byLesson.set(Number(row.lesson_id), []);
    byLesson.get(Number(row.lesson_id)).push(row);
  }
  return byLesson;
}

function readManualQuestions() {
  const result = new Map();
  for (const filename of fs.readdirSync(MANUAL_DIR).filter((name) => name.endsWith('.json'))) {
    const payload = JSON.parse(fs.readFileSync(path.join(MANUAL_DIR, filename), 'utf8'));
    for (const question of payload.questions || []) {
      const lessonNumber = Number(question.lesson);
      if (!result.has(lessonNumber)) result.set(lessonNumber, []);
      result.get(lessonNumber).push(question);
    }
  }
  return result;
}

function textbookLessonNumber(lessonName) {
  const match = String(lessonName || '').match(/Bài\s+(\d+)/i);
  return Number(match?.[1] || 0);
}

async function questionsForGrade(grade, lessons) {
  if ([1, 3, 4].includes(grade)) {
    const blocked = lessons.filter((lesson) => Number(lesson.hard_count) === 0);
    const sources = await sourceQuestions(blocked.map((lesson) => Number(lesson.lesson_id)));
    return blocked.map((lesson) => {
      const candidates = sources.get(Number(lesson.lesson_id)) || [];
      if (candidates.length < 2) throw new Error(`Bài ${lesson.lesson_id} không có đủ hai câu nguồn tự chứa`);
      const sourceKey = `SUP-20260807-G${grade}-L${String(lesson.lesson_id).padStart(3, '0')}-H01`;
      const imageUrl = `/images/question-supplements/generated/grade-${grade}/lesson-${String(lesson.lesson_id).padStart(3, '0')}/hard-01.png`;
      return { lesson, questions: [compositeQuestion({ grade, lesson, first: candidates[0], second: candidates[1], sourceKey, imageUrl })] };
    });
  }

  const manual = readManualQuestions();
  return lessons
    .filter((lesson) => Number(lesson.question_count) < 20)
    .map((lesson) => {
      const lessonId = Number(lesson.lesson_id);
      const lessonNumber = textbookLessonNumber(lesson.lesson_name);
      const manualItems = manual.get(lessonNumber) || [];
      if (lessonId <= 382 && manualItems.length >= 20) {
        const questions = manualItems.slice(3, 20).map((item, index) => {
          const sourceKey = `SUP-20260807-G5-L${String(lessonId).padStart(3, '0')}-M${String(item.number).padStart(2, '0')}`;
          const imageUrl = `/images/question-supplements/generated/grade-5/lesson-${String(lessonId).padStart(3, '0')}/q-${String(index + 1).padStart(2, '0')}.png`;
          return manualQuestion({ lessonId, manual: item, difficulty: DIFFICULTY_PATTERN_17[index], sourceKey, imageUrl });
        });
        return { lesson, questions };
      }
      return { lesson, questions: buildGrade5ReviewQuestions(lessonId, 20 - Number(lesson.question_count)) };
    });
}

async function buildGrade(grade) {
  const lessons = await curriculumRows(grade);
  const lessonGroups = await questionsForGrade(grade, lessons);
  const questions = [];
  for (const group of lessonGroups) {
    for (const question of group.questions) {
      await writeQuestionImage(question, grade, group.lesson);
      questions.push(question);
    }
  }

  const chapterMap = new Map();
  for (const group of lessonGroups) {
    const chapterId = Number(group.lesson.chapter_id);
    if (!chapterMap.has(chapterId)) {
      chapterMap.set(chapterId, {
        chapter_id: chapterId,
        chapter_name: group.lesson.chapter_name,
        lessons: []
      });
    }
    chapterMap.get(chapterId).lessons.push({
      lesson_id: Number(group.lesson.lesson_id),
      lesson_name: group.lesson.lesson_name,
      added_questions: group.questions.length
    });
  }

  const payload = {
    batch_id: `20260807-GRADE-${grade}-COMPLETE-SUPPLEMENT`,
    title: `Bổ sung câu hỏi lớp ${grade}`,
    generated_at: new Date().toISOString(),
    strategy: grade === 5
      ? 'Bổ sung đủ 20 câu cho các bài còn thiếu; cơ cấu thêm 9 EASY, 6 MEDIUM, 2 HARD.'
      : 'Mỗi bài thiếu HARD được bổ sung một thử thách hai ý thuộc đúng bài học.',
    chapters: [...chapterMap.values()],
    questions
  };
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const output = path.join(OUTPUT_DIR, `grade-${grade}.json`);
  fs.writeFileSync(output, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return { output, lessons: lessonGroups.length, questions: questions.length };
}

async function main() {
  try {
    const connection = await db.testConnection();
    if (!connection.connected) throw new Error(`Không kết nối được database: ${connection.reason}`);
    const grade = parseGrade(process.argv.slice(2));
    console.log(JSON.stringify(await buildGrade(grade), null, 2));
  } finally {
    await db.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  cardSvg,
  parseGrade,
  wrapText,
  xmlEscape
};
