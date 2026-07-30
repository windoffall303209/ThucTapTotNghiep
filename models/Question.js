const db = require('../config/db');
const sampleData = require('../sample-data/sampleData');
const { parseJsonField } = require('../utils/json');
const { normalizeExplanationText, normalizeQuestionText } = require('../utils/textCleanup');
const { MAX_GRADE, MIN_GRADE, isSupportedGrade } = require('../config/grades');
const { normalizeGridLayout } = require('../utils/gridLayout');
const { fallbackOrThrow } = require('../utils/sampleDataFallback');

const LAYOUT_TEMPLATES = new Set([
  'STACK_VERTICAL',
  'SPLIT_HORIZONTAL_LEFT_IMAGE',
  'SPLIT_HORIZONTAL_RIGHT_IMAGE',
  'IMAGE_IN_CHOICES'
]);

function normalizeQuestion(row) {
  if (!row) return null;
  const content = normalizeQuestionContent(parseJsonField(row.content, row.content ?? { text: '', images: [] }));
  const explanation = normalizeExplanation(parseJsonField(row.explanation, row.explanation ?? { text: '', images: [] }));

  if (content.text) content.text = normalizeQuestionText(content.text);
  if (explanation.text) explanation.text = normalizeExplanationText(explanation.text);

  return {
    ...row,
    layout_template: normalizeLayoutTemplate(row.layout_template),
    content,
    choices: normalizeChoices(parseJsonField(row.choices, [])),
    explanation
  };
}

function isActiveQuestion(question) {
  return Number(question?.is_active ?? 1) === 1;
}

function normalizeLayoutTemplate(value) {
  const layout = String(value || '').trim().toUpperCase();
  return LAYOUT_TEMPLATES.has(layout) ? layout : 'STACK_VERTICAL';
}

function normalizeQuestionContent(content) {
  if (typeof content === 'string') {
    return {
      text: content.trim(),
      instruction: '',
      interaction: 'none',
      layout_variant: '',
      grid_layout: normalizeGridLayout(null),
      images: []
    };
  }

  return {
    text: String(content?.text || '').trim(),
    instruction: String(content?.instruction || '').trim(),
    interaction: normalizeQuestionInteraction(content?.interaction),
    layout_variant: normalizeLayoutVariant(content?.layout_variant),
    grid_layout: normalizeGridLayout(content?.grid_layout),
    images: normalizeImages(content?.images, 'image', 'Hình minh họa')
  };
}

function normalizeQuestionInteraction(value) {
  const interaction = String(value || '').trim();
  return ['none', 'choose', 'fill_blank', 'count', 'compare'].includes(interaction) ? interaction : 'none';
}

function normalizeLayoutVariant(value) {
  const layout = String(value || '').trim().toUpperCase();
  return [
    'STACK_VERTICAL',
    'VISUAL_TOP',
    'VISUAL_BOTTOM',
    'SPLIT_HORIZONTAL_LEFT_IMAGE',
    'SPLIT_HORIZONTAL_RIGHT_IMAGE',
    'IMAGE_IN_CHOICES',
    'COMPACT'
  ].includes(layout) ? layout : '';
}

function normalizeExplanation(explanation) {
  if (typeof explanation === 'string') {
    return {
      text: explanation.trim(),
      short_text: '',
      steps: [],
      images: []
    };
  }

  const steps = Array.isArray(explanation?.steps)
    ? explanation.steps.map((step) => String(step || '').trim()).filter(Boolean)
    : [];

  return {
    text: String(explanation?.text || '').trim(),
    short_text: String(explanation?.short_text || explanation?.summary || '').trim(),
    steps,
    images: normalizeImages(explanation?.images, 'explanation-image', 'Hình minh họa lời giải')
  };
}

