require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const curriculumPath = path.join(__dirname, '..', 'Danh_sach_chuong_va_bai_hoc.txt');

async function main() {
  const items = parseCurriculum(fs.readFileSync(curriculumPath, 'utf8'));
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME
  });

  try {
    await connection.beginTransaction();
    await connection.execute('DELETE FROM Lessons');
    await connection.execute('DELETE FROM Chapters');

    for (const chapter of items) {
      const [chapterResult] = await connection.execute(
        'INSERT INTO Chapters (grade, chapter_name, sort_order) VALUES (?, ?, ?)',
        [chapter.grade, chapter.name, chapter.sortOrder]
      );

      for (const lesson of chapter.lessons) {
        await connection.execute(
          'INSERT INTO Lessons (chapter_id, lesson_name, theory_cards, sort_order) VALUES (?, ?, CAST(? AS JSON), ?)',
          [
            chapterResult.insertId,
            lesson.name,
            JSON.stringify(defaultTheoryCards(lesson.name)),
            lesson.sortOrder
          ]
        );
      }
    }

    await connection.commit();
    console.log(`Đã nạp ${items.length} chương và ${items.reduce((sum, item) => sum + item.lessons.length, 0)} bài học.`);
  } catch (error) {
    await connection.rollback();
    console.error('Không thể nạp dữ liệu chương trình:', error.message);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

function parseCurriculum(rawText) {
  const lines = rawText.split(/\r?\n/);
  const chapters = [];
  let currentGrade = null;
  let currentChapter = null;
  let chapterOrderByGrade = new Map();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('=') || trimmed.startsWith('---')) continue;

    const gradeMatch = trimmed.match(/^LỚP\s+(\d+)/i);
    if (gradeMatch) {
      currentGrade = Number(gradeMatch[1]);
      currentChapter = null;
      if (!chapterOrderByGrade.has(currentGrade)) {
        chapterOrderByGrade.set(currentGrade, 0);
      }
      continue;
    }

    if (!currentGrade) continue;

    const lessonMatch = trimmed.match(/^\+\s*(.+)$/);
    if (lessonMatch && currentChapter) {
      currentChapter.lessons.push({
        name: normalizeName(lessonMatch[1]),
        sortOrder: currentChapter.lessons.length + 1
      });
      continue;
    }

    if (/^(Chủ đề|CHƯƠNG|Chương)/.test(trimmed)) {
      const currentOrder = chapterOrderByGrade.get(currentGrade) + 1;
      chapterOrderByGrade.set(currentGrade, currentOrder);
      currentChapter = {
        grade: currentGrade,
        name: normalizeName(trimmed),
        sortOrder: currentOrder,
        lessons: []
      };
      chapters.push(currentChapter);
    }
  }

  return chapters.filter((chapter) => chapter.lessons.length > 0);
}

function normalizeName(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function defaultTheoryCards(lessonName) {
  return [
    {
      title: lessonName,
      body: 'Thẻ lý thuyết đang chờ biên soạn. Quản trị viên có thể cập nhật định nghĩa, công thức và ví dụ cho bài học này.',
      formula: '',
      example: 'Học sinh nên đọc sách giáo khoa và luyện câu hỏi sau khi nội dung được hoàn thiện.'
    }
  ];
}

main();
