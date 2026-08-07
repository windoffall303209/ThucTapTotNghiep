/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');

const { cardSvg } = require('./build_all_question_supplements');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'database', 'question_supplements', 'generated');

function parseGrades(argv) {
  const flag = argv.find((value) => value.startsWith('--grades='));
  if (!flag) return [1, 3, 4, 5];
  const grades = [...new Set(flag.slice('--grades='.length).split(',').map(Number))];
  if (!grades.length || grades.some((grade) => ![1, 3, 4, 5].includes(grade))) {
    throw new Error('Danh sách lớp chỉ được gồm 1, 3, 4 và 5.');
  }
  return grades;
}

function lessonMap(payload) {
  const result = new Map();
  for (const chapter of payload.chapters || []) {
    for (const lesson of chapter.lessons || []) {
      result.set(Number(lesson.lesson_id), { ...lesson, chapter_name: chapter.chapter_name });
    }
  }
  return result;
}

async function writeFileWithRetry(target, data, attempts = 12) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await fs.promises.writeFile(target, data);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 100));
    }
  }
  throw lastError;
}

async function regenerateGrade(grade) {
  const sharp = require('sharp');
  const source = path.join(DATA_DIR, `grade-${grade}.json`);
  const payload = JSON.parse(fs.readFileSync(source, 'utf8'));
  const lessons = lessonMap(payload);
  let written = 0;

  for (const question of payload.questions || []) {
    const lesson = lessons.get(Number(question.lesson_id));
    const imageUrl = question.content?.images?.[0]?.url;
    if (!lesson) throw new Error(`Không tìm thấy bài học ${question.lesson_id} của lớp ${grade}.`);
    if (!imageUrl) throw new Error(`Câu ${question.source_key} chưa có đường dẫn ảnh.`);
    const target = path.join(ROOT, 'public', ...imageUrl.replace(/^\/+/, '').split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const imageBuffer = await sharp(Buffer.from(cardSvg(question, grade, lesson)))
      .png({ compressionLevel: 9, palette: true, quality: 90 })
      .toBuffer();
    await writeFileWithRetry(target, imageBuffer);
    const metadata = await sharp(target).metadata();
    if (metadata.width !== 1200 || metadata.height !== 675) {
      throw new Error(`Ảnh ${target} không đúng kích thước 1200x675.`);
    }
    written += 1;
  }

  return { grade, source, written };
}

async function main() {
  const results = [];
  for (const grade of parseGrades(process.argv.slice(2))) results.push(await regenerateGrade(grade));
  console.log(JSON.stringify({ imageCount: results.reduce((sum, row) => sum + row.written, 0), results }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = { lessonMap, parseGrades, regenerateGrade, writeFileWithRetry };