function normalizeChoices(value) {
  const rawChoices = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? Object.entries(value).map(([key, text]) => ({ key, text }))
      : [];

  return rawChoices.map((choice, index) => {
    const key = String(choice?.key || String.fromCharCode(65 + index)).trim().toUpperCase();
    const legacyImages = [];
    if (choice?.image_url) legacyImages.push({ url: choice.image_url, alt_text: choice.alt_text || choice.text });
    if (typeof choice?.image === 'string') legacyImages.push({ url: choice.image, alt_text: choice.alt_text || choice.text });
    if (choice?.image && typeof choice.image === 'object') legacyImages.push(choice.image);

    return {
      key,
      text: String(choice?.text || choice?.label || choice?.value || '').trim(),
      images: normalizeImages(
        Array.isArray(choice?.images) ? choice.images : legacyImages,
        `choice-${key}-image`,
        `Hình minh họa đáp án ${key}`
      )
    };
  });
}

function normalizeImages(images, idPrefix, defaultAlt) {
  return (Array.isArray(images) ? images : [])
    .map((image, index) => normalizeImage(image, index, idPrefix, defaultAlt))
    .filter((image) => image.url);
}

function normalizeImage(image, index, idPrefix, defaultAlt) {
  const value = typeof image === 'string' ? { url: image } : image || {};
  const width = Number(value.width_percent || value.width || 100);
  return {
    id: String(value.id || `${idPrefix}-${index + 1}`),
    url: String(value.url || value.src || value.image_url || value.image || '').trim(),
    width_percent: Number.isFinite(width) ? Math.min(Math.max(Math.round(width), 20), 100) : 100,
    alt_text: String(value.alt_text || value.alt || defaultAlt || 'Hình minh họa').trim(),
    storage_provider: value.storage_provider || '',
    public_id: value.public_id || null
  };
}

/**
 * Điều kiện lọc dùng chung cho danh sách và phép đếm câu hỏi trong một bài.
 * Không lọc ở đây mà lọc sau khi truy vấn thì phân trang sẽ đếm sai tổng số.
 */
function buildLessonQuestionFilter(options = {}) {
  const where = ['lesson_id = ?', 'is_active = 1'];
  const params = [];
  const difficulty = String(options.difficulty || '').trim().toUpperCase();
  const keyword = String(options.keyword || '').trim();

  if (['EASY', 'MEDIUM', 'HARD', 'EXPERT'].includes(difficulty)) {
    where.push('difficulty = ?');
    params.push(difficulty);
  }
  if (keyword) {
    where.push("JSON_UNQUOTE(JSON_EXTRACT(content, '$.text')) LIKE ?");
    params.push(`%${keyword}%`);
  }
  return { whereClause: where.join(' AND '), params };
}

async function getQuestionsByLesson(lessonId, options = {}) {
  const limit = normalizePageLimit(options.limit || 0, 0);
  const offset = Math.max(Number(options.offset || 0), 0);
  const limitClause = limit > 0 ? `LIMIT ${limit} OFFSET ${offset}` : '';
  const filter = buildLessonQuestionFilter(options);

  try {
    const rows = await db.query(
      `SELECT *
       FROM QuestionBank
       WHERE ${filter.whereClause}
       ORDER BY FIELD(difficulty, 'EASY', 'MEDIUM', 'HARD', 'EXPERT'), id
       ${limitClause}`,
      [lessonId, ...filter.params]
    );
    return rows.map(normalizeQuestion);
  } catch (error) {
    fallbackOrThrow(error);
    return sampleData.questions
      .filter(
        (question) =>
          isActiveQuestion(question) && Number(question.lesson_id) === Number(lessonId)
      )
      .slice(offset, limit > 0 ? offset + limit : undefined)
      .map(normalizeQuestion);
  }
}

async function getTheoryReviewQuestions(lessonId, limit = 8) {
  return getQuestionsByLesson(lessonId, {
    limit: normalizePageLimit(limit, 8, 8),
    offset: 0
  });
}

