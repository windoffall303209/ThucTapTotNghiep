// Script seed curriculum hỗ trợ nhập, xuất, kiểm tra hoặc bảo trì dữ liệu và cấu hình của dự án.
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

// Hàm createUsageError dùng để tạo bản ghi hoặc tài nguyên mới sau khi kiểm tra đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function createUsageError(message) {
  const error = new Error(message);
  error.code = 'INVALID_CURRICULUM_SEED_REQUEST';
  return error;
}

// Hàm parseArguments dùng để phân tích đầu vào thành cấu trúc có thể sử dụng; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function parseArguments(argv = process.argv.slice(2)) {
  const args = {
    apply: false,
    confirmDatabase: '',
    source: ''
  };

  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const argument of argv) {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (argument === '--apply') {
      args.apply = true;
      continue;
    }
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (argument.startsWith('--confirm-database=')) {
      args.confirmDatabase = argument.slice('--confirm-database='.length).trim();
      continue;
    }
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (argument.startsWith('--source=')) {
      args.source = argument.slice('--source='.length).trim();
      continue;
    }
    throw createUsageError(`Tham số không được hỗ trợ: ${argument}`);
  }

  return args;
}

// Hàm buildExecutionPlan dùng để xây dựng kết quả từ các nguồn dữ liệu và quy tắc liên quan; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
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
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (missingConfig.length > 0) {
    throw createUsageError(`Thiếu cấu hình: ${missingConfig.join(', ')}`);
  }

  const databaseName = String(env.DB_NAME).trim();
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (args.apply && args.confirmDatabase !== databaseName) {
    throw createUsageError(
      `Phải xác nhận đúng database bằng --confirm-database=${databaseName}`
    );
  }

  const configuredSource = String(
    args.source || env.CURRICULUM_SOURCE_FILE || DEFAULT_SOURCE_FILE
  ).trim();
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!configuredSource) {
    throw createUsageError('Đường dẫn nguồn chương trình không được để trống');
  }
  const sourcePath = path.isAbsolute(configuredSource)
    ? path.normalize(configuredSource)
    : path.resolve(projectRoot, configuredSource);

  let rawText;
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  try {
    rawText = readFileSync(sourcePath, 'utf8');
  } catch (cause) {
    throw createUsageError(`Không thể đọc nguồn chương trình tại ${sourcePath}: ${cause.message}`);
  }

  const chapters = parseCurriculum(rawText);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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

// Hàm buildConnectionOptions dùng để xây dựng kết quả từ các nguồn dữ liệu và quy tắc liên quan; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
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

// Hàm findUniqueId dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function findUniqueId(connection, sql, params, entityLabel) {
  const [rows] = await connection.execute(sql, params);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (rows.length > 1) {
    throw createUsageError(
      `Có nhiều bản ghi trùng cho ${entityLabel}; hãy xử lý dữ liệu trùng trước khi nạp`
    );
  }
  return rows[0]?.id || null;
}

// Hàm reconcileCurriculum dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function reconcileCurriculum(connection, chapters) {
  const stats = {
    chaptersInserted: 0,
    chaptersUpdated: 0,
    lessonsInserted: 0,
    lessonsUpdated: 0
  };

  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
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

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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

    // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
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

      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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

// Hàm executePlan dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function executePlan(
  plan,
  env = process.env,
  { createConnection = mysql.createConnection } = {}
) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!plan.apply) {
    return { applied: false };
  }

  const connection = await createConnection(buildConnectionOptions(env));
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  try {
    const [rows] = await connection.query('SELECT DATABASE() AS database_name');
    const selectedDatabase = String(rows?.[0]?.database_name || '');
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (selectedDatabase !== plan.databaseName) {
      throw createUsageError(
        `Kết nối đang chọn database "${selectedDatabase}", không phải "${plan.databaseName}"`
      );
    }

    await connection.beginTransaction();
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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

// Hàm printPlan dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function printPlan(plan) {
  console.log(`Nguồn: ${plan.sourcePath}`);
  console.log(`Database: ${plan.databaseName}`);
  console.log(`Dữ liệu hợp lệ: ${plan.chapterCount} chương, ${plan.lessonCount} bài học.`);
  console.log('Chế độ đồng bộ an toàn: chỉ thêm mới hoặc cập nhật thứ tự; không xóa dữ liệu cũ.');
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!plan.apply) {
    console.log('Chỉ kiểm tra. Chưa có thay đổi nào được áp dụng.');
    console.log(
      `Để thực thi: npm run db:seed-curriculum -- --apply --confirm-database=${plan.databaseName}`
    );
  }
}

// Hàm printResult dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function printResult(result, plan) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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

// Hàm main dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function main() {
  const args = parseArguments();
  const plan = buildExecutionPlan(args);
  printPlan(plan);
  const result = await executePlan(plan);
  printResult(result, plan);
}

// Hàm parseCurriculum dùng để phân tích đầu vào thành cấu trúc có thể sử dụng; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function parseCurriculum(rawText) {
  const lines = String(rawText || '').split(/\r?\n/);
  const chapters = [];
  let currentGrade = null;
  let currentSemester = null;
  let currentChapter = null;
  const chapterOrderByGrade = new Map();

  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const line of lines) {
    const trimmed = line.trim();
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!trimmed || trimmed.startsWith('=') || trimmed.startsWith('---')) continue;

    const gradeMatch = trimmed.match(/^LỚP\s+(\d+)/i);
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (gradeMatch) {
      currentGrade = Number(gradeMatch[1]);
      currentSemester = null;
      currentChapter = null;
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (!chapterOrderByGrade.has(currentGrade)) {
        chapterOrderByGrade.set(currentGrade, 0);
      }
      continue;
    }

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!currentGrade) continue;

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (/tập\s*1/i.test(trimmed)) {
      currentSemester = 1;
      continue;
    }

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (/tập\s*2/i.test(trimmed)) {
      currentSemester = 2;
      continue;
    }

    const lessonMatch = trimmed.match(/^\+\s*(.+)$/);
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (lessonMatch && currentChapter) {
      currentChapter.lessons.push({
        name: normalizeName(lessonMatch[1]),
        sortOrder: currentChapter.lessons.length + 1
      });
      continue;
    }

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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

// Hàm assignMissingSemesters dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function assignMissingSemesters(chapters) {
  const grades = [...new Set(chapters.map((chapter) => chapter.grade))];
  grades.forEach((grade) => {
    const gradeChapters = chapters
      .filter((chapter) => chapter.grade === grade)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const firstSemesterCount = Math.ceil(gradeChapters.length / 2);
    gradeChapters.forEach((chapter, index) => {
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (![1, 2].includes(chapter.semester)) {
        chapter.semester = index < firstSemesterCount ? 1 : 2;
      }
    });
  });
}

// Hàm normalizeName dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function normalizeName(value) {
  return value.replace(/\s+/g, ' ').trim();
}

// Hàm defaultTheoryCards dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
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

// Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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
