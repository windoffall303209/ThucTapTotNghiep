// M? h?nh practice session ??nh ngh?a truy c?p, ki?m tra v? bi?n ??i d? li?u c?a m?t th?c th? trong h? th?ng.
const db = require('../config/db');
const sampleData = require('../sample-data/sampleData');
const { parseJsonField } = require('../utils/json');
const SystemSetting = require('./SystemSetting');
const Question = require('./Question');
const { fallbackOrThrow } = require('../utils/sampleDataFallback');

const DURATION_SECONDS_BY_QUESTION_COUNT = Object.freeze(
  Object.fromEntries(
    Object.entries(SystemSetting.PRACTICE_DURATION_DEFAULTS)
      .map(([count, minutes]) => [count, minutes * 60])
  )
);

// H?m getSessionTiming d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
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
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
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

// H?m ensureFallbackStore d?ng ?? ki?m tra t?nh h?p l? v? c?c ?i?u ki?n an to?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function ensureFallbackStore() {
  sampleData.practiceSessions = sampleData.practiceSessions || [];
  sampleData.practiceChats = sampleData.practiceChats || [];
}

let schemaCheckPromise = null;

// H?m ensureSchema d?ng ?? ki?m tra t?nh h?p l? v? c?c ?i?u ki?n an to?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function ensureSchema() {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!schemaCheckPromise) {
    schemaCheckPromise = verifySchemaReady();
  }
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    await schemaCheckPromise;
  } catch (error) {
    schemaCheckPromise = null;
    fallbackOrThrow(error);
    ensureFallbackStore();
  }
}

// H?m verifySchemaReady d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function verifySchemaReady() {
  const requiredColumns = new Map([
    ['PracticeSessions', [
      'id',
      'chapter_id',
      'scope_semester',
      'duration_seconds',
      'expires_at',
      'completion_reason',
      'active_key',
      'ai_hint_count',
      'selection_version',
      'selection_seed',
      'selection_metadata'
    ]],
    ['PracticeSessionQuestions', [
      'practice_session_id',
      'question_id',
      'position',
      'snapshot',
      'ai_hint_count'
    ]],
    ['PracticeSessionChats', ['practice_session_id', 'question_id', 'role', 'message']],
    ['StudentLogs', ['practice_session_id', 'question_id']]
  ]);
  const rows = await db.query(
    `SELECT TABLE_NAME, COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME IN ('PracticeSessions', 'PracticeSessionQuestions',
                          'PracticeSessionChats', 'StudentLogs')`
  );
  const available = new Set(
    rows.map((row) => `${String(row.TABLE_NAME).toLowerCase()}.${String(row.COLUMN_NAME).toLowerCase()}`)
  );
  const missing = [];
  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const [tableName, columns] of requiredColumns) {
    // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
    for (const columnName of columns) {
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (!available.has(`${tableName.toLowerCase()}.${columnName.toLowerCase()}`)) {
        missing.push(`${tableName}.${columnName}`);
      }
    }
  }
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (missing.length > 0) {
    const error = new Error(
      `Database chưa được nâng cấp phiên luyện tập (${missing.join(', ')}). `
      + 'Chạy npm run db:session-integrity -- --apply trước khi khởi động ứng dụng.'
    );
    error.code = 'SCHEMA_MIGRATION_REQUIRED';
    error.status = 503;
    throw error;
  }
}

