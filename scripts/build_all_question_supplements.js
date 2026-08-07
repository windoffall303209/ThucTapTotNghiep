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

function inferIllustrationType(text, preferred = '') {
  const value = String(text || '').toLowerCase();
  if (/đồng hồ|giờ|phút|giây|thời gian|thế kỉ|ngày|tháng/.test(value)) return 'clock';
  if (/biểu đồ|số liệu|thống kê|xác suất|phần trăm|%/.test(value)) return 'chart';
  if (/phân số|hỗn số|\d+\s*\/\s*\d+/.test(value)) return 'fraction';
  if (/hình|diện tích|chu vi|thể tích|đường kính|bán kính|khối|tam giác|tứ giác|góc|song song|vuông góc|bể|ngăn kéo/.test(value)) return 'geometry';
  if (/kg|gam|tấn|tạ|yến|mét|cm|mm|lít|độ dài|cân|đo|dây/.test(value)) return 'measurement';
  if (/nhân|chia|×| : |thùng|mỗi|gấp.*lần/.test(value)) return 'groups';
  return preferred && preferred !== 'two_panel' ? preferred : 'numbers';
}

function extractDataTokens(text) {
  const source = String(text || '')
    .replace(/bài\s+bổ\s+sung\s+số\s+\d+[.:]?/gi, '')
    .replace(/ý\s+\d+[.:]?/gi, '');
  const matches = source.match(/\d+(?:[ .]\d{3})*(?:[,.]\d+)?(?:\s*\/\s*\d+)?\s*(?:km|kg|cm|mm|m²|m³|m|g|lít|%|giờ|phút|giây|đồng|hộp|thùng|quyển)?/gi) || [];
  return [...new Set(matches.map((value) => value.trim()).filter(Boolean))].slice(0, 5);
}

function keyWords(text) {
  const value = String(text || '').toLowerCase();
  const words = [];
  for (const [pattern, label] of [
    [/hình vuông/, 'HÌNH VUÔNG'], [/hình tròn/, 'HÌNH TRÒN'], [/tam giác/, 'TAM GIÁC'],
    [/chữ nhật/, 'CHỮ NHẬT'], [/lập phương/, 'LẬP PHƯƠNG'], [/phân số/, 'PHÂN SỐ'],
    [/đồng hồ|thời gian/, 'THỜI GIAN'], [/biểu đồ/, 'BIỂU ĐỒ'], [/đo|mét|cm|mm/, 'ĐO LƯỜNG']
  ]) if (pattern.test(value)) words.push(label);
  return words.slice(0, 4);
}

function dataChips(text, x, y, maxWidth = 470) {
  const values = extractDataTokens(text);
  const labels = values.length ? values : keyWords(text);
  let cursor = x;
  let markup = '';
  for (const label of labels) {
    const width = Math.min(150, Math.max(66, label.length * 13 + 30));
    if (cursor + width > x + maxWidth) break;
    markup += `<rect x="${cursor}" y="${y}" width="${width}" height="42" rx="21" fill="#DBEAFE" stroke="#60A5FA" stroke-width="2"/>`;
    markup += `<text x="${cursor + width / 2}" y="${y + 29}" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#1E3A8A">${xmlEscape(label)}</text>`;
    cursor += width + 12;
  }
  return markup;
}

function numberScene(text, x, y, width, height) {
  const tokens = extractDataTokens(text);
  const values = tokens.length ? tokens : ['1', '2', '3'];
  const cards = values.slice(0, 4).map((value, index) => {
    const cardWidth = Math.min(165, Math.max(110, value.length * 17 + 42));
    const cx = x + 38 + index * Math.min(175, (width - 80) / Math.max(1, values.length));
    return `<g transform="translate(${cx} ${y + 40 + (index % 2) * 25}) rotate(${index % 2 ? 3 : -3})"><rect width="${cardWidth}" height="94" rx="18" fill="${['#DBEAFE', '#DCFCE7', '#FEF3C7', '#FCE7F3'][index]}" stroke="${['#2563EB', '#16A34A', '#D97706', '#DB2777'][index]}" stroke-width="4"/><text x="${cardWidth / 2}" y="61" text-anchor="middle" font-family="Arial, sans-serif" font-size="32" font-weight="700" fill="#172554">${xmlEscape(value)}</text></g>`;
  }).join('');
  const dots = Array.from({ length: 10 }, (_, index) => `<circle cx="${x + 65 + index * 46}" cy="${y + height - 42}" r="13" fill="${['#3B82F6', '#22C55E', '#F59E0B'][index % 3]}"/>`).join('');
  return `${cards}<path d="M ${x + 45} ${y + height - 80} H ${x + width - 40}" stroke="#93C5FD" stroke-width="5" stroke-linecap="round"/>${dots}`;
}