async function getQuestionCandidates(options = {}) {
  const grade = Number(options.grade);
  if (!isSupportedGrade(grade)) return [];

  const chapterId = Number(options.chapterId || 0);
  const lessonId = Number(options.lessonId || 0);
  const semester = [1, 2].includes(Number(options.semester))
    ? Number(options.semester)
    : null;
  const conditions = ['c.grade = ?', 'q.is_active = 1'];
  const params = [grade];

  if (chapterId > 0) {
    conditions.push('c.id = ?');
    params.push(chapterId);
  }
  if (lessonId > 0) {
    conditions.push('l.id = ?');
    params.push(lessonId);
  }
  if (semester) {
    conditions.push('c.semester = ?');
    params.push(semester);
  }

  try {
    return await db.query(
      `SELECT
          q.id,
          q.lesson_id,
          l.chapter_id,
          l.lesson_name,
          c.chapter_name,
          c.grade,
          c.semester
       FROM QuestionBank q
       JOIN Lessons l ON l.id = q.lesson_id
       JOIN Chapters c ON c.id = l.chapter_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY c.sort_order, l.sort_order, q.id`,
      params
    );
  } catch (error) {
    fallbackOrThrow(error);
    return sampleData.chapters
      .filter((chapter) =>
        Number(chapter.grade) === grade
        && (!chapterId || Number(chapter.id) === chapterId)
        && (!semester || Number(chapter.semester) === semester)
      )
      .flatMap((chapter) =>
        chapter.lessons
          .filter((lesson) => !lessonId || Number(lesson.id) === lessonId)
          .flatMap((lesson) =>
            sampleData.questions
              .filter(
                (question) =>
                  isActiveQuestion(question)
                  && Number(question.lesson_id) === Number(lesson.id)
              )
              .map((question) => ({
                id: Number(question.id),
                lesson_id: Number(lesson.id),
                chapter_id: Number(chapter.id),
                lesson_name: lesson.lesson_name,
                chapter_name: chapter.chapter_name,
                grade: Number(chapter.grade),
                semester: Number(chapter.semester)
              }))
          )
      );
  }
}

async function countQuestionsByLesson(lessonId, options = {}) {
  const filter = buildLessonQuestionFilter(options);
  try {
    const rows = await db.query(
      `SELECT COUNT(*) AS total
       FROM QuestionBank
       WHERE ${filter.whereClause}`,
      [lessonId, ...filter.params]
    );
    return Number(rows[0]?.total || 0);
  } catch (error) {
    fallbackOrThrow(error);
    return sampleData.questions.filter(
      (question) =>
        isActiveQuestion(question) && Number(question.lesson_id) === Number(lessonId)
    ).length;
  }
}

async function getQuestionPageByLesson(lessonId, options = {}) {
  const page = Math.max(Number(options.page || 1), 1);
  const limit = normalizePageLimit(options.limit || 20, 20);
  const offset = (page - 1) * limit;
  const filterOptions = { difficulty: options.difficulty, keyword: options.keyword };
  const [questions, total] = await Promise.all([
    getQuestionsByLesson(lessonId, { limit, offset, ...filterOptions }),
    countQuestionsByLesson(lessonId, filterOptions)
  ]);

  return {
    questions,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1)
    }
  };
}

/**
 * Phân bố câu hỏi theo bốn mức độ khó, cho khối thống kê ở dashboard admin.
 */
async function getDifficultyStats() {
  const base = { EASY: 0, MEDIUM: 0, HARD: 0, EXPERT: 0 };
  try {
    const rows = await db.query(
      `SELECT q.difficulty, COUNT(*) AS total
       FROM QuestionBank q
       JOIN Lessons l ON l.id = q.lesson_id
       JOIN Chapters c ON c.id = l.chapter_id
       WHERE q.is_active = 1
         AND c.grade BETWEEN ${MIN_GRADE} AND ${MAX_GRADE}
       GROUP BY q.difficulty`
    );
    rows.forEach((row) => {
      const key = String(row.difficulty || '').toUpperCase();
      if (key in base) base[key] = Number(row.total || 0);
    });
    return base;
  } catch (error) {
    fallbackOrThrow(error);
    return base;
  }
}

/**
 * Tìm kiếm xuyên toàn bộ ngân hàng câu hỏi, không phải đi qua từng bài. Đây là
 * điểm nghẽn năng suất số một của người soạn nội dung: trước đây muốn tìm một
 * câu chỉ nhớ mang máng từ khóa thì phải mở lần lượt hàng chục bài học.
 *
 * missingExplanation lọc các câu chưa có lời giải — loại việc tồn đọng từng
 * phải rà bằng script trong đợt rà soát chất lượng ngân hàng.
 */
