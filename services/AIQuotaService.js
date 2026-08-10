// D?ch v? aiquota service ??ng g?i nghi?p v? ch?nh v? ph?i h?p c?c l?p d? li?u ho?c t?ch h?p b?n ngo?i.
const db = require('../config/db');
const { parseJsonField } = require('../utils/json');
const {
  createQuestionSnapshot,
  getSessionTiming
} = require('../models/PracticeSession');

// H?m reserveExerciseHelp d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function reserveExerciseHelp({
  studentId,
  sessionId,
  questionId,
  dailyLimit,
  maxPerQuestion,
  maxPerSession
}) {
  const safeDailyLimit = normalizeLimit(dailyLimit, 30, 500);
  const safeQuestionLimit = normalizeLimit(maxPerQuestion, 2, 20);
  const safeSessionLimit = normalizeLimit(maxPerSession, 8, 100);
  return db.transaction(async (connection) => {
    const usage = await lockDailyUsage(connection, studentId);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (limitReached(usage.request_count, safeDailyLimit)) {
      return { outcome: 'DAILY_QUOTA_EXCEEDED' };
    }

    const [sessionRows] = await connection.execute(
      `SELECT ps.*, ROUND(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000) AS server_now_ms
       FROM PracticeSessions ps
       WHERE ps.id = ? AND ps.student_id = ?
       LIMIT 1
       FOR UPDATE`,
      [sessionId, studentId]
    );
    const session = normalizeSession(sessionRows[0]);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!session) return { outcome: 'SESSION_NOT_FOUND' };
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (getSessionTiming(session, session.server_now_ms).isExpired) {
      await completeExpiredSession(connection, session.id);
      return { outcome: 'SESSION_EXPIRED', session };
    }
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (session.status !== 'IN_PROGRESS') {
      return { outcome: 'SESSION_COMPLETED', session };
    }

    const [questionRows] = await connection.execute(
      `SELECT snapshot, ai_hint_count
       FROM PracticeSessionQuestions
       WHERE practice_session_id = ? AND question_id = ?
       LIMIT 1
       FOR UPDATE`,
      [sessionId, questionId]
    );
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!questionRows[0]) {
      return { outcome: 'QUESTION_NOT_IN_SESSION', session };
    }

    const [answerRows] = await connection.execute(
      `SELECT *
       FROM StudentLogs
       WHERE practice_session_id = ? AND question_id = ?
       ORDER BY id
       LIMIT 1`,
      [sessionId, questionId]
    );
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!answerRows[0]) {
      return { outcome: 'ANSWER_REQUIRED', session };
    }

    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (limitReached(questionRows[0].ai_hint_count, safeQuestionLimit)) {
      return { outcome: 'QUESTION_QUOTA_EXCEEDED', session };
    }
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (limitReached(session.ai_hint_count, safeSessionLimit)) {
      return { outcome: 'SESSION_QUOTA_EXCEEDED', session };
    }

    await incrementDailyUsage(connection, studentId);
    await connection.execute(
      'UPDATE PracticeSessions SET ai_hint_count = ai_hint_count + 1 WHERE id = ?',
      [sessionId]
    );
    await connection.execute(
      `UPDATE PracticeSessionQuestions
       SET ai_hint_count = ai_hint_count + 1
       WHERE practice_session_id = ? AND question_id = ?`,
      [sessionId, questionId]
    );

    return {
      outcome: 'RESERVED',
      session,
      question: createQuestionSnapshot(parseJsonField(questionRows[0].snapshot, {})),
      answer: answerRows[0]
    };
  });
}

// H?m reserveTheoryHelp d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function reserveTheoryHelp({ studentId, dailyLimit }) {
  const safeDailyLimit = normalizeLimit(dailyLimit, 30, 500);
  return db.transaction(async (connection) => {
    const usage = await lockDailyUsage(connection, studentId);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (limitReached(usage.request_count, safeDailyLimit)) {
      return { outcome: 'DAILY_QUOTA_EXCEEDED' };
    }
    await incrementDailyUsage(connection, studentId);
    return { outcome: 'RESERVED' };
  });
}

// H?m lockDailyUsage d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function lockDailyUsage(connection, studentId) {
  const [studentRows] = await connection.execute(
    'SELECT id FROM Students WHERE id = ? LIMIT 1 FOR UPDATE',
    [studentId]
  );
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!studentRows[0]) {
    const error = new Error('Không tìm thấy tài khoản học sinh để cấp quota AI.');
    error.code = 'STUDENT_NOT_FOUND';
    error.status = 404;
    throw error;
  }
  await connection.execute(
    `INSERT IGNORE INTO AIUsageDaily (student_id, usage_date, request_count)
     VALUES (?, CURRENT_DATE, 0)`,
    [studentId]
  );
  const [rows] = await connection.execute(
    `SELECT request_count
     FROM AIUsageDaily
     WHERE student_id = ? AND usage_date = CURRENT_DATE
     LIMIT 1
     FOR UPDATE`,
    [studentId]
  );
  return { request_count: Number(rows[0]?.request_count || 0) };
}

// H?m incrementDailyUsage d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function incrementDailyUsage(connection, studentId) {
  await connection.execute(
    `UPDATE AIUsageDaily
     SET request_count = request_count + 1, updated_at = CURRENT_TIMESTAMP
     WHERE student_id = ? AND usage_date = CURRENT_DATE`,
    [studentId]
  );
}

// H?m normalizeSession d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function normalizeSession(row) {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!row) return null;
  return {
    ...row,
    question_ids: parseJsonField(row.question_ids, []).map(Number).filter(Boolean),
    ai_hint_count: Number(row.ai_hint_count || 0),
    server_now_ms: Number(row.server_now_ms || Date.now())
  };
}

// H?m limitReached d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function limitReached(current, configuredLimit) {
  const limit = Number(configuredLimit);
  return Number.isInteger(limit) && limit > 0 && Number(current || 0) >= limit;
}

// H?m normalizeLimit d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function normalizeLimit(value, fallback, maximum) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= maximum
    ? number
    : fallback;
}

// H?m completeExpiredSession d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function completeExpiredSession(connection, sessionId) {
  await connection.execute(
    `UPDATE PracticeSessions
     SET status = 'COMPLETED',
         completion_reason = COALESCE(completion_reason, 'EXPIRED'),
         active_key = NULL,
         completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP)
     WHERE id = ?`,
    [sessionId]
  );
}

module.exports = {
  limitReached,
  normalizeLimit,
  reserveExerciseHelp,
  reserveTheoryHelp
};
