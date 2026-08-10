// M? h?nh question ??nh ngh?a truy c?p, ki?m tra v? bi?n ??i d? li?u c?a m?t th?c th? trong h? th?ng.
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

// H?m normalizeQuestion d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function normalizeQuestion(row) {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!row) return null;
  const content = normalizeQuestionContent(parseJsonField(row.content, row.content ?? { text: '', images: [] }));
  const explanation = normalizeExplanation(parseJsonField(row.explanation, row.explanation ?? { text: '', images: [] }));

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (content.text) content.text = normalizeQuestionText(content.text);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (explanation.text) explanation.text = normalizeExplanationText(explanation.text);

  return {
    ...row,
    layout_template: normalizeLayoutTemplate(row.layout_template),
    content,
    choices: normalizeChoices(parseJsonField(row.choices, [])),
    explanation
  };
}

// H?m questionRevision d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function questionRevision(value) {
  const question = normalizeQuestion(value);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!question) return '';
  return JSON.stringify({
    lesson_id: Number(question.lesson_id),
    question_type: String(question.question_type || ''),
    difficulty: String(question.difficulty || ''),
    layout_template: question.layout_template,
    content: question.content,
    choices: question.choices,
    correct_answer: String(question.correct_answer || ''),
    explanation: question.explanation
  });
}

// H?m isActiveQuestion d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function isActiveQuestion(question) {
  return Number(question?.is_active ?? 1) === 1;
}

// H?m normalizeLayoutTemplate d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function normalizeLayoutTemplate(value) {
  const layout = String(value || '').trim().toUpperCase();
  return LAYOUT_TEMPLATES.has(layout) ? layout : 'STACK_VERTICAL';
}

// H?m normalizeQuestionContent d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function normalizeQuestionContent(content) {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
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

// H?m normalizeQuestionInteraction d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function normalizeQuestionInteraction(value) {
  const interaction = String(value || '').trim();
  return ['none', 'choose', 'fill_blank', 'count', 'compare'].includes(interaction) ? interaction : 'none';
}

// H?m normalizeLayoutVariant d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
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

// H?m normalizeExplanation d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function normalizeExplanation(explanation) {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
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

// H?m normalizeChoices d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function normalizeChoices(value) {
  const rawChoices = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? Object.entries(value).map(([key, text]) => ({ key, text }))
      : [];

  return rawChoices.map((choice, index) => {
    const key = String(choice?.key || String.fromCharCode(65 + index)).trim().toUpperCase();
    const legacyImages = [];
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (choice?.image_url) legacyImages.push({ url: choice.image_url, alt_text: choice.alt_text || choice.text });
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (typeof choice?.image === 'string') legacyImages.push({ url: choice.image, alt_text: choice.alt_text || choice.text });
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
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

// H?m normalizeImages d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function normalizeImages(images, idPrefix, defaultAlt) {
  return (Array.isArray(images) ? images : [])
    .map((image, index) => normalizeImage(image, index, idPrefix, defaultAlt))
    .filter((image) => image.url);
}

// H?m normalizeImage d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function normalizeImage(image, index, idPrefix, defaultAlt) {
  const value = typeof image === 'string' ? { url: image } : image || {};
  const width = Number(value.width_percent || value.width || 100);
  return {
    id: String(value.id || `${idPrefix}-${index + 1}`),
    url: String(value.url || value.src || value.image_url || value.image || '').trim(),
    width_percent: Number.isFinite(width) ? Math.min(Math.max(Math.round(width), 20), 100) : 100,
    alt_text: String(value.alt_text || value.alt || defaultAlt || 'Hình minh họa').trim(),
    storage_provider: value.storage_provider || '',
    public_id: value.public_id || null,
    cloud_name: value.cloud_name || null
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

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (['EASY', 'MEDIUM', 'HARD', 'EXPERT'].includes(difficulty)) {
    where.push('difficulty = ?');
    params.push(difficulty);
  }
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (keyword) {
    where.push("JSON_UNQUOTE(JSON_EXTRACT(content, '$.text')) LIKE ?");
    params.push(`%${keyword}%`);
  }
  return { whereClause: where.join(' AND '), params };
}

// H?m getQuestionsByLesson d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function getQuestionsByLesson(lessonId, options = {}) {
  const limit = normalizePageLimit(options.limit || 0, 0);
  const offset = Math.max(Number(options.offset || 0), 0);
  const limitClause = limit > 0 ? `LIMIT ${limit} OFFSET ${offset}` : '';
  const filter = buildLessonQuestionFilter(options);

  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
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

// H?m getTheoryReviewQuestions d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function getTheoryReviewQuestions(lessonId, limit = 8) {
  return getQuestionsByLesson(lessonId, {
    limit: normalizePageLimit(limit, 8, 8),
    offset: 0
  });
}