function groupScene(text, x, y, width, height) {
  const numbers = extractDataTokens(text).map((value) => Number(value.replace(/[^0-9]/g, ''))).filter(Number.isFinite);
  const columns = Math.max(3, Math.min(6, numbers[1] || numbers[0] || 4));
  const rows = 3;
  let markup = '';
  for (let row = 0; row < rows; row += 1) {
    markup += `<rect x="${x + 28}" y="${y + 24 + row * 82}" width="${width - 56}" height="66" rx="18" fill="${['#EFF6FF', '#F0FDF4', '#FFF7ED'][row]}" stroke="#BFDBFE" stroke-width="2"/>`;
    for (let col = 0; col < columns; col += 1) {
      markup += `<circle cx="${x + 72 + col * ((width - 144) / Math.max(1, columns - 1))}" cy="${y + 57 + row * 82}" r="18" fill="${['#3B82F6', '#22C55E', '#F59E0B'][row]}"/>`;
    }
  }
  return markup;
}

function measurementScene(text, x, y, width, height) {
  const value = String(text || '').toLowerCase();
  if (/kg|gam|tấn|tạ|yến|cân/.test(value)) {
    return `<path d="M ${x + width / 2} ${y + 38} V ${y + height - 62} M ${x + width / 2 - 110} ${y + 70} H ${x + width / 2 + 110}" stroke="#1E3A8A" stroke-width="9" stroke-linecap="round"/><path d="M ${x + 62} ${y + 120} H ${x + 212} L ${x + 187} ${y + 196} H ${x + 87} Z" fill="#DBEAFE" stroke="#2563EB" stroke-width="4"/><path d="M ${x + width - 212} ${y + 120} H ${x + width - 62} L ${x + width - 87} ${y + 196} H ${x + width - 187} Z" fill="#FEF3C7" stroke="#D97706" stroke-width="4"/><rect x="${x + 105}" y="${y + 78}" width="62" height="58" rx="12" fill="#22C55E"/><text x="${x + 136}" y="${y + 115}" text-anchor="middle" font-family="Arial" font-size="20" font-weight="700" fill="#fff">kg</text>`;
  }
  const ticks = Array.from({ length: 21 }, (_, index) => `<line x1="${x + 35 + index * ((width - 70) / 20)}" y1="${y + 130}" x2="${x + 35 + index * ((width - 70) / 20)}" y2="${y + 130 + (index % 5 === 0 ? 48 : index % 2 === 0 ? 32 : 22)}" stroke="#92400E" stroke-width="3"/>`).join('');
  return `<rect x="${x + 24}" y="${y + 112}" width="${width - 48}" height="92" rx="14" fill="#FEF3C7" stroke="#D97706" stroke-width="5"/>${ticks}<path d="M ${x + 65} ${y + 75} H ${x + width - 65}" stroke="#2563EB" stroke-width="6" marker-start="url(#arrow)" marker-end="url(#arrow)"/>`;
}

function clockScene(text, x, y, width, height) {
  const cx = x + width / 2;
  const cy = y + height / 2;
  const r = Math.min(112, height / 2 - 18);
  const ticks = Array.from({ length: 12 }, (_, index) => {
    const angle = (index * Math.PI) / 6;
    const x1 = cx + Math.sin(angle) * (r - 16);
    const y1 = cy - Math.cos(angle) * (r - 16);
    const x2 = cx + Math.sin(angle) * r;
    const y2 = cy - Math.cos(angle) * r;
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#1E3A8A" stroke-width="5" stroke-linecap="round"/>`;
  }).join('');
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#FFFFFF" stroke="#2563EB" stroke-width="7"/>${ticks}<path d="M ${cx} ${cy} L ${cx} ${cy - r * 0.55} M ${cx} ${cy} L ${cx + r * 0.48} ${cy + r * 0.28}" stroke="#0F172A" stroke-width="9" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="10" fill="#F97316"/>`;
}

