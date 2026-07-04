const db = require('../config/db');
const sampleData = require('../sample-data/sampleData');
const { parseJsonField } = require('../utils/json');

function normalizeQuestion(row) {
  if (!row) return null;
  return {
    ...row,
    content: parseJsonField(row.content, { text: '', images: [] }),
    choices: parseJsonField(row.choices, []),
    explanation: parseJsonField(row.explanation, { text: '', images: [] })
  };
}

async function getQuestionsByLesson(lessonId, options = {}) {
  const limit = normalizePageLimit(options.limit || 0, 0);
  const offset = Math.max(Number(options.offset || 0), 0);
  const limitClause = limit > 0 ? `LIMIT ${limit} OFFSET ${offset}` : '';

  try {
    const rows = await db.query(
      `SELECT *
       FROM QuestionBank
       WHERE lesson_id = ?
       ORDER BY FIELD(difficulty, 'EASY', 'MEDIUM', 'HARD', 'EXPERT'), id
       ${limitClause}`,
      [lessonId]
    );
    return rows.map(normalizeQuestion);
  } catch (error) {
    return sampleData.questions
      .filter((question) => Number(question.lesson_id) === Number(lessonId))
      .slice(offset, limit > 0 ? offset + limit : undefined)
      .map(normalizeQuestion);
  }
}

async function countQuestionsByLesson(lessonId) {
  try {
    const rows = await db.query(
      `SELECT COUNT(*) AS total
       FROM QuestionBank
       WHERE lesson_id = ?`,
      [lessonId]
    );
    return Number(rows[0]?.total || 0);
  } catch (error) {
    return sampleData.questions.filter((question) => Number(question.lesson_id) === Number(lessonId)).length;
  }
}

