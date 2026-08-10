// Script seed curriculum h? tr? nh?p, xu?t, ki?m tra ho?c b?o tr? d? li?u v? c?u h?nh c?a d? ?n.
require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const { isSupportedGrade } = require('../config/grades');
const {
  buildDatabasePoolOptions,
  loadDatabaseSslMaterial
} = require('../config/db');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_SOURCE_FILE = 'Danh_sach_chuong_va_bai_hoc.txt';

// H?m createUsageError d?ng ?? t?o b?n ghi ho?c t?i nguy?n m?i sau khi ki?m tra ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function createUsageError(message) {
  const error = new Error(message);
  error.code = 'INVALID_CURRICULUM_SEED_REQUEST';
  return error;
}

// H?m parseArguments d?ng ?? ph?n t?ch ??u v?o th?nh c?u tr?c c? th? s? d?ng; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function parseArguments(argv = process.argv.slice(2)) {
  const args = {
    apply: false,
    confirmDatabase: '',
    source: ''
  };

  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const argument of argv) {
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (argument === '--apply') {
      args.apply = true;
      continue;
    }
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (argument.startsWith('--confirm-database=')) {
      args.confirmDatabase = argument.slice('--confirm-database='.length).trim();
      continue;
    }
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (argument.startsWith('--source=')) {
      args.source = argument.slice('--source='.length).trim();
      continue;
    }
    throw createUsageError(`Tham số không được hỗ trợ: ${argument}`);
  }

  return args;
}

// H?m buildExecutionPlan d?ng ?? x?y d?ng k?t qu? t? c?c ngu?n d? li?u v? quy t?c li?n quan; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function buildExecutionPlan(
  args,
  env = process.env,
  {
    readFileSync = fs.readFileSync,
    projectRoot = PROJECT_ROOT
  } = {}
) {
  const missingConfig = ['DB_HOST', 'DB_USER', 'DB_NAME']
    .filter((key) => !String(env[key] || '').trim());
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (missingConfig.length > 0) {
    throw createUsageError(`Thiếu cấu hình: ${missingConfig.join(', ')}`);
  }

  const databaseName = String(env.DB_NAME).trim();
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (args.apply && args.confirmDatabase !== databaseName) {
    throw createUsageError(
      `Phải xác nhận đúng database bằng --confirm-database=${databaseName}`
    );
  }

  const configuredSource = String(
    args.source || env.CURRICULUM_SOURCE_FILE || DEFAULT_SOURCE_FILE
  ).trim();
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!configuredSource) {
    throw createUsageError('Đường dẫn nguồn chương trình không được để trống');
  }
  const sourcePath = path.isAbsolute(configuredSource)
    ? path.normalize(configuredSource)
    : path.resolve(projectRoot, configuredSource);

  let rawText;
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    rawText = readFileSync(sourcePath, 'utf8');
  } catch (cause) {
    throw createUsageError(`Không thể đọc nguồn chương trình tại ${sourcePath}: ${cause.message}`);
  }

  const chapters = parseCurriculum(rawText);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (chapters.length === 0) {
    throw createUsageError('Nguồn chương trình không chứa chương hoặc bài học hợp lệ cho lớp 1-5');
  }

  return {
    apply: Boolean(args.apply),
    databaseName,
    sourcePath,
    chapters,
    chapterCount: chapters.length,
    lessonCount: chapters.reduce((sum, chapter) => sum + chapter.lessons.length, 0)
  };
}

// H?m buildConnectionOptions d?ng ?? x?y d?ng k?t qu? t? c?c ngu?n d? li?u v? quy t?c li?n quan; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function buildConnectionOptions(env = process.env) {
  const sslMaterial = loadDatabaseSslMaterial(env);
  const poolOptions = buildDatabasePoolOptions(env, sslMaterial);
  const {
    waitForConnections,
    connectionLimit,
    queueLimit,
    namedPlaceholders,
    ...connectionOptions
  } = poolOptions;
  return {
    ...connectionOptions,
    multipleStatements: false
  };
}