function fractionScene(text, x, y, width, height) {
  const match = String(text || '').match(/(\d+)\s*\/\s*(\d+)/);
  const numerator = Math.max(1, Number(match?.[1] || 3));
  const denominator = Math.max(numerator, Math.min(12, Number(match?.[2] || 8)));
  const barWidth = width - 80;
  const cellWidth = barWidth / denominator;
  let cells = '';
  for (let index = 0; index < denominator; index += 1) {
    cells += `<rect x="${x + 40 + index * cellWidth}" y="${y + 105}" width="${cellWidth}" height="92" fill="${index < numerator ? '#F97316' : '#E0F2FE'}" stroke="#0369A1" stroke-width="3"/>`;
  }
  return `${cells}<text x="${x + width / 2}" y="${y + 72}" text-anchor="middle" font-family="Arial" font-size="42" font-weight="700" fill="#1E3A8A">${numerator}/${denominator}</text>`;
}

function chartScene(text, x, y, width, height) {
  const raw = extractDataTokens(text).map((value) => Number(value.replace(/[^0-9]/g, ''))).filter((value) => Number.isFinite(value) && value > 0);
  const values = raw.length >= 3 ? raw.slice(0, 5) : [35, 62, 48, 78];
  const max = Math.max(...values);
  const barWidth = Math.min(68, (width - 100) / values.length - 18);
  return values.map((value, index) => {
    const h = 55 + (value / max) * (height - 130);
    const bx = x + 58 + index * ((width - 116) / values.length) + 10;
    const by = y + height - 48 - h;
    return `<rect x="${bx}" y="${by}" width="${barWidth}" height="${h}" rx="10" fill="${['#3B82F6', '#22C55E', '#F59E0B', '#F97316', '#8B5CF6'][index]}"/><text x="${bx + barWidth / 2}" y="${by - 10}" text-anchor="middle" font-family="Arial" font-size="20" font-weight="700" fill="#334155">${value}</text>`;
  }).join('') + `<path d="M ${x + 42} ${y + 25} V ${y + height - 42} H ${x + width - 28}" fill="none" stroke="#64748B" stroke-width="4"/>`;
}

function geometryScene(text, x, y, width, height) {
  const value = String(text || '').toLowerCase();
  const labels = extractDataTokens(text);
  if (/lập phương|hình hộp|bể|ngăn kéo|khối/.test(value)) {
    const left = x + 105; const top = y + 70; const w = width - 260; const h = height - 150; const d = 72;
    return `<polygon points="${left},${top} ${left + w},${top} ${left + w + d},${top - 45} ${left + d},${top - 45}" fill="#DBEAFE" stroke="#2563EB" stroke-width="5"/><polygon points="${left + w},${top} ${left + w + d},${top - 45} ${left + w + d},${top + h - 45} ${left + w},${top + h}" fill="#BFDBFE" stroke="#2563EB" stroke-width="5"/><rect x="${left}" y="${top}" width="${w}" height="${h}" fill="#EFF6FF" stroke="#2563EB" stroke-width="5"/><text x="${left + w / 2}" y="${top + h + 35}" text-anchor="middle" font-family="Arial" font-size="22" font-weight="700" fill="#1E3A8A">${xmlEscape(labels[0] || 'dài')}</text><text x="${left + w + 42}" y="${top + h / 2}" text-anchor="middle" font-family="Arial" font-size="22" font-weight="700" fill="#1E3A8A">${xmlEscape(labels[2] || 'cao')}</text><text x="${left + w + 34}" y="${top - 55}" text-anchor="middle" font-family="Arial" font-size="22" font-weight="700" fill="#1E3A8A">${xmlEscape(labels[1] || 'rộng')}</text>`;
  }
  if (/tam giác|góc/.test(value)) {
    return `<polygon points="${x + width / 2},${y + 32} ${x + 76},${y + height - 42} ${x + width - 70},${y + height - 42}" fill="#FEF3C7" stroke="#D97706" stroke-width="7"/><path d="M ${x + 92} ${y + height - 42} A 42 42 0 0 1 ${x + 115} ${y + height - 78}" fill="none" stroke="#F97316" stroke-width="5"/>`;
  }
  return `<rect x="${x + 44}" y="${y + 54}" width="150" height="150" rx="8" fill="#DBEAFE" stroke="#2563EB" stroke-width="6"/><circle cx="${x + 305}" cy="${y + 129}" r="75" fill="#FDE68A" stroke="#D97706" stroke-width="6"/><polygon points="${x + 455},${y + 204} ${x + 535},${y + 54} ${x + 615},${y + 204}" fill="#DCFCE7" stroke="#16A34A" stroke-width="6"/>`;
}