async function searchQuestions(filters = {}) {
  const where = ['q.is_active = 1'];
  const params = [];

  const grade = Number(filters.grade || 0);
  if (grade >= MIN_GRADE && grade <= MAX_GRADE) {
    where.push('c.grade = ?');
    params.push(grade);
  }

  const difficulty = String(filters.difficulty || '').trim().toUpperCase();
  if (['EASY', 'MEDIUM', 'HARD', 'EXPERT'].includes(difficulty)) {
    where.push('q.difficulty = ?');
    params.push(difficulty);
  }

  const questionType = String(filters.questionType || '').trim().toUpperCase();
  if (['MULTIPLE_CHOICE', 'FILL_IN_THE_BLANK'].includes(questionType)) {
    where.push('q.question_type = ?');
    params.push(questionType);
  }

  const keyword = String(filters.keyword || '').trim();
  if (keyword) {
    where.push("JSON_UNQUOTE(JSON_EXTRACT(q.content, '$.text')) LIKE ?");
    params.push(`%${keyword}%`);
  }

  if (filters.missingExplanation) {
    where.push("TRIM(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(q.explanation, '$.text')), '')) = ''");
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limit = normalizePageLimit(filters.limit || 50, 50);

  try {
    const rows = await db.query(
      `SELECT q.*, l.lesson_name, c.chapter_name, c.grade
       FROM QuestionBank q
       JOIN Lessons l ON l.id = q.lesson_id
       JOIN Chapters c ON c.id = l.chapter_id
       ${whereClause}
       ORDER BY q.id DESC
       LIMIT ${limit}`,
      params
    );
    return rows.map(normalizeQuestion);
  } catch (error) {
    fallbackOrThrow(error);
    return [];
  }
}

async function getQuestionById(id) {
  try {
    const rows = await db.query(
      'SELECT * FROM QuestionBank WHERE id = ? AND is_active = 1 LIMIT 1',
      [id]
    );
    return normalizeQuestion(rows[0]);
  } catch (error) {
    fallbackOrThrow(error);
    return normalizeQuestion(
      sampleData.questions.find(
        (question) => isActiveQuestion(question) && Number(question.id) === Number(id)
      )
    );
  }
}

async function getQuestionsByIds(ids) {
  const questionIds = ids.map(Number).filter(Boolean);
  if (questionIds.length === 0) return [];

  try {
    const placeholders = questionIds.map(() => '?').join(',');
    const rows = await db.query(
      `SELECT q.*, l.lesson_name, c.grade
       FROM QuestionBank q
       JOIN Lessons l ON l.id = q.lesson_id
       JOIN Chapters c ON c.id = l.chapter_id
       WHERE q.id IN (${placeholders})`,
      questionIds
    );
    const byId = new Map(rows.map((row) => [Number(row.id), normalizeQuestion(row)]));
    return questionIds.map((id) => byId.get(Number(id))).filter(Boolean);
  } catch (error) {
    fallbackOrThrow(error);
    const byId = new Map(sampleData.questions.map((question) => [Number(question.id), normalizeQuestion(question)]));
    return questionIds.map((id) => byId.get(Number(id))).filter(Boolean);
  }
}

// Script import câu hỏi tự sinh sẵn các dòng lỗi sai rỗng để giáo viên bổ sung
// nội dung sau. Những dòng chưa được biên soạn này không giúp ích gì cho học
// sinh nên bị lọc bỏ, nhường chỗ cho lời giải từng bước.
const PLACEHOLDER_MISCONCEPTION_TEXTS = [
  'đối chiếu lại dữ kiện và yêu cầu của câu hỏi.',
  'đối chiếu lại dữ kiện và yêu cầu của câu hỏi'
];

function isPlaceholderMisconception(misconception) {
  if (!misconception) return true;
  const explanation = String(misconception.explanation || '').trim().toLowerCase();
  if (!explanation) return true;
  return PLACEHOLDER_MISCONCEPTION_TEXTS.includes(explanation);
}

async function getMisconception(questionId, selectedAnswer) {
  try {
    const rows = await db.query(
      `SELECT *
       FROM CommonMisconceptions
       WHERE question_id = ? AND distractor_key = ?
       LIMIT 1`,
      [questionId, selectedAnswer]
    );
    const misconception = rows[0] || null;
    return isPlaceholderMisconception(misconception) ? null : misconception;
  } catch (error) {
    fallbackOrThrow(error);
    const fallback = sampleData.misconceptions.find(
      (item) => Number(item.question_id) === Number(questionId) && item.distractor_key === selectedAnswer
    ) || null;
    return isPlaceholderMisconception(fallback) ? null : fallback;
  }
}

async function getMisconceptionsByQuestion(questionId) {
  try {
    return await db.query(
      `SELECT *
       FROM CommonMisconceptions
       WHERE question_id = ?
       ORDER BY distractor_key, id`,
      [questionId]
    );
  } catch (error) {
    fallbackOrThrow(error);
    return sampleData.misconceptions.filter((item) => Number(item.question_id) === Number(questionId));
  }
}

async function getMisconceptionsByQuestionIds(questionIds) {
  const ids = [...new Set((questionIds || []).map(Number).filter(Boolean))];
  if (ids.length === 0) return new Map();
  try {
    const placeholders = ids.map(() => '?').join(',');
    const rows = await db.query(
      `SELECT *
       FROM CommonMisconceptions
       WHERE question_id IN (${placeholders})
       ORDER BY question_id, distractor_key, id`,
      ids
    );
    return rows.reduce((result, row) => {
      const key = Number(row.question_id);
      if (!result.has(key)) result.set(key, []);
      if (!isPlaceholderMisconception(row)) result.get(key).push(row);
      return result;
    }, new Map());
  } catch (error) {
    fallbackOrThrow(error);
    return ids.reduce((result, id) => {
      result.set(
        id,
        sampleData.misconceptions.filter(
          (item) => Number(item.question_id) === id && !isPlaceholderMisconception(item)
        )
      );
      return result;
    }, new Map());
  }
}

async function listQuestions() {
  try {
    const rows = await db.query(
      `SELECT q.*, l.lesson_name, c.chapter_name, c.grade
       FROM QuestionBank q
       JOIN Lessons l ON l.id = q.lesson_id
       JOIN Chapters c ON c.id = l.chapter_id
       WHERE q.is_active = 1
         AND c.grade BETWEEN ${MIN_GRADE} AND ${MAX_GRADE}
       ORDER BY q.created_at DESC, q.id DESC`
    );
    return rows.map(normalizeQuestion);
  } catch (error) {
    fallbackOrThrow(error);
    return sampleData.questions.filter(isActiveQuestion).map((question) => {
      const chapter = sampleData.chapters.find((item) =>
        item.lessons.some((lesson) => Number(lesson.id) === Number(question.lesson_id))
      );
      const lesson = chapter?.lessons.find((item) => Number(item.id) === Number(question.lesson_id));
      return {
        ...normalizeQuestion(question),
        lesson_name: lesson?.lesson_name || '',
        chapter_name: chapter?.chapter_name || '',
        grade: chapter?.grade || ''
      };
    });
  }
}

async function getAdminStats() {
  try {
    const rows = await db.query(
      `SELECT
          COUNT(*) AS question_count,
          COUNT(DISTINCT q.lesson_id) AS lesson_count,
          SUM(CASE WHEN q.difficulty = 'EASY' THEN 1 ELSE 0 END) AS easy_count
       FROM QuestionBank q
       JOIN Lessons l ON l.id = q.lesson_id
       JOIN Chapters c ON c.id = l.chapter_id
       WHERE q.is_active = 1
         AND c.grade BETWEEN ${MIN_GRADE} AND ${MAX_GRADE}`
    );
    const stats = rows[0] || {};
    return {
      questionCount: Number(stats.question_count || 0),
      lessonCount: Number(stats.lesson_count || 0),
      easyCount: Number(stats.easy_count || 0)
    };
  } catch (error) {
    fallbackOrThrow(error);
    const supportedLessonIds = new Set(
      sampleData.chapters
        .filter((chapter) => isSupportedGrade(chapter.grade))
        .flatMap((chapter) => chapter.lessons.map((lesson) => Number(lesson.id)))
    );
    const supportedQuestions = sampleData.questions.filter(
      (question) =>
        isActiveQuestion(question) && supportedLessonIds.has(Number(question.lesson_id))
    );
    const lessonIds = new Set(supportedQuestions.map((question) => Number(question.lesson_id)));
    return {
      questionCount: supportedQuestions.length,
      lessonCount: lessonIds.size,
      easyCount: supportedQuestions.filter((question) => question.difficulty === 'EASY').length
    };
  }
}

async function getRecentQuestions(limit = 6) {
  const safeLimit = normalizePageLimit(limit, 6, 50);
  try {
    const rows = await db.query(
      `SELECT q.*, l.lesson_name, c.chapter_name, c.grade
       FROM QuestionBank q
       JOIN Lessons l ON l.id = q.lesson_id
       JOIN Chapters c ON c.id = l.chapter_id
       WHERE q.is_active = 1
         AND c.grade BETWEEN ${MIN_GRADE} AND ${MAX_GRADE}
       ORDER BY q.created_at DESC, q.id DESC
       LIMIT ${safeLimit}`
    );
    return rows.map(normalizeQuestion);
  } catch (error) {
    fallbackOrThrow(error);
    return (await listQuestions()).slice(0, safeLimit);
  }
}

async function getQuestionCountsByLesson() {
  try {
    return await db.query(
      `SELECT q.lesson_id, COUNT(*) AS question_count
       FROM QuestionBank q
       JOIN Lessons l ON l.id = q.lesson_id
       JOIN Chapters c ON c.id = l.chapter_id
       WHERE q.is_active = 1
         AND c.grade BETWEEN ${MIN_GRADE} AND ${MAX_GRADE}
       GROUP BY q.lesson_id`
    );
  } catch (error) {
    fallbackOrThrow(error);
    const supportedLessonIds = new Set(
      sampleData.chapters
        .filter((chapter) => isSupportedGrade(chapter.grade))
        .flatMap((chapter) => chapter.lessons.map((lesson) => Number(lesson.id)))
    );
    const counts = new Map();
    for (const question of sampleData.questions) {
      const lessonId = Number(question.lesson_id);
      if (!isActiveQuestion(question) || !supportedLessonIds.has(lessonId)) continue;
      counts.set(lessonId, (counts.get(lessonId) || 0) + 1);
    }
    return Array.from(counts.entries()).map(([lesson_id, question_count]) => ({
      lesson_id,
      question_count
    }));
  }
}

async function updateQuestion(id, payload) {
  try {
    return await db.transaction(async (connection) => {
      const [result] = await connection.execute(
        `UPDATE QuestionBank
         SET lesson_id = ?,
             question_type = ?,
             difficulty = ?,
             layout_template = ?,
             content = CAST(? AS JSON),
             choices = CAST(? AS JSON),
             correct_answer = ?,
             explanation = CAST(? AS JSON)
         WHERE id = ? AND is_active = 1`,
        [
          payload.lesson_id,
          payload.question_type,
          payload.difficulty,
          payload.layout_template,
          JSON.stringify(payload.content),
          JSON.stringify(payload.choices),
          payload.correct_answer,
          JSON.stringify(payload.explanation),
          id
        ]
      );
      if (!result.affectedRows) return null;

      await connection.execute('DELETE FROM CommonMisconceptions WHERE question_id = ?', [id]);
      for (const misconception of payload.misconceptions || []) {
        await connection.execute(
          `INSERT INTO CommonMisconceptions
            (question_id, distractor_key, misconception_name, explanation)
           VALUES (?, ?, ?, ?)`,
          [
            id,
            misconception.distractor_key,
            misconception.misconception_name,
            misconception.explanation
          ]
        );
      }

      return { ...payload, id };
    });
  } catch (error) {
    fallbackOrThrow(error);
    const index = sampleData.questions.findIndex(
      (question) => isActiveQuestion(question) && Number(question.id) === Number(id)
    );
    if (index === -1) return null;

    sampleData.questions[index] = {
      ...sampleData.questions[index],
      ...payload,
      id: Number(id)
    };
    sampleData.misconceptions = sampleData.misconceptions.filter(
      (item) => Number(item.question_id) !== Number(id)
    );
    for (const misconception of payload.misconceptions || []) {
      sampleData.misconceptions.push({
        id: sampleData.misconceptions.length + 1,
        question_id: Number(id),
        ...misconception
      });
    }
    return sampleData.questions[index];
  }
}

async function deleteQuestion(id) {
  try {
    const result = await db.query(
      `UPDATE QuestionBank
       SET is_active = 0, archived_at = CURRENT_TIMESTAMP
       WHERE id = ? AND is_active = 1`,
      [id]
    );
    return Number(result.affectedRows || 0) > 0;
  } catch (error) {
    fallbackOrThrow(error);
    const index = sampleData.questions.findIndex(
      (question) => isActiveQuestion(question) && Number(question.id) === Number(id)
    );
    if (index === -1) return false;

    sampleData.questions[index] = {
      ...sampleData.questions[index],
      is_active: 0,
      archived_at: new Date().toISOString()
    };
    return true;
  }
}

async function createQuestion(payload) {
  try {
    return await db.transaction(async (connection) => {
      const [result] = await connection.execute(
        `INSERT INTO QuestionBank
          (lesson_id, concept_id, question_type, difficulty, layout_template, content, choices, correct_answer, explanation, is_active)
         VALUES (?, NULL, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), ?, CAST(? AS JSON), 1)`,
        [
          payload.lesson_id,
          payload.question_type,
          payload.difficulty,
          payload.layout_template,
          JSON.stringify(payload.content),
          JSON.stringify(payload.choices),
          payload.correct_answer,
          JSON.stringify(payload.explanation)
        ]
      );

      const questionId = result.insertId;
      for (const misconception of payload.misconceptions || []) {
        await connection.execute(
          `INSERT INTO CommonMisconceptions
            (question_id, distractor_key, misconception_name, explanation)
           VALUES (?, ?, ?, ?)`,
          [
            questionId,
            misconception.distractor_key,
            misconception.misconception_name,
            misconception.explanation
          ]
        );
      }

      return { ...payload, id: questionId, is_active: 1 };
    });
  } catch (error) {
    fallbackOrThrow(error);
    const question = {
      ...payload,
      id: Math.max(...sampleData.questions.map((item) => item.id), 1000) + 1,
      is_active: 1
    };
    sampleData.questions.push(question);
    for (const misconception of payload.misconceptions || []) {
      sampleData.misconceptions.push({
        id: sampleData.misconceptions.length + 1,
        question_id: question.id,
        ...misconception
      });
    }
    return question;
  }
}

function normalizePageLimit(value, fallback = 20, max = 100) {
  const limit = Number(value);
  if (!Number.isFinite(limit) || limit <= 0) return fallback;
  return Math.min(Math.max(Math.round(limit), 1), max);
}

async function recordAnswer({ studentId, practiceSessionId, questionId, selectedAnswer, isCorrect, misconceptionId, timeSpentSeconds }) {
  try {
    await db.query(
      `INSERT INTO StudentLogs
        (student_id, practice_session_id, question_id, selected_answer, is_correct, detected_misconception_id, time_spent_seconds)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [studentId, practiceSessionId || null, questionId, selectedAnswer, isCorrect ? 1 : 0, misconceptionId || null, timeSpentSeconds || null]
    );
  } catch (error) {
    fallbackOrThrow(error);
    sampleData.studentLogs.push({
      id: sampleData.studentLogs.length + 1,
      student_id: studentId,
      practice_session_id: practiceSessionId || null,
      question_id: questionId,
      selected_answer: selectedAnswer,
      is_correct: Boolean(isCorrect),
      detected_misconception_id: misconceptionId || null,
      time_spent_seconds: timeSpentSeconds || null,
      created_at: new Date()
    });
  }
}

module.exports = {
  getQuestionsByLesson,
  getTheoryReviewQuestions,
  getQuestionCandidates,
  getQuestionPageByLesson,
  searchQuestions,
  getDifficultyStats,
  countQuestionsByLesson,
  getQuestionById,
  getQuestionsByIds,
  getMisconception,
  getMisconceptionsByQuestion,
  getMisconceptionsByQuestionIds,
  listQuestions,
  getAdminStats,
  getRecentQuestions,
  getQuestionCountsByLesson,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  recordAnswer
};
