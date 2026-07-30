const db = require('../config/db');
const sampleData = require('../sample-data/sampleData');
const { parseJsonField } = require('../utils/json');
const SystemSetting = require('./SystemSetting');
const { fallbackOrThrow } = require('../utils/sampleDataFallback');

const DURATION_SECONDS_BY_QUESTION_COUNT = Object.freeze(
  Object.fromEntries(
    Object.entries(SystemSetting.PRACTICE_DURATION_DEFAULTS)
      .map(([count, minutes]) => [count, minutes * 60])
  )
);

function getSessionTiming(session, nowMs = Date.now()) {
  const timedMode = ['LESSON', 'CHAPTER', 'COMPREHENSIVE'].includes(
    String(session?.session_mode || '').toUpperCase()
  );
  const startedAtMs = session?.started_at instanceof Date
    ? session.started_at.getTime()
    : Date.parse(String(session?.started_at || ''));
  const storedDeadlineAtMs = session?.expires_at instanceof Date
    ? session.expires_at.getTime()
    : Date.parse(String(session?.expires_at || ''));
  const storedDurationSeconds = Number(session?.duration_seconds);
  const legacyDurationSeconds = DURATION_SECONDS_BY_QUESTION_COUNT[Number(session?.question_count)] || null;
  const durationSeconds = timedMode
    ? (
      (Number.isInteger(storedDurationSeconds) && storedDurationSeconds > 0
        ? storedDurationSeconds
        : null)
      || (
        Number.isFinite(storedDeadlineAtMs) && Number.isFinite(startedAtMs)
          ? Math.max(1, Math.round((storedDeadlineAtMs - startedAtMs) / 1000))
          : null
      )
      || legacyDurationSeconds
    )
    : null;
  const deadlineAtMs = Number.isFinite(storedDeadlineAtMs)
    ? storedDeadlineAtMs
    : Number.isFinite(startedAtMs) && durationSeconds
      ? startedAtMs + durationSeconds * 1000
      : Number.NaN;
  if (!durationSeconds || !Number.isFinite(deadlineAtMs)) {
    return {
      enabled: false,
      durationSeconds: null,
      deadlineAtMs: null,
      serverNowMs: Number(nowMs),
      remainingSeconds: null,
      isExpired: false
    };
  }

  const remainingSeconds = Math.max(0, Math.ceil((deadlineAtMs - Number(nowMs)) / 1000));
  return {
    enabled: true,
    durationSeconds,
    deadlineAtMs,
    serverNowMs: Number(nowMs),
    remainingSeconds,
    isExpired: deadlineAtMs <= Number(nowMs)
  };
}

function ensureFallbackStore() {
  sampleData.practiceSessions = sampleData.practiceSessions || [];
  sampleData.practiceChats = sampleData.practiceChats || [];
}