function illustrationScene(text, preferred, x, y, width, height) {
  const type = inferIllustrationType(text, preferred);
  if (type === 'geometry') return geometryScene(text, x, y, width, height);
  if (type === 'chart') return chartScene(text, x, y, width, height);
  if (type === 'clock') return clockScene(text, x, y, width, height);
  if (type === 'fraction') return fractionScene(text, x, y, width, height);
  if (type === 'measurement') return measurementScene(text, x, y, width, height);
  if (type === 'groups') return groupScene(text, x, y, width, height);
  return numberScene(text, x, y, width, height);
}

function cardSvg(question, grade, lesson) {
  const width = 1200;
  const height = 675;
  const visual = question.visual || { type: 'numbers', title: 'BÀI TOÁN', lines: [question.content.text] };
  const panels = visual.type === 'two_panel' ? visual.lines : [visual.lines.join(' ')];
  let panelMarkup = '';
  panels.forEach((text, panelIndex) => {
    const panelHeight = panels.length === 2 ? 244 : 486;
    const y = panels.length === 2 ? 118 + panelIndex * 258 : 118;
    const sceneWidth = panels.length === 2 ? 540 : 680;
    const textX = 78 + sceneWidth + 34;
    const lines = wrapText(text, panels.length === 2 ? 42 : 38).slice(0, panels.length === 2 ? 3 : 5);
    panelMarkup += `<rect x="58" y="${y}" width="1084" height="${panelHeight}" rx="24" fill="#FFFFFF" stroke="#BFDBFE" stroke-width="3"/>`;
    panelMarkup += `<rect x="74" y="${y + 16}" width="${sceneWidth}" height="${panelHeight - 32}" rx="20" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="2"/>`;
    panelMarkup += illustrationScene(text, visual.type, 82, y + 22, sceneWidth - 16, panelHeight - 44);
    if (panels.length === 2) {
      panelMarkup += `<circle cx="${textX + 24}" cy="${y + 42}" r="24" fill="#2563EB"/><text x="${textX + 24}" y="${y + 51}" text-anchor="middle" font-family="Arial" font-size="25" font-weight="700" fill="#FFFFFF">${panelIndex + 1}</text>`;
    }
    const textY = y + (panels.length === 2 ? 88 : 82);
    lines.forEach((line, lineIndex) => {
      panelMarkup += `<text x="${textX}" y="${textY + lineIndex * 32}" font-family="Arial, sans-serif" font-size="${panels.length === 2 ? 22 : 24}" font-weight="${lineIndex === 0 ? 700 : 500}" fill="#172554">${xmlEscape(line)}</text>`;
    });
    panelMarkup += dataChips(text, textX, y + panelHeight - 62, 1080 - sceneWidth);
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M 8 0 L 0 4 L 8 8 Z" fill="#2563EB"/></marker></defs>
    <rect width="1200" height="675" fill="#EFF6FF"/>
    <rect x="0" y="0" width="1200" height="102" fill="#1D4ED8"/>
    <text x="58" y="42" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#BFDBFE">TOÁN LỚP ${grade} • ${xmlEscape(lesson.chapter_name)}</text>
    <text x="58" y="78" font-family="Arial, sans-serif" font-size="29" font-weight="700" fill="#FFFFFF">${xmlEscape(visual.title)}</text>
    <text x="1142" y="62" text-anchor="end" font-family="Arial, sans-serif" font-size="20" fill="#DBEAFE">${xmlEscape(lesson.lesson_name)}</text>
    ${panelMarkup}
    <text x="1142" y="654" text-anchor="end" font-family="Arial, sans-serif" font-size="17" fill="#64748B">Hình minh họa dữ kiện • Không vẽ theo tỉ lệ</text>
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
  extractDataTokens,
  inferIllustrationType,
  illustrationScene,
  parseGrade,
  wrapText,
  xmlEscape
};
