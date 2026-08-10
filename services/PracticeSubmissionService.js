// Dịch vụ practice submission service đóng gói nghiệp vụ chính và phối hợp các lớp dữ liệu hoặc tích hợp bên ngoài.
const db = require('../config/db');
const { parseJsonField } = require('../utils/json');
const { answersMatch } = require('../utils/answerValidation');
const {
  createQuestionSnapshot,
  getSessionTiming
} = require('../models/PracticeSession');

// Hàm submitAnswer dùng để xử lý yêu cầu, điều phối các bước nghiệp vụ và phản hồi lỗi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
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
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!session) return { outcome: 'SESSION_NOT_FOUND' };

    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (getSessionTiming(session, session.server_now_ms).isExpired) {
      await finishLockedSession(connection, session.id, 'EXPIRED');
      return { outcome: 'SESSION_EXPIRED', session };
    }
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (session.status !== 'IN_PROGRESS') {
      return { outcome: 'SESSION_COMPLETED', session };
    }
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!session.question_ids.includes(Number(questionId))) {
      return { outcome: 'QUESTION_NOT_IN_SESSION', session };
    }

    const question = await loadSessionQuestion(connection, session, questionId);
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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

// Hàm normalizeLockedSession dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function normalizeLockedSession(row) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!row) return null;
  return {
    ...row,
    question_ids: parseJsonField(row.question_ids, []).map(Number).filter(Boolean),
    server_now_ms: Number(row.server_now_ms || Date.now())
  };
}

// Hàm loadSessionQuestion dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function loadSessionQuestion(connection, session, questionId) {
  const [snapshotRows] = await connection.execute(
    `SELECT snapshot
     FROM PracticeSessionQuestions
     WHERE practice_session_id = ? AND question_id = ?
     LIMIT 1`,
    [session.id, questionId]
  );
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (snapshotRows[0]) {
    return createQuestionSnapshot(parseJsonField(snapshotRows[0].snapshot, {}));
  }
  return null;
}

// Hàm findSnapshotMisconception dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function findSnapshotMisconception(question, selectedAnswer) {
  return (question?.misconceptions || []).find(
    (item) => String(item.distractor_key) === String(selectedAnswer)
      && String(item.explanation || '').trim()
  ) || null;
}

// Hàm finishLockedSession dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
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