async function ensureSchema() {
  try {
    await db.query(
      `CREATE TABLE IF NOT EXISTS PracticeSessions (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        student_id INT NOT NULL,
        lesson_id INT NULL,
        chapter_id INT NULL,
        scope_semester TINYINT NULL,
        session_mode VARCHAR(20) NOT NULL,
        title VARCHAR(255) NOT NULL,
        question_ids JSON NOT NULL,
        question_count INT NOT NULL DEFAULT 0,
        duration_seconds INT NULL,
        current_index INT NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS',
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NULL,
        completed_at TIMESTAMP NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES Students(id) ON DELETE CASCADE,
        FOREIGN KEY (lesson_id) REFERENCES Lessons(id) ON DELETE SET NULL,
        FOREIGN KEY (chapter_id) REFERENCES Chapters(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    );
    await db.query(
      `CREATE TABLE IF NOT EXISTS PracticeSessionChats (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        practice_session_id BIGINT NOT NULL,
        question_id INT NULL,
        role VARCHAR(20) NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (practice_session_id) REFERENCES PracticeSessions(id) ON DELETE CASCADE,
        FOREIGN KEY (question_id) REFERENCES QuestionBank(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    );
    await addColumnIfMissing(
      'StudentLogs',
      'practice_session_id',
      'ALTER TABLE StudentLogs ADD COLUMN practice_session_id BIGINT NULL AFTER student_id'
    );
    await addColumnIfMissing(
      'PracticeSessions',
      'chapter_id',
      'ALTER TABLE PracticeSessions ADD COLUMN chapter_id INT NULL AFTER lesson_id'
    );
    await addColumnIfMissing(
      'PracticeSessions',
      'scope_semester',
      'ALTER TABLE PracticeSessions ADD COLUMN scope_semester TINYINT NULL AFTER chapter_id'
    );
    await addColumnIfMissing(
      'PracticeSessions',
      'duration_seconds',
      'ALTER TABLE PracticeSessions ADD COLUMN duration_seconds INT NULL AFTER question_count'
    );
    await addColumnIfMissing(
      'PracticeSessions',
      'expires_at',
      'ALTER TABLE PracticeSessions ADD COLUMN expires_at TIMESTAMP NULL AFTER started_at'
    );
    await addIndexIfMissing('StudentLogs', 'idx_logs_practice_session', 'CREATE INDEX idx_logs_practice_session ON StudentLogs(practice_session_id)');
    await addIndexIfMissing(
      'PracticeSessions',
      'idx_practice_sessions_expiry',
      'CREATE INDEX idx_practice_sessions_expiry ON PracticeSessions(student_id, status, expires_at)'
    );
  } catch (error) {
    fallbackOrThrow(error);
    ensureFallbackStore();
  }
}

async function addColumnIfMissing(tableName, columnName, alterSql) {
  const rows = await db.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  if (Number(rows[0]?.count || 0) === 0) {
    await db.query(alterSql);
  }
}

async function addIndexIfMissing(tableName, indexName, createSql) {
  const rows = await db.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [tableName, indexName]
  );
  if (Number(rows[0]?.count || 0) === 0) {
    await db.query(createSql);
  }
}

async function createSession({
  studentId,
  lessonId = null,
  chapterId = null,
  semester = null,
  mode,
  title,
  questionIds
}) {
  await ensureSchema();
  const ids = questionIds.map(Number).filter(Boolean);
  const timedMode = ['LESSON', 'CHAPTER', 'COMPREHENSIVE'].includes(String(mode || '').toUpperCase());
  const settings = timedMode ? await SystemSetting.getSettings() : null;
  const durationSeconds = timedMode
    ? SystemSetting.getPracticeDurationSeconds(ids.length, settings)
    : null;

  try {
    const result = await db.query(
      `INSERT INTO PracticeSessions
        (student_id, lesson_id, chapter_id, scope_semester, session_mode, title, question_ids,
         question_count, duration_seconds, expires_at, current_index, status)
       VALUES (?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?,
         CASE WHEN ? IS NULL THEN NULL ELSE DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? SECOND) END,
         0, 'IN_PROGRESS')`,
      [
        studentId,
        lessonId,
        chapterId,
        [1, 2].includes(Number(semester)) ? Number(semester) : null,
        mode,
        title,
        JSON.stringify(ids),
        ids.length,
        durationSeconds,
        durationSeconds,
        durationSeconds
      ]
    );
    return getSessionById(studentId, result.insertId);
  } catch (error) {
    fallbackOrThrow(error);
    ensureFallbackStore();
    const session = {
      id: Date.now(),
      student_id: studentId,
      lesson_id: lessonId,
      chapter_id: chapterId,
      scope_semester: [1, 2].includes(Number(semester)) ? Number(semester) : null,
      session_mode: mode,
      title,
      question_ids: ids,
      question_count: ids.length,
      duration_seconds: durationSeconds,
      current_index: 0,
      status: 'IN_PROGRESS',
      started_at: new Date(),
      expires_at: durationSeconds ? new Date(Date.now() + durationSeconds * 1000) : null,
      completed_at: null
    };
    sampleData.practiceSessions.push(session);
    return session;
  }
}

async function getActiveLessonSession(studentId, lessonId, mode = 'LESSON') {
  await ensureSchema();
  const sessionMode = ['REVIEW', 'LESSON'].includes(mode) ? mode : 'LESSON';
  try {
    const rows = await db.query(
      `SELECT *
       FROM PracticeSessions
       WHERE student_id = ? AND lesson_id = ? AND session_mode = ? AND status = 'IN_PROGRESS'
       ORDER BY started_at DESC
       LIMIT 1`,
      [studentId, lessonId, sessionMode]
    );
    return hydrateSessionFromLogs(normalizeSession(rows[0]));
  } catch (error) {
    fallbackOrThrow(error);
    ensureFallbackStore();
    return sampleData.practiceSessions
      .filter((session) =>
        Number(session.student_id) === Number(studentId)
        && Number(session.lesson_id) === Number(lessonId)
        && session.session_mode === sessionMode
        && session.status === 'IN_PROGRESS'
      )
      .at(-1) || null;
  }
}

async function getSessionById(studentId, sessionId) {
  await ensureSchema();
  try {
    const rows = await db.query(
      `SELECT *
       FROM PracticeSessions
       WHERE id = ? AND student_id = ?
       LIMIT 1`,
      [sessionId, studentId]
    );
    return hydrateSessionFromLogs(normalizeSession(rows[0]));
  } catch (error) {
    fallbackOrThrow(error);
    ensureFallbackStore();
    return sampleData.practiceSessions.find(
      (session) => Number(session.id) === Number(sessionId) && Number(session.student_id) === Number(studentId)
    ) || null;
  }
}

/**
 * Danh sách phiên của học sinh, mới nhất trước. options.status và
 * options.modes lọc ngay trong SQL: lọc sau khi cắt LIMIT thì phiên đang làm
 * dở nào cũ hơn N dòng gần nhất sẽ biến mất khỏi danh sách "Tiếp tục".
 */
async function listSessions(studentId, limit = 50, options = {}) {
  await ensureSchema();
  await completeExpiredSessions(studentId);
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const status = String(options.status || '').trim().toUpperCase();
  const modes = (Array.isArray(options.modes) ? options.modes : [])
    .map((mode) => String(mode || '').trim().toUpperCase())
    .filter(Boolean);
  const where = ['ps.student_id = ?'];
  const params = [studentId];
  if (status) {
    where.push('ps.status = ?');
    params.push(status);
  }
  if (modes.length > 0) {
    where.push(`ps.session_mode IN (${modes.map(() => '?').join(',')})`);
    params.push(...modes);
  }
  const matchesFilters = (session) =>
    (!status || session.status === status)
    && (modes.length === 0 || modes.includes(session.session_mode));
  try {
    const rows = await db.query(
      `SELECT ps.*
       FROM PracticeSessions ps
       WHERE ${where.join(' AND ')}
       ORDER BY ps.started_at DESC
       LIMIT ${safeLimit}`,
      params
    );

    if (rows.length === 0) return [];

    const sessionIds = rows.map((row) => Number(row.id)).filter(Boolean);
    const placeholders = sessionIds.map(() => '?').join(',');
    const [answerStats, chatStats] = await Promise.all([
      db.query(
        `SELECT
            practice_session_id,
            COUNT(*) AS answered_count,
            SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS correct_count
         FROM StudentLogs
         WHERE practice_session_id IN (${placeholders})
         GROUP BY practice_session_id`,
        sessionIds
      ),
      db.query(
        `SELECT practice_session_id, COUNT(*) AS chat_count
         FROM PracticeSessionChats
         WHERE role = 'student' AND practice_session_id IN (${placeholders})
         GROUP BY practice_session_id`,
        sessionIds
      )
    ]);

    const answerMap = new Map(answerStats.map((row) => [Number(row.practice_session_id), row]));
    const chatMap = new Map(chatStats.map((row) => [Number(row.practice_session_id), row]));
    const hydratedRows = rows.map((row) => {
      const answers = answerMap.get(Number(row.id)) || {};
      const chats = chatMap.get(Number(row.id)) || {};
      return {
        ...row,
        answered_count: Number(answers.answered_count || 0),
        correct_count: Number(answers.correct_count || 0),
        chat_count: Number(chats.chat_count || 0)
      };
    });

    return Promise.all(hydratedRows.map((row) => hydrateSessionFromLogs(normalizeSession(row))));
  } catch (error) {
    fallbackOrThrow(error);
    ensureFallbackStore();
    return sampleData.practiceSessions
      .filter((session) => Number(session.student_id) === Number(studentId) && matchesFilters(session))
      .slice(-safeLimit)
      .reverse()
      .map((session) => ({
        ...session,
        answered_count: sampleData.studentLogs.filter((log) => Number(log.practice_session_id) === Number(session.id)).length,
        correct_count: sampleData.studentLogs.filter((log) => Number(log.practice_session_id) === Number(session.id) && log.is_correct).length,
        chat_count: sampleData.practiceChats.filter((chat) => Number(chat.practice_session_id) === Number(session.id) && chat.role === 'student').length
      }));
  }
}

async function completeExpiredSessions(studentId) {
  await ensureSchema();
  try {
    await db.query(
      `UPDATE PracticeSessions
       SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP
       WHERE student_id = ?
         AND status = 'IN_PROGRESS'
         AND session_mode IN ('LESSON', 'CHAPTER', 'COMPREHENSIVE')
         AND (
           expires_at <= CURRENT_TIMESTAMP
           OR (
             expires_at IS NULL
             AND duration_seconds IS NOT NULL
             AND TIMESTAMPADD(SECOND, duration_seconds, started_at) <= CURRENT_TIMESTAMP
           )
           OR (
             expires_at IS NULL
             AND duration_seconds IS NULL
             AND (
               (question_count = 5 AND started_at <= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 10 MINUTE))
               OR (question_count = 15 AND started_at <= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 30 MINUTE))
               OR (question_count = 20 AND started_at <= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 60 MINUTE))
             )
           )
         )`,
      [studentId]
    );
  } catch (error) {
    fallbackOrThrow(error);
    ensureFallbackStore();
    const nowMs = Date.now();
    sampleData.practiceSessions
      .filter((session) =>
        Number(session.student_id) === Number(studentId)
        && session.status === 'IN_PROGRESS'
        && getSessionTiming(session, nowMs).isExpired
      )
      .forEach((session) => {
        session.status = 'COMPLETED';
        session.completed_at = new Date(nowMs);
      });
  }
}

async function listAnswers(sessionId) {
  await ensureSchema();
  try {
    return await db.query(
      `SELECT
          sl.*,
          q.correct_answer,
          q.content,
          q.choices,
          q.explanation
       FROM StudentLogs sl
       JOIN QuestionBank q ON q.id = sl.question_id
       WHERE sl.practice_session_id = ?
       ORDER BY sl.created_at, sl.id`,
      [sessionId]
    );
  } catch (error) {
    fallbackOrThrow(error);
    ensureFallbackStore();
    return sampleData.studentLogs.filter((log) => Number(log.practice_session_id) === Number(sessionId));
  }
}

async function listChats(sessionId) {
  await ensureSchema();
  try {
    return await db.query(
      `SELECT *
       FROM PracticeSessionChats
       WHERE practice_session_id = ?
       ORDER BY created_at, id`,
      [sessionId]
    );
  } catch (error) {
    fallbackOrThrow(error);
    ensureFallbackStore();
    return sampleData.practiceChats.filter((chat) => Number(chat.practice_session_id) === Number(sessionId));
  }
}

async function saveChat({ sessionId, questionId, role, message }) {
  if (!sessionId || !message) return null;
  await ensureSchema();

  try {
    const result = await db.query(
      `INSERT INTO PracticeSessionChats (practice_session_id, question_id, role, message)
       VALUES (?, ?, ?, ?)`,
      [sessionId, questionId || null, role, message]
    );
    return { id: result.insertId };
  } catch (error) {
    fallbackOrThrow(error);
    ensureFallbackStore();
    const chat = {
      id: sampleData.practiceChats.length + 1,
      practice_session_id: Number(sessionId),
      question_id: questionId || null,
      role,
      message,
      created_at: new Date()
    };
    sampleData.practiceChats.push(chat);
    return chat;
  }
}

// current_index mang nghĩa "số câu học sinh đã làm trong phiên", dùng để hiển
// thị tiến trình. Đếm trực tiếp từ StudentLogs thay vì tin vào chỉ số câu do
// client gửi lên, nhờ đó con số vẫn đúng khi học sinh làm bài không theo thứ tự
// (bấm chấm tiến trình nhảy tới câu bất kỳ).
async function syncSessionProgress(sessionId) {
  await ensureSchema();
  try {
    await db.query(
      `UPDATE PracticeSessions ps
       SET ps.current_index = (
         SELECT COUNT(DISTINCT sl.question_id)
         FROM StudentLogs sl
         WHERE sl.practice_session_id = ps.id
       )
       WHERE ps.id = ? AND ps.status = 'IN_PROGRESS'`,
      [sessionId]
    );
  } catch (error) {
    fallbackOrThrow(error);
    ensureFallbackStore();
    const session = sampleData.practiceSessions.find((item) => Number(item.id) === Number(sessionId));
    if (!session) return;
    const answered = new Set(
      sampleData.studentLogs
        .filter((log) => Number(log.practice_session_id) === Number(sessionId))
        .map((log) => Number(log.question_id))
    );
    session.current_index = answered.size;
  }
}

async function completeSession(studentId, sessionId) {
  await ensureSchema();
  try {
    await db.query(
      `UPDATE PracticeSessions
       SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP
       WHERE id = ? AND student_id = ?`,
      [sessionId, studentId]
    );
    return getSessionById(studentId, sessionId);
  } catch (error) {
    fallbackOrThrow(error);
    ensureFallbackStore();
    const session = sampleData.practiceSessions.find(
      (item) => Number(item.id) === Number(sessionId) && Number(item.student_id) === Number(studentId)
    );
    if (session) {
      session.status = 'COMPLETED';
      session.completed_at = new Date();
    }
    return session || null;
  }
}

function normalizeSession(row) {
  if (!row) return null;
  const questionIds = parseJsonField(row.question_ids, []);
  const answeredCount = Number(row.answered_count || 0);
  return {
    ...row,
    question_ids: questionIds,
    answered_count: answeredCount,
    correct_count: Number(row.correct_count || 0),
    chat_count: Number(row.chat_count || 0),
    duration_seconds: Number(row.duration_seconds) > 0 ? Number(row.duration_seconds) : null,
    question_count: Math.max(Number(row.question_count || 0), questionIds.length, answeredCount)
  };
}

async function hydrateSessionFromLogs(session) {
  if (!session || session.question_ids.length > 0) return session;

  try {
    const rows = await db.query(
      `SELECT question_id
       FROM StudentLogs
       WHERE practice_session_id = ?
       GROUP BY question_id
       ORDER BY MIN(created_at), MIN(id)`,
      [session.id]
    );
    const questionIds = rows.map((row) => Number(row.question_id)).filter(Boolean);
    if (questionIds.length > 0) {
      session.question_ids = questionIds;
      session.question_count = Math.max(Number(session.question_count || 0), questionIds.length);
    }
  } catch (error) {
    fallbackOrThrow(error);
    ensureFallbackStore();
    const questionIds = sampleData.studentLogs
      .filter((log) => Number(log.practice_session_id) === Number(session.id))
      .map((log) => Number(log.question_id))
      .filter(Boolean);
    if (questionIds.length > 0) {
      session.question_ids = [...new Set(questionIds)];
      session.question_count = Math.max(Number(session.question_count || 0), session.question_ids.length);
    }
  }

  return session;
}

module.exports = {
  DURATION_SECONDS_BY_QUESTION_COUNT,
  ensureSchema,
  createSession,
  getActiveLessonSession,
  getSessionById,
  listSessions,
  listAnswers,
  listChats,
  saveChat,
  syncSessionProgress,
  completeSession,
  completeExpiredSessions,
  getSessionTiming
};