// H?m getQuestionCandidates d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function getQuestionCandidates(options = {}) {
  const grade = Number(options.grade);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!isSupportedGrade(grade)) return [];

  const chapterId = Number(options.chapterId || 0);
  const lessonId = Number(options.lessonId || 0);
  const semester = [1, 2].includes(Number(options.semester))
    ? Number(options.semester)
    : null;
  const conditions = ['c.grade = ?', 'q.is_active = 1'];
  const params = [grade];

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (chapterId > 0) {
    conditions.push('c.id = ?');
    params.push(chapterId);
  }
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (lessonId > 0) {
    conditions.push('l.id = ?');
    params.push(lessonId);
  }
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (semester) {
    conditions.push('c.semester = ?');
    params.push(semester);
  }

  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    return await db.query(
      `SELECT
          q.id,
          q.lesson_id,
          q.concept_id,
          q.difficulty,
          q.question_type,
          q.correct_answer,
          JSON_UNQUOTE(JSON_EXTRACT(q.content, '$.text')) AS content_text,
          l.chapter_id,
          l.lesson_name,
          l.sort_order AS lesson_sort_order,
          c.chapter_name,
          c.grade,
          c.semester,
          c.sort_order AS chapter_sort_order
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
                concept_id: question.concept_id || null,
                difficulty: question.difficulty,
                question_type: question.question_type,
                correct_answer: question.correct_answer,
                content_text: typeof question.content === 'string'
                  ? question.content
                  : question.content?.text || '',
                chapter_id: Number(chapter.id),
                lesson_name: lesson.lesson_name,
                lesson_sort_order: Number(lesson.sort_order),
                chapter_name: chapter.chapter_name,
                grade: Number(chapter.grade),
                semester: Number(chapter.semester),
                chapter_sort_order: Number(chapter.sort_order)
              }))
          )
      );
  }
}

// H?m getRecentQuestionIds d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function getRecentQuestionIds(options = {}) {
  const studentId = Number(options.studentId);
  const grade = Number(options.grade);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!studentId || !isSupportedGrade(grade)) return [];

  const lessonId = Number(options.lessonId || 0);
  const chapterId = Number(options.chapterId || 0);
  const semester = [1, 2].includes(Number(options.semester))
    ? Number(options.semester)
    : null;
  const limit = Math.min(Math.max(Number(options.limit) || 5, 1), 100);
  const conditions = ['sl.student_id = ?', 'c.grade = ?'];
  const params = [studentId, grade];
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (lessonId > 0) {
    conditions.push('l.id = ?');
    params.push(lessonId);
  }
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (chapterId > 0) {
    conditions.push('c.id = ?');
    params.push(chapterId);
  }
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (semester) {
    conditions.push('c.semester = ?');
    params.push(semester);
  }

  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    const rows = await db.query(
      `SELECT q.id, MAX(sl.created_at) AS last_answered_at
       FROM StudentLogs sl
       JOIN QuestionBank q ON q.id = sl.question_id
       JOIN Lessons l ON l.id = q.lesson_id
       JOIN Chapters c ON c.id = l.chapter_id
       WHERE ${conditions.join(' AND ')}
       GROUP BY q.id
       ORDER BY last_answered_at DESC, q.id DESC
       LIMIT ${limit}`,
      params
    );
    return rows.map((row) => Number(row.id)).filter(Boolean);
  } catch (error) {
    fallbackOrThrow(error);
    const allowedQuestionIds = new Set(
      sampleData.chapters
        .filter((chapter) => (
          Number(chapter.grade) === grade
          && (!chapterId || Number(chapter.id) === chapterId)
          && (!semester || Number(chapter.semester) === semester)
        ))
        .flatMap((chapter) => chapter.lessons)
        .filter((lesson) => !lessonId || Number(lesson.id) === lessonId)
        .flatMap((lesson) => sampleData.questions
          .filter((question) => Number(question.lesson_id) === Number(lesson.id))
          .map((question) => Number(question.id)))
    );
    return sampleData.studentLogs
      .filter((log) => (
        Number(log.student_id) === studentId
        && allowedQuestionIds.has(Number(log.question_id))
      ))
      .sort((left, right) => (
        new Date(right.created_at || 0) - new Date(left.created_at || 0)
        || Number(right.id || 0) - Number(left.id || 0)
      ))
      .map((log) => Number(log.question_id))
      .filter((id, index, ids) => ids.indexOf(id) === index)
      .slice(0, limit);
  }
}

// H?m getPracticeSelectionHistory d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function getPracticeSelectionHistory(options = {}) {
  const studentId = Number(options.studentId);
  const grade = Number(options.grade);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!studentId || !isSupportedGrade(grade)) return emptySelectionHistory();

  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    const rows = await db.query(
      `SELECT
          q.id AS question_id,
          q.lesson_id,
          l.chapter_id,
          COUNT(*) AS appearance_count,
          MAX(ps.started_at) AS last_selected_at
       FROM PracticeSessionQuestions psq
       JOIN PracticeSessions ps ON ps.id = psq.practice_session_id
       JOIN QuestionBank q ON q.id = psq.question_id
       JOIN Lessons l ON l.id = q.lesson_id
       JOIN Chapters c ON c.id = l.chapter_id
       WHERE ps.student_id = ?
         AND c.grade = ?
         AND ps.session_mode IN ('LESSON', 'CHAPTER', 'COMPREHENSIVE')
       GROUP BY q.id, q.lesson_id, l.chapter_id`,
      [studentId, grade]
    );
    return buildSelectionHistory(rows);
  } catch (error) {
    fallbackOrThrow(error);
    const questionById = new Map(sampleData.questions.map((question) => [Number(question.id), question]));
    const lessonById = new Map(
      sampleData.chapters.flatMap((chapter) => chapter.lessons.map((lesson) => [
        Number(lesson.id),
        { ...lesson, chapter_id: Number(chapter.id), grade: Number(chapter.grade) }
      ]))
    );
    const rows = [];
    // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
    for (const session of sampleData.practiceSessions || []) {
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (
        Number(session.student_id) !== studentId
        || !['LESSON', 'CHAPTER', 'COMPREHENSIVE'].includes(String(session.session_mode || '').toUpperCase())
      ) continue;
      // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
      for (const questionId of session.question_ids || []) {
        const question = questionById.get(Number(questionId));
        const lesson = lessonById.get(Number(question?.lesson_id));
        // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
        if (!question || Number(lesson?.grade) !== grade) continue;
        rows.push({
          question_id: Number(question.id),
          lesson_id: Number(question.lesson_id),
          chapter_id: Number(lesson.chapter_id),
          appearance_count: 1,
          last_selected_at: session.started_at || null
        });
      }
    }
    return buildSelectionHistory(rows);
  }
}

// H?m buildSelectionHistory d?ng ?? x?y d?ng k?t qu? t? c?c ngu?n d? li?u v? quy t?c li?n quan; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function buildSelectionHistory(rows = []) {
  const history = emptySelectionHistory();
  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const row of rows) {
    const questionId = Number(row.question_id);
    const lessonId = Number(row.lesson_id);
    const chapterId = Number(row.chapter_id);
    const count = Math.max(0, Number(row.appearance_count) || 0);
    const lastSelectedAt = normalizeHistoryTimestamp(row.last_selected_at);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!questionId || !lessonId || !chapterId || count === 0) continue;
    mergeHistoryEntry(history.questions, questionId, count, lastSelectedAt);
    mergeHistoryEntry(history.lessons, lessonId, count, lastSelectedAt);
  }
  return history;
}

// H?m emptySelectionHistory d?ng ?? l?a ch?n ph??ng ?n ph? h?p d?a tr?n tr?ng th?i v? ?u ti?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function emptySelectionHistory() {
  return { questions: {}, lessons: {} };
}

// H?m mergeHistoryEntry d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function mergeHistoryEntry(target, id, count, lastSelectedAt) {
  const current = target[id] || { count: 0, lastSelectedAt: null };
  current.count += count;
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (timestampValue(lastSelectedAt) > timestampValue(current.lastSelectedAt)) {
    current.lastSelectedAt = lastSelectedAt;
  }
  target[id] = current;
}

// H?m normalizeHistoryTimestamp d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function normalizeHistoryTimestamp(value) {
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(String(value || ''));
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

// H?m timestampValue d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function timestampValue(value) {
  const timestamp = Date.parse(String(value || ''));
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

// H?m countQuestionsByLesson d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function countQuestionsByLesson(lessonId, options = {}) {
  const filter = buildLessonQuestionFilter(options);
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
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

// H?m getQuestionPageByLesson d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
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
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
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
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
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
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (grade >= MIN_GRADE && grade <= MAX_GRADE) {
    where.push('c.grade = ?');
    params.push(grade);
  }

  const difficulty = String(filters.difficulty || '').trim().toUpperCase();
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (['EASY', 'MEDIUM', 'HARD', 'EXPERT'].includes(difficulty)) {
    where.push('q.difficulty = ?');
    params.push(difficulty);
  }

  const questionType = String(filters.questionType || '').trim().toUpperCase();
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (['MULTIPLE_CHOICE', 'FILL_IN_THE_BLANK'].includes(questionType)) {
    where.push('q.question_type = ?');
    params.push(questionType);
  }

  const keyword = String(filters.keyword || '').trim();
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (keyword) {
    where.push("JSON_UNQUOTE(JSON_EXTRACT(q.content, '$.text')) LIKE ?");
    params.push(`%${keyword}%`);
  }

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (filters.missingExplanation) {
    where.push("TRIM(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(q.explanation, '$.text')), '')) = ''");
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limit = normalizePageLimit(filters.limit || 50, 50);

  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
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

// H?m getQuestionById d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function getQuestionById(id) {
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
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

// H?m getQuestionsByIds d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function getQuestionsByIds(ids) {
  const questionIds = ids.map(Number).filter(Boolean);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (questionIds.length === 0) return [];

  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
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

// H?m isPlaceholderMisconception d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function isPlaceholderMisconception(misconception) {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!misconception) return true;
  const explanation = String(misconception.explanation || '').trim().toLowerCase();
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!explanation) return true;
  return PLACEHOLDER_MISCONCEPTION_TEXTS.includes(explanation);
}

// H?m getMisconception d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function getMisconception(questionId, selectedAnswer) {
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
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

// H?m getMisconceptionsByQuestion d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function getMisconceptionsByQuestion(questionId) {
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
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

// H?m getMisconceptionsByQuestionIds d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function getMisconceptionsByQuestionIds(questionIds) {
  const ids = [...new Set((questionIds || []).map(Number).filter(Boolean))];
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (ids.length === 0) return new Map();
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
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
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (!result.has(key)) result.set(key, []);
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
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

// H?m listQuestions d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function listQuestions() {
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
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

// H?m getAdminStats d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function getAdminStats() {
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
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

// H?m getRecentQuestions d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function getRecentQuestions(limit = 6) {
  const safeLimit = normalizePageLimit(limit, 6, 50);
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
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

// H?m getQuestionCountsByLesson d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function getQuestionCountsByLesson() {
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
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
    // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
    for (const question of sampleData.questions) {
      const lessonId = Number(question.lesson_id);
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (!isActiveQuestion(question) || !supportedLessonIds.has(lessonId)) continue;
      counts.set(lessonId, (counts.get(lessonId) || 0) + 1);
    }
    return Array.from(counts.entries()).map(([lesson_id, question_count]) => ({
      lesson_id,
      question_count
    }));
  }
}

// H?m updateQuestion d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function updateQuestion(
  id,
  payload,
  {
    expectedQuestion,
    transaction = db.transaction
  } = {}
) {
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    return await transaction(async (connection) => {
      const [currentRows] = await connection.execute(
        `SELECT *
         FROM QuestionBank
         WHERE id = ? AND is_active = 1
         LIMIT 1
         FOR UPDATE`,
        [id]
      );
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (!currentRows[0]) return null;
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (
        expectedQuestion
        && questionRevision(currentRows[0]) !== questionRevision(expectedQuestion)
      ) {
        return null;
      }

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
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (!result.affectedRows) return null;

      await connection.execute('DELETE FROM CommonMisconceptions WHERE question_id = ?', [id]);
      // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
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
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (index === -1) return null;
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (
      expectedQuestion
      && questionRevision(sampleData.questions[index]) !== questionRevision(expectedQuestion)
    ) {
      return null;
    }

    sampleData.questions[index] = {
      ...sampleData.questions[index],
      ...payload,
      id: Number(id)
    };
    sampleData.misconceptions = sampleData.misconceptions.filter(
      (item) => Number(item.question_id) !== Number(id)
    );
    // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
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

// H?m deleteQuestion d?ng ?? x?a ho?c gi?i ph?ng t?i nguy?n theo ?i?u ki?n an to?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function deleteQuestion(id) {
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
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
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (index === -1) return false;

    sampleData.questions[index] = {
      ...sampleData.questions[index],
      is_active: 0,
      archived_at: new Date().toISOString()
    };
    return true;
  }
}

// H?m insertQuestionWithConnection d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function insertQuestionWithConnection(connection, payload) {
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
  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
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
}

// H?m createFallbackQuestion d?ng ?? t?o b?n ghi ho?c t?i nguy?n m?i sau khi ki?m tra ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function createFallbackQuestion(payload) {
  const question = {
    ...payload,
    id: Math.max(...sampleData.questions.map((item) => item.id), 1000) + 1,
    is_active: 1
  };
  sampleData.questions.push(question);
  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const misconception of payload.misconceptions || []) {
    sampleData.misconceptions.push({
      id: sampleData.misconceptions.length + 1,
      question_id: question.id,
      ...misconception
    });
  }
  return question;
}

// H?m createQuestion d?ng ?? t?o b?n ghi ho?c t?i nguy?n m?i sau khi ki?m tra ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function createQuestion(payload) {
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    return await db.transaction(
      (connection) => insertQuestionWithConnection(connection, payload)
    );
  } catch (error) {
    fallbackOrThrow(error);
    return createFallbackQuestion(payload);
  }
}

// H?m duplicateQuestion d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function duplicateQuestion(
  sourceId,
  {
    transaction = db.transaction,
    copySuffix = ' (bản sao — cần sửa lại)'
  } = {}
) {
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    return await transaction(async (connection) => {
      const [sourceRows] = await connection.execute(
        `SELECT *
         FROM QuestionBank
         WHERE id = ? AND is_active = 1
         LIMIT 1
         FOR SHARE`,
        [Number(sourceId)]
      );
      const source = normalizeQuestion(sourceRows[0]);
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (!source) return null;

      const [misconceptions] = await connection.execute(
        `SELECT distractor_key, misconception_name, explanation
         FROM CommonMisconceptions
         WHERE question_id = ?
         ORDER BY id
         FOR SHARE`,
        [Number(sourceId)]
      );
      const payload = {
        lesson_id: source.lesson_id,
        question_type: source.question_type,
        difficulty: source.difficulty,
        layout_template: source.layout_template,
        content: {
          ...source.content,
          text: `${String(source.content?.text || '').trim()}${copySuffix}`.trim()
        },
        choices: source.choices || [],
        correct_answer: source.correct_answer,
        explanation: source.explanation || {},
        misconceptions: misconceptions.map((item) => ({
          distractor_key: item.distractor_key,
          misconception_name: item.misconception_name,
          explanation: item.explanation
        }))
      };
      return insertQuestionWithConnection(connection, payload);
    });
  } catch (error) {
    fallbackOrThrow(error);
    const source = normalizeQuestion(
      sampleData.questions.find(
        (question) => isActiveQuestion(question)
          && Number(question.id) === Number(sourceId)
      )
    );
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!source) return null;
    const misconceptions = sampleData.misconceptions
      .filter((item) => Number(item.question_id) === Number(sourceId))
      .map((item) => ({
        distractor_key: item.distractor_key,
        misconception_name: item.misconception_name,
        explanation: item.explanation
      }));
    return createFallbackQuestion({
      lesson_id: source.lesson_id,
      question_type: source.question_type,
      difficulty: source.difficulty,
      layout_template: source.layout_template,
      content: {
        ...source.content,
        text: `${String(source.content?.text || '').trim()}${copySuffix}`.trim()
      },
      choices: source.choices || [],
      correct_answer: source.correct_answer,
      explanation: source.explanation || {},
      misconceptions
    });
  }
}

// H?m normalizePageLimit d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function normalizePageLimit(value, fallback = 20, max = 100) {
  const limit = Number(value);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!Number.isFinite(limit) || limit <= 0) return fallback;
  return Math.min(Math.max(Math.round(limit), 1), max);
}

// H?m recordAnswer d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function recordAnswer({ studentId, practiceSessionId, questionId, selectedAnswer, isCorrect, misconceptionId, timeSpentSeconds }) {
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
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
  getRecentQuestionIds,
  getPracticeSelectionHistory,
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
  duplicateQuestion,
  questionRevision,
  updateQuestion,
  deleteQuestion,
  recordAnswer
};
