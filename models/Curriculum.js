const db = require('../config/db');
const sampleData = require('../sample-data/sampleData');
const { parseJsonField } = require('../utils/json');
const { MAX_GRADE, MIN_GRADE, isSupportedGrade } = require('../config/grades');
const { normalizeGridLayout } = require('../utils/gridLayout');
const { fallbackOrThrow } = require('../utils/sampleDataFallback');

function normalizeLesson(row) {
  return {
    ...row,
    theory_cards: normalizeTheoryCards(parseJsonField(row.theory_cards, []))
  };
}

function normalizeLessonMeta(row) {
  return {
    ...row,
    theory_cards: []
  };
}

async function getCurriculumByGrade(grade) {
  if (!isSupportedGrade(grade)) return [];

  try {
    const chapters = await db.query(
      `SELECT id, grade, semester, chapter_name, sort_order
       FROM Chapters
       WHERE grade = ?
       ORDER BY sort_order, id`,
      [grade]
    );

    const lessons = await db.query(
      `SELECT
          l.id,
          l.chapter_id,
          l.lesson_name,
          l.sort_order,
          l.sort_order AS lesson_sort_order
       FROM Lessons l
       JOIN Chapters c ON c.id = l.chapter_id
       WHERE c.grade = ?
       ORDER BY c.sort_order, l.sort_order, l.id`,
      [grade]
    );

    return chapters.map((chapter) => ({
      ...chapter,
      lessons: lessons.filter((lesson) => lesson.chapter_id === chapter.id).map(normalizeLessonMeta)
    }));
  } catch (error) {
    fallbackOrThrow(error);
    return sampleData.chapters.filter((chapter) => Number(chapter.grade) === Number(grade));
  }
}

async function getAllLessons(options = {}) {
  const includeTheoryCards = Boolean(options.includeTheoryCards);
  const theorySelect = includeTheoryCards ? 'l.theory_cards,' : '';
  try {
    const rows = await db.query(
      `SELECT
          l.id,
          l.chapter_id,
          l.lesson_name,
          ${theorySelect}
          l.sort_order AS lesson_sort_order,
          c.id AS chapter_id,
          c.chapter_name,
          c.grade,
          c.semester,
          c.sort_order AS chapter_sort_order
       FROM Lessons l
       JOIN Chapters c ON c.id = l.chapter_id
       WHERE c.grade BETWEEN ${MIN_GRADE} AND ${MAX_GRADE}
       ORDER BY c.grade, c.sort_order, l.sort_order`
    );

    return rows.map(includeTheoryCards ? normalizeLesson : normalizeLessonMeta);
  } catch (error) {
    fallbackOrThrow(error);
    return sampleData.chapters
      .filter((chapter) => isSupportedGrade(chapter.grade))
      .flatMap((chapter) =>
        chapter.lessons.map((lesson) => ({
          id: lesson.id,
          chapter_id: chapter.id,
          lesson_name: lesson.lesson_name,
          theory_cards: lesson.theory_cards || [],
          lesson_sort_order: lesson.sort_order,
          chapter_name: chapter.chapter_name,
          grade: chapter.grade,
          chapter_sort_order: chapter.sort_order
        }))
      );
  }
}

async function getTheoryCounts() {
  try {
    const rows = await db.query(
      `SELECT l.id AS lesson_id, COALESCE(JSON_LENGTH(l.theory_cards), 0) AS theory_count
       FROM Lessons l
       JOIN Chapters c ON c.id = l.chapter_id
       WHERE c.grade BETWEEN ${MIN_GRADE} AND ${MAX_GRADE}`
    );
    return rows.map((row) => ({
      lesson_id: Number(row.lesson_id),
      theory_count: Number(row.theory_count || 0)
    }));
  } catch (error) {
    fallbackOrThrow(error);
    return sampleData.chapters
      .filter((chapter) => isSupportedGrade(chapter.grade))
      .flatMap((chapter) =>
        chapter.lessons.map((lesson) => ({
          lesson_id: Number(lesson.id),
          theory_count: Array.isArray(lesson.theory_cards) ? lesson.theory_cards.length : 0
        }))
      );
  }
}

async function updateLessonTheoryCards(lessonId, theoryCards) {
  const normalizedCards = normalizeTheoryCards(theoryCards);

  try {
    await db.query(
      'UPDATE Lessons SET theory_cards = ? WHERE id = ?',
      [JSON.stringify(normalizedCards), lessonId]
    );
  } catch (error) {
    fallbackOrThrow(error);
    const lesson = findSampleLesson(lessonId);
    if (lesson) lesson.theory_cards = normalizedCards;
  }

  return normalizedCards;
}

