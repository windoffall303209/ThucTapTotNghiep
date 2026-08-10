// D?ch v? practice submission service ??ng g?i nghi?p v? ch?nh v? ph?i h?p c?c l?p d? li?u ho?c t?ch h?p b?n ngo?i.
const db = require('../config/db');
const { parseJsonField } = require('../utils/json');
const { answersMatch } = require('../utils/answerValidation');
const {
  createQuestionSnapshot,
  getSessionTiming
} = require('../models/PracticeSession');

// H?m submitAnswer d?ng ?? x? l? y?u c?u, ?i?u ph?i c?c b??c nghi?p v? v? ph?n h?i l?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function submitAnswer({
  studentId,
  sessionId,
  questionId,
  selectedAnswer,
  timeSpentSeconds
}) {
  return db.transaction(async (connection) => {
    const [sessionRows] = await connection.execute(
      `SELECT ps.*, ROUND(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000) AS server_now_ms
       FROM PracticeSessions ps
       WHERE ps.id = ? AND ps.student_id = ?
       LIMIT 1
       FOR UPDATE`,
      [sessionId, studentId]
    );
    const session = normalizeLockedSession(sessionRows[0]);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!session) return { outcome: 'SESSION_NOT_FOUND' };

    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (getSessionTiming(session, session.server_now_ms).isExpired) {
      await finishLockedSession(connection, session.id, 'EXPIRED');
      return { outcome: 'SESSION_EXPIRED', session };
    }
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (session.status !== 'IN_PROGRESS') {
      return { outcome: 'SESSION_COMPLETED', session };
    }
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!session.question_ids.includes(Number(questionId))) {
      return { outcome: 'QUESTION_NOT_IN_SESSION', session };
    }

    const question = await loadSessionQuestion(connection, session, questionId);
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!question) {
      await finishLockedSession(connection, session.id, 'CONTENT_UNAVAILABLE');
      return { outcome: 'QUESTION_UNAVAILABLE', session };
    }

    const [existingRows] = await connection.execute(
      `SELECT *
       FROM StudentLogs
       WHERE practice_session_id = ? AND question_id = ?
       ORDER BY id
       LIMIT 1`,
      [session.id, questionId]
    );
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (existingRows[0]) {
      const existingMisconception = Number(existingRows[0].is_correct) === 1
        ? null
        : findSnapshotMisconception(question, existingRows[0].selected_answer);
      return {
        outcome: 'ALREADY_RECORDED',
        session,
        question,
        answer: existingRows[0],
        misconception: existingMisconception
      };
    }

    const isCorrect = answersMatch(question, selectedAnswer);
    const misconception = isCorrect || question.question_type === 'FILL_IN_THE_BLANK'
      ? null
      : findSnapshotMisconception(question, selectedAnswer);

    const [insertResult] = await connection.execute(
      `INSERT INTO StudentLogs
        (student_id, practice_session_id, question_id, selected_answer, is_correct,
         detected_misconception_id, time_spent_seconds)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        studentId,
        session.id,
        questionId,
        selectedAnswer,
        isCorrect ? 1 : 0,
        misconception?.id || null,
        timeSpentSeconds
      ]
    );
    await connection.execute(
      `UPDATE PracticeSessions ps
       SET ps.current_index = (
         SELECT COUNT(DISTINCT sl.question_id)
         FROM StudentLogs sl
         WHERE sl.practice_session_id = ps.id
       )
       WHERE ps.id = ? AND ps.status = 'IN_PROGRESS'`,
      [session.id]
    );

    return {
      outcome: 'RECORDED',
      session,
      question,
      answer: {
        id: insertResult.insertId,
        student_id: studentId,
        practice_session_id: session.id,
        question_id: Number(questionId),
        selected_answer: selectedAnswer,
        is_correct: isCorrect ? 1 : 0,
        detected_misconception_id: misconception?.id || null,
        time_spent_seconds: timeSpentSeconds
      },
      misconception
    };
  });
}

// H?m normalizeLockedSession d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function normalizeLockedSession(row) {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!row) return null;
  return {
    ...row,
    question_ids: parseJsonField(row.question_ids, []).map(Number).filter(Boolean),
    server_now_ms: Number(row.server_now_ms || Date.now())
  };
}

// H?m loadSessionQuestion d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function loadSessionQuestion(connection, session, questionId) {
  const [snapshotRows] = await connection.execute(
    `SELECT snapshot
     FROM PracticeSessionQuestions
     WHERE practice_session_id = ? AND question_id = ?
     LIMIT 1`,
    [session.id, questionId]
  );
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (snapshotRows[0]) {
    return createQuestionSnapshot(parseJsonField(snapshotRows[0].snapshot, {}));
  }
  return null;
}

// H?m findSnapshotMisconception d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function findSnapshotMisconception(question, selectedAnswer) {
  return (question?.misconceptions || []).find(
    (item) => String(item.distractor_key) === String(selectedAnswer)
      && String(item.explanation || '').trim()
  ) || null;
}

// H?m finishLockedSession d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function finishLockedSession(connection, sessionId, reason) {
  await connection.execute(
    `UPDATE PracticeSessions
     SET status = 'COMPLETED',
         completion_reason = ?,
         active_key = NULL,
         completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP)
     WHERE id = ?`,
    [reason, sessionId]
  );
}

module.exports = {
  findSnapshotMisconception,
  submitAnswer
};