// H?m findUniqueId d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function findUniqueId(connection, sql, params, entityLabel) {
  const [rows] = await connection.execute(sql, params);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (rows.length > 1) {
    throw createUsageError(
      `Có nhiều bản ghi trùng cho ${entityLabel}; hãy xử lý dữ liệu trùng trước khi nạp`
    );
  }
  return rows[0]?.id || null;
}

// H?m reconcileCurriculum d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function reconcileCurriculum(connection, chapters) {
  const stats = {
    chaptersInserted: 0,
    chaptersUpdated: 0,
    lessonsInserted: 0,
    lessonsUpdated: 0
  };

  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const chapter of chapters) {
    let chapterId = await findUniqueId(
      connection,
      `SELECT id
       FROM Chapters
       WHERE grade = ? AND chapter_name = ?
       ORDER BY id ASC
       LIMIT 2`,
      [chapter.grade, chapter.name],
      `chương "${chapter.name}" lớp ${chapter.grade}`
    );

    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (chapterId) {
      await connection.execute(
        `UPDATE Chapters
         SET semester = ?, sort_order = ?
         WHERE id = ?`,
        [chapter.semester, chapter.sortOrder, chapterId]
      );
      stats.chaptersUpdated += 1;
    } else {
      const [result] = await connection.execute(
        `INSERT INTO Chapters (grade, semester, chapter_name, sort_order)
         VALUES (?, ?, ?, ?)`,
        [chapter.grade, chapter.semester, chapter.name, chapter.sortOrder]
      );
      chapterId = result.insertId;
      stats.chaptersInserted += 1;
    }

    // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
    for (const lesson of chapter.lessons) {
      const lessonId = await findUniqueId(
        connection,
        `SELECT id
         FROM Lessons
         WHERE chapter_id = ? AND lesson_name = ?
         ORDER BY id ASC
         LIMIT 2`,
        [chapterId, lesson.name],
        `bài "${lesson.name}" trong chương "${chapter.name}"`
      );

      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (lessonId) {
        await connection.execute(
          `UPDATE Lessons
           SET sort_order = ?
           WHERE id = ?`,
          [lesson.sortOrder, lessonId]
        );
        stats.lessonsUpdated += 1;
      } else {
        await connection.execute(
          `INSERT INTO Lessons (chapter_id, lesson_name, theory_cards, sort_order)
           VALUES (?, ?, CAST(? AS JSON), ?)`,
          [
            chapterId,
            lesson.name,
            JSON.stringify(defaultTheoryCards(lesson.name)),
            lesson.sortOrder
          ]
        );
        stats.lessonsInserted += 1;
      }
    }
  }

  return stats;
}

// H?m executePlan d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function executePlan(
  plan,
  env = process.env,
  { createConnection = mysql.createConnection } = {}
) {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!plan.apply) {
    return { applied: false };
  }

  const connection = await createConnection(buildConnectionOptions(env));
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    const [rows] = await connection.query('SELECT DATABASE() AS database_name');
    const selectedDatabase = String(rows?.[0]?.database_name || '');
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (selectedDatabase !== plan.databaseName) {
      throw createUsageError(
        `Kết nối đang chọn database "${selectedDatabase}", không phải "${plan.databaseName}"`
      );
    }

    await connection.beginTransaction();
    // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
    try {
      const stats = await reconcileCurriculum(connection, plan.chapters);
      await connection.commit();
      return { applied: true, stats };
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } finally {
    await connection.end();
  }
}

// H?m printPlan d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function printPlan(plan) {
  console.log(`Nguồn: ${plan.sourcePath}`);
  console.log(`Database: ${plan.databaseName}`);
  console.log(`Dữ liệu hợp lệ: ${plan.chapterCount} chương, ${plan.lessonCount} bài học.`);
  console.log('Chế độ đồng bộ an toàn: chỉ thêm mới hoặc cập nhật thứ tự; không xóa dữ liệu cũ.');
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!plan.apply) {
    console.log('Chỉ kiểm tra. Chưa có thay đổi nào được áp dụng.');
    console.log(
      `Để thực thi: npm run db:seed-curriculum -- --apply --confirm-database=${plan.databaseName}`
    );
  }
}