function normalizeTheoryCards(cards) {
  return (Array.isArray(cards) ? cards : [])
    .map((card, index) => ({
      id: String(card.id || `card-${index + 1}`),
      type: normalizeTheoryCardType(card.type),
      layout: normalizeTheoryCardLayout(card.layout),
      title: String(card.title || '').trim(),
      display_text: String(card.display_text || '').trim(),
      body: String(card.body || '').trim(),
      formulas: normalizeFormulaList(card.formulas || card.formula),
      formula: normalizeFormulaList(card.formulas || card.formula).join('\n'),
      example: String(card.example || '').trim(),
      student_task: String(card.student_task || '').trim(),
      remember: String(card.remember || '').trim(),
      interaction: normalizeTheoryInteraction(card.interaction),
      grid_layout: normalizeGridLayout(card.grid_layout),
      images: normalizeTheoryImages(card.images)
    }))
    .filter((card) =>
      card.title
      || card.display_text
      || card.body
      || card.formulas.length > 0
      || card.example
      || card.student_task
      || card.remember
      || card.grid_layout.enabled
      || card.images.length > 0
    )
    .map((card, index) => ({
      ...card,
      id: `card-${index + 1}`
    }));
}

function normalizeTheoryCardType(value) {
  const type = String(value || '').trim();
  return ['observe', 'concept', 'model', 'quick_try', 'remember'].includes(type) ? type : 'concept';
}

function normalizeTheoryCardLayout(value) {
  const layout = String(value || '').trim();
  return ['text_first', 'visual_top', 'visual_left', 'visual_right', 'step_focus', 'compact'].includes(layout)
    ? layout
    : 'text_first';
}

function normalizeTheoryInteraction(value) {
  const interaction = String(value || '').trim();
  return ['none', 'choose', 'count', 'fill_blank', 'compare', 'match'].includes(interaction)
    ? interaction
    : 'none';
}

function normalizeFormulaList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }

  return String(value || '')
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeTheoryImages(images) {
  return (Array.isArray(images) ? images : [])
    .map((image, index) => ({
      id: String(image.id || `theory-image-${index + 1}`),
      url: String(image.url || '').trim(),
      alt_text: String(image.alt_text || image.alt || 'Hình minh họa lý thuyết').trim(),
      width_percent: Number(image.width_percent || 100),
      storage_provider: image.storage_provider || '',
      public_id: image.public_id || null
    }))
    .filter((image) => image.url);
}

async function getLessonById(id) {
  try {
    const rows = await db.query(
      `SELECT l.*, c.chapter_name, c.grade
       FROM Lessons l
       JOIN Chapters c ON c.id = l.chapter_id
       WHERE l.id = ?
       LIMIT 1`,
      [id]
    );
    return rows[0] ? normalizeLesson(rows[0]) : null;
  } catch (error) {
    fallbackOrThrow(error);
    for (const chapter of sampleData.chapters) {
      const lesson = chapter.lessons.find((item) => Number(item.id) === Number(id));
      if (lesson) {
        return {
          ...lesson,
          chapter_name: chapter.chapter_name,
          grade: chapter.grade
        };
      }
    }
    return null;
  }
}

