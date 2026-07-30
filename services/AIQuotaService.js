const db = require('../config/db');
const { parseJsonField } = require('../utils/json');
const {
  createQuestionSnapshot,
  getSessionTiming
} = require('../models/PracticeSession');

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
    if (!session) return { outcome: 'SESSION_NOT_FOUND' };
    if (getSessionTiming(session, session.server_now_ms).isExpired) {
      await completeExpiredSession(connection, session.id);
      return { outcome: 'SESSION_EXPIRED', session };
    }
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
    if (!answerRows[0]) {
      return { outcome: 'ANSWER_REQUIRED', session };
    }

    if (limitReached(questionRows[0].ai_hint_count, safeQuestionLimit)) {
      return { outcome: 'QUESTION_QUOTA_EXCEEDED', session };
    }
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

async function reserveTheoryHelp({ studentId, dailyLimit }) {
  const safeDailyLimit = normalizeLimit(dailyLimit, 30, 500);
  return db.transaction(async (connection) => {
    const usage = await lockDailyUsage(connection, studentId);
    if (limitReached(usage.request_count, safeDailyLimit)) {
      return { outcome: 'DAILY_QUOTA_EXCEEDED' };
    }
    await incrementDailyUsage(connection, studentId);
    return { outcome: 'RESERVED' };
  });
}

async function lockDailyUsage(connection, studentId) {
  const [studentRows] = await connection.execute(
    'SELECT id FROM Students WHERE id = ? LIMIT 1 FOR UPDATE',
    [studentId]
  );
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

async function incrementDailyUsage(connection, studentId) {
  await connection.execute(
    `UPDATE AIUsageDaily
     SET request_count = request_count + 1, updated_at = CURRENT_TIMESTAMP
     WHERE student_id = ? AND usage_date = CURRENT_DATE`,
    [studentId]
  );
}

function normalizeSession(row) {
  if (!row) return null;
  return {
    ...row,
    question_ids: parseJsonField(row.question_ids, []).map(Number).filter(Boolean),
    ai_hint_count: Number(row.ai_hint_count || 0),
    server_now_ms: Number(row.server_now_ms || Date.now())
  };
}

function limitReached(current, configuredLimit) {
  const limit = Number(configuredLimit);
  return Number.isInteger(limit) && limit > 0 && Number(current || 0) >= limit;
}

function normalizeLimit(value, fallback, maximum) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= maximum
    ? number
    : fallback;
}

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