// H?m createSession d?ng ?? t?o b?n ghi ho?c t?i nguy?n m?i sau khi ki?m tra ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function createSession({
  studentId,
  lessonId = null,
  chapterId = null,
  semester = null,
  mode,
  title,
  questionIds,
  replaceActive = false,
  selection = null
}) {
  await ensureSchema();
  const ids = questionIds.map(Number).filter(Boolean);
  const questions = await Question.getQuestionsByIds(ids);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (
    questions.length !== ids.length
    || questions.some((question) => Number(question.is_active ?? 1) !== 1)
  ) {
    const error = new Error('Không thể tạo phiên vì một hoặc nhiều câu hỏi không còn khả dụng.');
    error.code = 'SESSION_QUESTIONS_UNAVAILABLE';
    error.status = 409;
    throw error;
  }
  const misconceptionsByQuestionId = await Question.getMisconceptionsByQuestionIds(ids);
  const questionSnapshots = questions.map((question) => createQuestionSnapshot({
    ...question,
    misconceptions: misconceptionsByQuestionId.get(Number(question.id)) || []
  }));
  const timedMode = ['LESSON', 'CHAPTER', 'COMPREHENSIVE'].includes(String(mode || '').toUpperCase());
  const settings = timedMode ? await SystemSetting.getSettings() : null;
  const durationSeconds = timedMode
    ? SystemSetting.getPracticeDurationSeconds(ids.length, settings)
    : null;
  const normalizedSemester = [1, 2].includes(Number(semester)) ? Number(semester) : null;
  const activeKey = buildActiveSessionKey({
    studentId,
    lessonId,
    chapterId,
    semester: normalizedSemester,
    mode
  });
  const selectionAudit = normalizeSelectionAudit(selection);

  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    const sessionId = await db.transaction(async (connection) => {
      const [activeRows] = await connection.execute(
        `SELECT id
         FROM PracticeSessions
         WHERE active_key = ? AND status = 'IN_PROGRESS'
         LIMIT 1
         FOR UPDATE`,
        [activeKey]
      );
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (activeRows[0] && !replaceActive) return Number(activeRows[0].id);
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (activeRows[0]) {
        await connection.execute(
          `UPDATE PracticeSessions
           SET status = 'COMPLETED',
               completion_reason = 'REPLACED',
               active_key = NULL,
               completed_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [activeRows[0].id]
        );
      }

      const [result] = await connection.execute(
        `INSERT INTO PracticeSessions
          (student_id, lesson_id, chapter_id, scope_semester, session_mode, title,
           question_ids, question_count, duration_seconds, expires_at,
           current_index, status, completion_reason, active_key, ai_hint_count,
           selection_version, selection_seed, selection_metadata)
         VALUES (?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?,
           CASE WHEN ? IS NULL THEN NULL ELSE DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? SECOND) END,
           0, 'IN_PROGRESS', NULL, ?, 0, ?, ?, CAST(? AS JSON))`,
        [
          studentId,
          lessonId,
          chapterId,
          normalizedSemester,
          mode,
          title,
          JSON.stringify(ids),
          ids.length,
          durationSeconds,
          durationSeconds,
          durationSeconds,
          activeKey,
          selectionAudit.version,
          selectionAudit.seed,
          JSON.stringify(selectionAudit.metadata)
        ]
      );
      // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
      for (const [position, question] of questionSnapshots.entries()) {
        await connection.execute(
          `INSERT INTO PracticeSessionQuestions
            (practice_session_id, question_id, position, snapshot, ai_hint_count)
           VALUES (?, ?, ?, CAST(? AS JSON), 0)`,
          [result.insertId, question.id, position, JSON.stringify(question)]
        );
      }
      return Number(result.insertId);
    });
    return getSessionById(studentId, sessionId);
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
      question_snapshots: questionSnapshots,
      question_count: ids.length,
      duration_seconds: durationSeconds,
      current_index: 0,
      status: 'IN_PROGRESS',
      completion_reason: null,
      active_key: activeKey,
      selection_version: selectionAudit.version,
      selection_seed: selectionAudit.seed,
      selection_metadata: selectionAudit.metadata,
      started_at: new Date(),
      expires_at: durationSeconds ? new Date(Date.now() + durationSeconds * 1000) : null,
      completed_at: null
    };
    sampleData.practiceSessions.push(session);
    return session;
  }
}

// H?m getActiveLessonSession d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function getActiveLessonSession(studentId, lessonId, mode = 'LESSON') {
  await ensureSchema();
  await completeExpiredSessions(studentId);
  const sessionMode = ['REVIEW', 'LESSON'].includes(mode) ? mode : 'LESSON';
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
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

// H?m getSessionById d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function getSessionById(studentId, sessionId) {
  await ensureSchema();
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
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
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (status) {
    where.push('ps.status = ?');
    params.push(status);
  }
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (modes.length > 0) {
    where.push(`ps.session_mode IN (${modes.map(() => '?').join(',')})`);
    params.push(...modes);
  }
  // H?m matchesFilters d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  const matchesFilters = (session) =>
    (!status || session.status === status)
    && (modes.length === 0 || modes.includes(session.session_mode));
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    const rows = await db.query(
      `SELECT ps.*
       FROM PracticeSessions ps
       WHERE ${where.join(' AND ')}
       ORDER BY ps.started_at DESC
       LIMIT ${safeLimit}`,
      params
    );

    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
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

// H?m completeExpiredSessions d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function completeExpiredSessions(studentId) {
  await ensureSchema();
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    await db.query(
      `UPDATE PracticeSessions
       SET status = 'COMPLETED',
           completion_reason = COALESCE(completion_reason, 'EXPIRED'),
           active_key = NULL,
           completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP)
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
        session.completion_reason = session.completion_reason || 'EXPIRED';
        session.active_key = null;
        session.completed_at = new Date(nowMs);
      });
  }
}