async function getQuestionPageByLesson(lessonId, options = {}) {
  const page = Math.max(Number(options.page || 1), 1);
  const limit = normalizePageLimit(options.limit || 20, 20);
  const offset = (page - 1) * limit;
  const [questions, total] = await Promise.all([
    getQuestionsByLesson(lessonId, { limit, offset }),
    countQuestionsByLesson(lessonId)
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

async function getQuestionById(id) {
  try {
    const rows = await db.query('SELECT * FROM QuestionBank WHERE id = ? LIMIT 1', [id]);
    return normalizeQuestion(rows[0]);
  } catch (error) {
    return normalizeQuestion(sampleData.questions.find((question) => Number(question.id) === Number(id)));
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
    const byId = new Map(sampleData.questions.map((question) => [Number(question.id), normalizeQuestion(question)]));
    return questionIds.map((id) => byId.get(Number(id))).filter(Boolean);
  }
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
    return rows[0] || null;
  } catch (error) {
    return (
      sampleData.misconceptions.find(
        (item) => Number(item.question_id) === Number(questionId) && item.distractor_key === selectedAnswer
      ) || null
    );
  }
}

async function listQuestions() {
  try {
    const rows = await db.query(
      `SELECT q.*, l.lesson_name, c.chapter_name, c.grade
       FROM QuestionBank q
       JOIN Lessons l ON l.id = q.lesson_id
       JOIN Chapters c ON c.id = l.chapter_id
       ORDER BY q.created_at DESC, q.id DESC`
    );
    return rows.map(normalizeQuestion);
  } catch (error) {
    return sampleData.questions.map((question) => {
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
          COUNT(DISTINCT lesson_id) AS lesson_count,
          SUM(CASE WHEN difficulty = 'EASY' THEN 1 ELSE 0 END) AS easy_count
       FROM QuestionBank`
    );
    const stats = rows[0] || {};
    return {
      questionCount: Number(stats.question_count || 0),
      lessonCount: Number(stats.lesson_count || 0),
      easyCount: Number(stats.easy_count || 0)
    };
  } catch (error) {
    const lessonIds = new Set(sampleData.questions.map((question) => Number(question.lesson_id)));
    return {
      questionCount: sampleData.questions.length,
      lessonCount: lessonIds.size,
      easyCount: sampleData.questions.filter((question) => question.difficulty === 'EASY').length
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
       ORDER BY q.created_at DESC, q.id DESC
       LIMIT ${safeLimit}`
    );
    return rows.map(normalizeQuestion);
  } catch (error) {
    return (await listQuestions()).slice(0, safeLimit);
  }
}

async function getQuestionCountsByLesson() {
  try {
    return await db.query(
      `SELECT lesson_id, COUNT(*) AS question_count
       FROM QuestionBank
       GROUP BY lesson_id`
    );
  } catch (error) {
    const counts = new Map();
    for (const question of sampleData.questions) {
      const lessonId = Number(question.lesson_id);
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
      await connection.execute(
        `UPDATE QuestionBank
         SET lesson_id = ?,
             question_type = ?,
             difficulty = ?,
             layout_template = ?,
             content = CAST(? AS JSON),
             choices = CAST(? AS JSON),
             correct_answer = ?,
             explanation = CAST(? AS JSON)
         WHERE id = ?`,
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
    const index = sampleData.questions.findIndex((question) => Number(question.id) === Number(id));
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
    await db.query('DELETE FROM QuestionBank WHERE id = ?', [id]);
    return true;
  } catch (error) {
    const index = sampleData.questions.findIndex((question) => Number(question.id) === Number(id));
    if (index === -1) return false;

    sampleData.questions.splice(index, 1);
    sampleData.misconceptions = sampleData.misconceptions.filter(
      (item) => Number(item.question_id) !== Number(id)
    );
    sampleData.studentLogs = sampleData.studentLogs.filter(
      (item) => Number(item.question_id) !== Number(id)
    );
    return true;
  }
}

async function getRandomQuestionsByGrade(grade, limit = 10) {
  const safeLimit = normalizeExamLimit(limit);

  try {
    const idRows = await db.query(
      `SELECT q.id
       FROM QuestionBank q
       JOIN Lessons l ON l.id = q.lesson_id
       JOIN Chapters c ON c.id = l.chapter_id
       WHERE c.grade = ?`,
      [grade]
    );
    const ids = sampleIds(idRows.map((row) => Number(row.id)).filter(Boolean), safeLimit);
    return getQuestionsByIds(ids);
  } catch (error) {
    const lessonById = new Map();
    sampleData.chapters
      .filter((chapter) => Number(chapter.grade) === Number(grade))
      .forEach((chapter) => {
        chapter.lessons.forEach((lesson) => {
          lessonById.set(Number(lesson.id), {
            lesson_name: lesson.lesson_name,
            grade: chapter.grade
          });
        });
      });

    return shuffle(
      sampleData.questions
        .filter((question) => lessonById.has(Number(question.lesson_id)))
        .map((question) => ({
          ...normalizeQuestion(question),
          ...lessonById.get(Number(question.lesson_id))
        }))
    ).slice(0, safeLimit);
  }
}

async function createQuestion(payload) {
  try {
    return await db.transaction(async (connection) => {
      const [result] = await connection.execute(
        `INSERT INTO QuestionBank
          (lesson_id, concept_id, question_type, difficulty, layout_template, content, choices, correct_answer, explanation)
         VALUES (?, NULL, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), ?, CAST(? AS JSON))`,
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

      return { ...payload, id: questionId };
    });
  } catch (error) {
    const question = {
      ...payload,
      id: Math.max(...sampleData.questions.map((item) => item.id), 1000) + 1
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

function normalizeExamLimit(value) {
  const allowedLimits = [10, 15, 20, 25, 30];
  const limit = Number(value);
  return allowedLimits.includes(limit) ? limit : 10;
}

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function sampleIds(ids, limit) {
  if (ids.length <= limit) return ids;
  const result = [];
  const used = new Set();
  while (result.length < limit && used.size < ids.length) {
    const index = Math.floor(Math.random() * ids.length);
    if (used.has(index)) continue;
    used.add(index);
    result.push(ids[index]);
  }
  return result;
}

function normalizePageLimit(value, fallback = 20, max = 100) {
  const limit = Number(value);
  if (!Number.isFinite(limit) || limit <= 0) return fallback;
  return Math.min(Math.max(Math.round(limit), 1), max);
}

async function deleteAllQuestionsAndActivity() {
  try {
    await db.transaction(async (connection) => {
      await connection.execute('DELETE FROM PracticeSessionChats');
      await connection.execute('DELETE FROM PracticeSessions');
      await connection.execute("DELETE FROM AIConversationLogs WHERE session_type = 'EXERCISE_HELP'");
      await connection.execute('DELETE FROM StudentLogs');
      await connection.execute('DELETE FROM CommonMisconceptions');
      await connection.execute('DELETE FROM QuestionBank');
    });
    await Promise.allSettled([
      db.query('ALTER TABLE PracticeSessionChats AUTO_INCREMENT = 1'),
      db.query('ALTER TABLE PracticeSessions AUTO_INCREMENT = 1'),
      db.query('ALTER TABLE StudentLogs AUTO_INCREMENT = 1'),
      db.query('ALTER TABLE CommonMisconceptions AUTO_INCREMENT = 1'),
      db.query('ALTER TABLE QuestionBank AUTO_INCREMENT = 1')
    ]);
    return true;
  } catch (error) {
    sampleData.practiceChats = [];
    sampleData.practiceSessions = [];
    sampleData.studentLogs = [];
    sampleData.misconceptions = [];
    sampleData.questions = [];
    return false;
  }
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
  getQuestionPageByLesson,
  countQuestionsByLesson,
  getRandomQuestionsByGrade,
  getQuestionById,
  getQuestionsByIds,
  getMisconception,
  listQuestions,
  getAdminStats,
  getRecentQuestions,
  getQuestionCountsByLesson,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  deleteAllQuestionsAndActivity,
  recordAnswer
};