async function getChapterById(id) {
  try {
    const rows = await db.query(
      `SELECT id, grade, semester, chapter_name, sort_order
       FROM Chapters
       WHERE id = ?
       LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  } catch (error) {
    fallbackOrThrow(error);
    return sampleData.chapters.find(
      (chapter) => Number(chapter.id) === Number(id)
    ) || null;
  }
}

async function getProgress(studentId, grade) {
  try {
    const rows = await db.query(
      `SELECT
          COUNT(DISTINCT l.id) AS total_lessons,
          COUNT(DISTINCT CASE WHEN sl.is_correct = 1 THEN q.lesson_id END) AS completed_lessons
       FROM Lessons l
       JOIN Chapters c ON c.id = l.chapter_id
       LEFT JOIN QuestionBank q ON q.lesson_id = l.id
       LEFT JOIN StudentLogs sl ON sl.question_id = q.id AND sl.student_id = ?
       WHERE c.grade = ?`,
      [studentId, grade]
    );

    const result = rows[0] || { total_lessons: 0, completed_lessons: 0 };
    const total = Number(result.total_lessons || 0);
    const completed = Number(result.completed_lessons || 0);
    return {
      total,
      completed,
      percent: total > 0 ? Math.round((completed / total) * 100) : 0
    };
  } catch (error) {
    fallbackOrThrow(error);
    const total = sampleData.chapters
      .filter((chapter) => Number(chapter.grade) === Number(grade))
      .reduce((sum, chapter) => sum + chapter.lessons.length, 0);
    const completedLessonIds = new Set(
      sampleData.studentLogs
        .filter((log) => Number(log.student_id) === Number(studentId) && log.is_correct)
        .map((log) => {
          const question = sampleData.questions.find((item) => Number(item.id) === Number(log.question_id));
          return question?.lesson_id;
        })
        .filter(Boolean)
    );

    return {
      total,
      completed: completedLessonIds.size,
      percent: total > 0 ? Math.round((completedLessonIds.size / total) * 100) : 0
    };
  }
}

async function getRecommendation(studentId) {
  try {
    const rows = await db.query(
      `SELECT l.id, l.lesson_name, COUNT(*) AS wrong_count
       FROM StudentLogs sl
       JOIN QuestionBank q ON q.id = sl.question_id
       JOIN Lessons l ON l.id = q.lesson_id
       WHERE sl.student_id = ? AND sl.is_correct = 0
       GROUP BY l.id, l.lesson_name
       ORDER BY wrong_count DESC
       LIMIT 1`,
      [studentId]
    );
    return rows[0] || null;
  } catch (error) {
    fallbackOrThrow(error);
    const wrongLogs = sampleData.studentLogs.filter(
      (log) => Number(log.student_id) === Number(studentId) && !log.is_correct
    );
    if (wrongLogs.length === 0) return null;

    const question = sampleData.questions.find((item) => item.id === wrongLogs[wrongLogs.length - 1].question_id);
    if (!question) return null;

    return getLessonById(question.lesson_id);
  }
}

async function getLessonProgressByGrade(studentId, grade) {
  try {
    const rows = await db.query(
      `SELECT
          l.id AS lesson_id,
          COUNT(sl.id) AS attempt_count,
          SUM(CASE WHEN sl.is_correct = 1 THEN 1 ELSE 0 END) AS correct_count,
          SUM(CASE WHEN sl.is_correct = 0 THEN 1 ELSE 0 END) AS wrong_count,
          MAX(sl.created_at) AS last_attempt_at
       FROM Lessons l
       JOIN Chapters c ON c.id = l.chapter_id
       LEFT JOIN QuestionBank q ON q.lesson_id = l.id
       LEFT JOIN StudentLogs sl ON sl.question_id = q.id AND sl.student_id = ?
       WHERE c.grade = ?
       GROUP BY l.id`,
      [studentId, grade]
    );

    return rows.reduce((result, row) => {
      result[row.lesson_id] = normalizeLessonProgress(row);
      return result;
    }, {});
  } catch (error) {
    fallbackOrThrow(error);
    return buildFallbackLessonProgress(studentId);
  }
}

async function getRecentAttempts(studentId, limit = 8) {
  try {
    const rows = await queryRecentAttempts(studentId, limit, true);
    return rows;
  } catch (error) {
    try {
      return await queryRecentAttempts(studentId, limit, false);
    } catch (fallbackError) {
      fallbackOrThrow(fallbackError);
      return sampleData.studentLogs
        .filter((log) => Number(log.student_id) === Number(studentId))
        .slice(-limit)
        .reverse()
        .map((log) => {
          const question = sampleData.questions.find((item) => Number(item.id) === Number(log.question_id));
          const lesson = findSampleLesson(question?.lesson_id);
          return {
            ...log,
            practice_session_id: log.practice_session_id || null,
            correct_answer: question?.correct_answer || '',
            lesson_name: lesson?.lesson_name || 'Bài học chưa xác định',
            grade: lesson?.grade || ''
          };
        });
    }
  }
}

async function queryRecentAttempts(studentId, limit, includePracticeSessionId) {
  const practiceSessionColumn = includePracticeSessionId
    ? 'sl.practice_session_id,'
    : 'NULL AS practice_session_id,';
  const safeLimit = Math.min(Math.max(Number(limit) || 8, 1), 200);

  return db.query(
    `SELECT
        sl.id,
        ${practiceSessionColumn}
        sl.selected_answer,
        sl.is_correct,
        sl.time_spent_seconds,
        sl.created_at,
        q.correct_answer,
        l.lesson_name,
        c.grade
     FROM StudentLogs sl
     JOIN QuestionBank q ON q.id = sl.question_id
     JOIN Lessons l ON l.id = q.lesson_id
     JOIN Chapters c ON c.id = l.chapter_id
     WHERE sl.student_id = ?
     ORDER BY sl.created_at DESC
     LIMIT ${safeLimit}`,
    [studentId]
  );
}

function normalizeLessonProgress(row) {
  const attemptCount = Number(row.attempt_count || 0);
  const correctCount = Number(row.correct_count || 0);
  const wrongCount = Number(row.wrong_count || 0);
  return {
    attempt_count: attemptCount,
    correct_count: correctCount,
    wrong_count: wrongCount,
    last_attempt_at: row.last_attempt_at,
    status: attemptCount === 0 ? 'not_started' : correctCount > 0 ? 'completed' : 'needs_review'
  };
}

function buildFallbackLessonProgress(studentId) {
  const result = {};
  for (const log of sampleData.studentLogs.filter((item) => Number(item.student_id) === Number(studentId))) {
    const question = sampleData.questions.find((item) => Number(item.id) === Number(log.question_id));
    if (!question) continue;
    if (!result[question.lesson_id]) {
      result[question.lesson_id] = {
        attempt_count: 0,
        correct_count: 0,
        wrong_count: 0,
        last_attempt_at: null,
        status: 'not_started'
      };
    }
    result[question.lesson_id].attempt_count += 1;
    if (log.is_correct) result[question.lesson_id].correct_count += 1;
    else result[question.lesson_id].wrong_count += 1;
    result[question.lesson_id].last_attempt_at = log.created_at;
    result[question.lesson_id].status = result[question.lesson_id].correct_count > 0 ? 'completed' : 'needs_review';
  }
  return result;
}

function findSampleLesson(lessonId) {
  for (const chapter of sampleData.chapters) {
    const lesson = chapter.lessons.find((item) => Number(item.id) === Number(lessonId));
    if (lesson) return { ...lesson, grade: chapter.grade };
  }
  return null;
}

/* ---------------------------------------------------------------------------
   Chức năng AD-01: quản lý khung chương trình (Chương và Bài học).
   Trước đây không có hàm ghi nào, mọi thay đổi cấu trúc chương trình phải mở
   MySQL gõ SQL tay.
   ------------------------------------------------------------------------- */

// Danh sách chương kèm số bài và số câu hỏi, dùng cho trang quản trị. Đếm sẵn
// để giao diện biết chương nào còn bài, bài nào còn câu hỏi mà chặn xóa.
async function listChaptersForAdmin(grade) {
  const rows = await db.query(
    `SELECT
        c.id,
        c.grade,
        c.semester,
        c.chapter_name,
        c.sort_order,
        COUNT(DISTINCT l.id) AS lesson_count,
        COUNT(q.id) AS question_count
     FROM Chapters c
     LEFT JOIN Lessons l ON l.chapter_id = c.id
     LEFT JOIN QuestionBank q ON q.lesson_id = l.id
     WHERE c.grade = ?
     GROUP BY c.id
     ORDER BY c.semester, c.sort_order, c.id`,
    [Number(grade)]
  );
  return rows.map((row) => ({
    ...row,
    lesson_count: Number(row.lesson_count || 0),
    question_count: Number(row.question_count || 0)
  }));
}

// Toàn bộ bài học của một khối trong MỘT truy vấn, controller tự gom theo
// chương. Bản trước truy vấn theo từng chapter_id: khối 15 chương là 15 lượt
// query cho mỗi lần mở trang khung chương trình.
async function listLessonsForAdminByGrade(grade) {
  const rows = await db.query(
    `SELECT
        l.id,
        l.chapter_id,
        l.lesson_name,
        l.sort_order,
        COUNT(q.id) AS question_count,
        CASE WHEN JSON_LENGTH(COALESCE(l.theory_cards, JSON_ARRAY())) > 0 THEN 1 ELSE 0 END AS has_theory
     FROM Lessons l
     JOIN Chapters c ON c.id = l.chapter_id
     LEFT JOIN QuestionBank q ON q.lesson_id = l.id
     WHERE c.grade = ?
     GROUP BY l.id
     ORDER BY l.chapter_id, l.sort_order, l.id`,
    [Number(grade)]
  );
  return rows.map((row) => ({
    ...row,
    question_count: Number(row.question_count || 0),
    has_theory: Number(row.has_theory) === 1
  }));
}

// Số thứ tự kế tiếp, để quản trị viên không phải tự nhớ đang tới số nào.
async function nextChapterSortOrder(grade) {
  const rows = await db.query(
    'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM Chapters WHERE grade = ?',
    [Number(grade)]
  );
  return Number(rows[0]?.next || 1);
}

async function nextLessonSortOrder(chapterId) {
  const rows = await db.query(
    'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM Lessons WHERE chapter_id = ?',
    [Number(chapterId)]
  );
  return Number(rows[0]?.next || 1);
}

async function createChapter({ grade, semester, chapterName, sortOrder }) {
  const order = Number(sortOrder) > 0 ? Number(sortOrder) : await nextChapterSortOrder(grade);
  const result = await db.query(
    'INSERT INTO Chapters (grade, semester, chapter_name, sort_order) VALUES (?, ?, ?, ?)',
    [Number(grade), Number(semester) === 2 ? 2 : 1, String(chapterName).trim(), order]
  );
  return result.insertId;
}

async function updateChapter(chapterId, { semester, chapterName, sortOrder }) {
  await db.query(
    'UPDATE Chapters SET semester = ?, chapter_name = ?, sort_order = ? WHERE id = ?',
    [
      Number(semester) === 2 ? 2 : 1,
      String(chapterName).trim(),
      Number(sortOrder) > 0 ? Number(sortOrder) : 1,
      Number(chapterId)
    ]
  );
}

// Ngoại lệ 10a trong tài liệu: không cho xóa chương còn chứa bài học. Bảng
// Lessons khai báo ON DELETE CASCADE nên nếu không chặn ở đây thì một cú bấm sẽ
// kéo theo toàn bộ bài học, câu hỏi và lịch sử làm bài của học sinh.
async function countLessonsInChapter(chapterId) {
  const rows = await db.query(
    'SELECT COUNT(*) AS total FROM Lessons WHERE chapter_id = ?',
    [Number(chapterId)]
  );
  return Number(rows[0]?.total || 0);
}

async function deleteChapter(chapterId) {
  await db.query('DELETE FROM Chapters WHERE id = ?', [Number(chapterId)]);
}

async function createLesson({ chapterId, lessonName, sortOrder }) {
  const order = Number(sortOrder) > 0 ? Number(sortOrder) : await nextLessonSortOrder(chapterId);
  const result = await db.query(
    'INSERT INTO Lessons (chapter_id, lesson_name, sort_order, theory_cards) VALUES (?, ?, ?, CAST(? AS JSON))',
    [Number(chapterId), String(lessonName).trim(), order, '[]']
  );
  return result.insertId;
}

async function updateLesson(lessonId, { lessonName, sortOrder }) {
  await db.query(
    'UPDATE Lessons SET lesson_name = ?, sort_order = ? WHERE id = ?',
    [String(lessonName).trim(), Number(sortOrder) > 0 ? Number(sortOrder) : 1, Number(lessonId)]
  );
}

// Cùng lý do như xóa chương: QuestionBank khai báo ON DELETE CASCADE theo
// lesson_id, nên bài còn câu hỏi thì phải chặn.
async function countQuestionsInLesson(lessonId) {
  const rows = await db.query(
    'SELECT COUNT(*) AS total FROM QuestionBank WHERE lesson_id = ?',
    [Number(lessonId)]
  );
  return Number(rows[0]?.total || 0);
}

async function deleteLesson(lessonId) {
  await db.query('DELETE FROM Lessons WHERE id = ?', [Number(lessonId)]);
}

module.exports = {
  getCurriculumByGrade,
  getAllLessons,
  getTheoryCounts,
  getLessonById,
  getChapterById,
  updateLessonTheoryCards,
  getProgress,
  getRecommendation,
  getLessonProgressByGrade,
  getRecentAttempts,
  listChaptersForAdmin,
  listLessonsForAdminByGrade,
  nextChapterSortOrder,
  nextLessonSortOrder,
  createChapter,
  updateChapter,
  countLessonsInChapter,
  deleteChapter,
  createLesson,
  updateLesson,
  countQuestionsInLesson,
  deleteLesson
};