// H?m printResult d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function printResult(result, plan) {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!result.applied) return;
  const stats = result.stats;
  console.log(`Đã đồng bộ chương trình vào database ${plan.databaseName}:`);
  console.log(
    `- Chương: thêm ${stats.chaptersInserted}, cập nhật ${stats.chaptersUpdated}`
  );
  console.log(
    `- Bài học: thêm ${stats.lessonsInserted}, cập nhật ${stats.lessonsUpdated}`
  );
}

// H?m main d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function main() {
  const args = parseArguments();
  const plan = buildExecutionPlan(args);
  printPlan(plan);
  const result = await executePlan(plan);
  printResult(result, plan);
}

// H?m parseCurriculum d?ng ?? ph?n t?ch ??u v?o th?nh c?u tr?c c? th? s? d?ng; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function parseCurriculum(rawText) {
  const lines = String(rawText || '').split(/\r?\n/);
  const chapters = [];
  let currentGrade = null;
  let currentSemester = null;
  let currentChapter = null;
  const chapterOrderByGrade = new Map();

  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const line of lines) {
    const trimmed = line.trim();
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!trimmed || trimmed.startsWith('=') || trimmed.startsWith('---')) continue;

    const gradeMatch = trimmed.match(/^LỚP\s+(\d+)/i);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (gradeMatch) {
      currentGrade = Number(gradeMatch[1]);
      currentSemester = null;
      currentChapter = null;
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (!chapterOrderByGrade.has(currentGrade)) {
        chapterOrderByGrade.set(currentGrade, 0);
      }
      continue;
    }

    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!currentGrade) continue;

    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (/tập\s*1/i.test(trimmed)) {
      currentSemester = 1;
      continue;
    }

    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (/tập\s*2/i.test(trimmed)) {
      currentSemester = 2;
      continue;
    }

    const lessonMatch = trimmed.match(/^\+\s*(.+)$/);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (lessonMatch && currentChapter) {
      currentChapter.lessons.push({
        name: normalizeName(lessonMatch[1]),
        sortOrder: currentChapter.lessons.length + 1
      });
      continue;
    }

    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (/^(Chủ đề|CHƯƠNG|Chương)/.test(trimmed)) {
      const currentOrder = chapterOrderByGrade.get(currentGrade) + 1;
      chapterOrderByGrade.set(currentGrade, currentOrder);
      currentChapter = {
        grade: currentGrade,
        semester: currentSemester,
        name: normalizeName(trimmed),
        sortOrder: currentOrder,
        lessons: []
      };
      chapters.push(currentChapter);
    }
  }

  const supportedChapters = chapters.filter(
    (chapter) => isSupportedGrade(chapter.grade) && chapter.lessons.length > 0
  );
  assignMissingSemesters(supportedChapters);
  return supportedChapters;
}

// H?m assignMissingSemesters d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function assignMissingSemesters(chapters) {
  const grades = [...new Set(chapters.map((chapter) => chapter.grade))];
  grades.forEach((grade) => {
    const gradeChapters = chapters
      .filter((chapter) => chapter.grade === grade)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const firstSemesterCount = Math.ceil(gradeChapters.length / 2);
    gradeChapters.forEach((chapter, index) => {
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (![1, 2].includes(chapter.semester)) {
        chapter.semester = index < firstSemesterCount ? 1 : 2;
      }
    });
  });
}

// H?m normalizeName d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function normalizeName(value) {
  return value.replace(/\s+/g, ' ').trim();
}

// H?m defaultTheoryCards d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
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

// Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
if (require.main === module) {
  main().catch((error) => {
    console.error(`Không thể nạp dữ liệu chương trình: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_SOURCE_FILE,
  assignMissingSemesters,
  buildConnectionOptions,
  buildExecutionPlan,
  executePlan,
  parseArguments,
  parseCurriculum,
  reconcileCurriculum
};