// H?m listAnswers d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function listAnswers(sessionId) {
  await ensureSchema();
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    return await db.query(
      `SELECT sl.*
       FROM StudentLogs sl
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

// H?m listChats d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function listChats(sessionId) {
  await ensureSchema();
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
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

// H?m saveChat d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function saveChat({ sessionId, questionId, role, message }) {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!sessionId || !message) return null;
  await ensureSchema();

  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
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
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
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
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!session) return;
    const answered = new Set(
      sampleData.studentLogs
        .filter((log) => Number(log.practice_session_id) === Number(sessionId))
        .map((log) => Number(log.question_id))
    );
    session.current_index = answered.size;
  }
}

// H?m completeSession d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function completeSession(studentId, sessionId, reason = 'USER_FINISHED') {
  await ensureSchema();
  const completionReason = normalizeCompletionReason(reason);
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    await db.query(
      `UPDATE PracticeSessions
       SET status = 'COMPLETED',
           completion_reason = COALESCE(completion_reason, ?),
           active_key = NULL,
           completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP)
       WHERE id = ? AND student_id = ?`,
      [completionReason, sessionId, studentId]
    );
    return getSessionById(studentId, sessionId);
  } catch (error) {
    fallbackOrThrow(error);
    ensureFallbackStore();
    const session = sampleData.practiceSessions.find(
      (item) => Number(item.id) === Number(sessionId) && Number(item.student_id) === Number(studentId)
    );
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (session) {
      session.status = 'COMPLETED';
      session.completion_reason = session.completion_reason || completionReason;
      session.active_key = null;
      session.completed_at = new Date();
    }
    return session || null;
  }
}

// H?m normalizeSession d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function normalizeSession(row) {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!row) return null;
  const questionIds = parseJsonField(row.question_ids, []);
  const answeredCount = Number(row.answered_count || 0);
  return {
    ...row,
    question_ids: questionIds,
    answered_count: answeredCount,
    correct_count: Number(row.correct_count || 0),
    chat_count: Number(row.chat_count || 0),
    selection_metadata: parseJsonField(row.selection_metadata, {}),
    duration_seconds: Number(row.duration_seconds) > 0 ? Number(row.duration_seconds) : null,
    question_count: Math.max(Number(row.question_count || 0), questionIds.length, answeredCount)
  };
}

// H?m normalizeSelectionAudit d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function normalizeSelectionAudit(selection) {
  const source = selection && typeof selection === 'object' ? selection : {};
  const version = String(source.version || '').trim().slice(0, 32) || null;
  const seedValue = String(source.seed || '').trim();
  const seed = /^[a-f0-9]{16}$/i.test(seedValue) ? seedValue.toLowerCase() : null;
  const metadata = source.metadata && typeof source.metadata === 'object' && !Array.isArray(source.metadata)
    ? source.metadata
    : {};
  return { version, seed, metadata };
}

// H?m getSessionQuestions d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function getSessionQuestions(session) {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!session) return [];
  await ensureSchema();
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    const rows = await db.query(
      `SELECT snapshot
       FROM PracticeSessionQuestions
       WHERE practice_session_id = ?
       ORDER BY position`,
      [session.id]
    );
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (rows.length > 0) {
      return rows.map((row) => createQuestionSnapshot(parseJsonField(row.snapshot, {})));
    }
  } catch (error) {
    fallbackOrThrow(error);
    const snapshots = Array.isArray(session.question_snapshots)
      ? session.question_snapshots.map(createQuestionSnapshot)
      : [];
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (snapshots.length > 0) return snapshots;
  }
  return Question.getQuestionsByIds(session.question_ids);
}

// H?m getSessionQuestion d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function getSessionQuestion(studentId, sessionId, questionId) {
  const session = await getSessionById(studentId, sessionId);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!session || !session.question_ids.map(Number).includes(Number(questionId))) {
    return { session, question: null };
  }
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    const rows = await db.query(
      `SELECT snapshot
       FROM PracticeSessionQuestions
       WHERE practice_session_id = ? AND question_id = ?
       LIMIT 1`,
      [sessionId, questionId]
    );
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (rows[0]) {
      return {
        session,
        question: createQuestionSnapshot(parseJsonField(rows[0].snapshot, {}))
      };
    }
  } catch (error) {
    fallbackOrThrow(error);
  }
  const questions = await getSessionQuestions(session);
  return {
    session,
    question: questions.find((item) => Number(item.id) === Number(questionId)) || null
  };
}

// H?m createQuestionSnapshot d?ng ?? t?o b?n ghi ho?c t?i nguy?n m?i sau khi ki?m tra ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function createQuestionSnapshot(question) {
  return {
    snapshot_version: 1,
    id: Number(question?.id),
    lesson_id: Number(question?.lesson_id) || null,
    lesson_name: question?.lesson_name || null,
    grade: Number(question?.grade) || null,
    question_type: question?.question_type || 'MULTIPLE_CHOICE',
    difficulty: question?.difficulty || 'EASY',
    layout_template: question?.layout_template || 'STACK_VERTICAL',
    content: parseJsonField(question?.content, {}),
    choices: parseJsonField(question?.choices, []),
    correct_answer: String(question?.correct_answer || ''),
    explanation: parseJsonField(question?.explanation, { text: '', images: [] }),
    misconceptions: parseJsonField(question?.misconceptions, [])
      .filter((item) => item && String(item.distractor_key || '').trim())
      .map((item) => ({
        id: Number(item.id) || null,
        distractor_key: String(item.distractor_key || '').trim(),
        misconception_type: String(item.misconception_type || 'OTHER').trim(),
        explanation: String(item.explanation || '').trim(),
        corrective_instruction: String(item.corrective_instruction || '').trim()
      }))
  };
}

// H?m buildActiveSessionKey d?ng ?? x?y d?ng k?t qu? t? c?c ngu?n d? li?u v? quy t?c li?n quan; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function buildActiveSessionKey({ studentId, lessonId, chapterId, semester, mode }) {
  return [
    Number(studentId),
    String(mode || '').trim().toUpperCase(),
    Number(lessonId || 0),
    Number(chapterId || 0),
    [1, 2].includes(Number(semester)) ? Number(semester) : 0
  ].join(':');
}

// H?m normalizeCompletionReason d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function normalizeCompletionReason(value) {
  const reason = String(value || '').trim().toUpperCase();
  return [
    'USER_FINISHED',
    'EXPIRED',
    'REPLACED',
    'CONTENT_CHANGED',
    'CONTENT_UNAVAILABLE',
    'ACCOUNT_GRADE_CHANGED'
  ].includes(reason) ? reason : 'USER_FINISHED';
}

// H?m hydrateSessionFromLogs d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function hydrateSessionFromLogs(session) {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!session || session.question_ids.length > 0) return session;

  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
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
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
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
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (questionIds.length > 0) {
      session.question_ids = [...new Set(questionIds)];
      session.question_count = Math.max(Number(session.question_count || 0), session.question_ids.length);
    }
  }

  return session;
}

module.exports = {
  DURATION_SECONDS_BY_QUESTION_COUNT,
  buildActiveSessionKey,
  createQuestionSnapshot,
  normalizeSelectionAudit,
  ensureSchema,
  createSession,
  getActiveLessonSession,
  getSessionById,
  listSessions,
  listAnswers,
  listChats,
  getSessionQuestion,
  getSessionQuestions,
  saveChat,
  syncSessionProgress,
  completeSession,
  completeExpiredSessions,
  getSessionTiming
};
