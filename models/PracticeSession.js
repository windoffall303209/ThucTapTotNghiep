const db = require('../config/db');
const sampleData = require('../sample-data/sampleData');
const { parseJsonField } = require('../utils/json');

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
        current_index INT NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS',
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
    await addIndexIfMissing('StudentLogs', 'idx_logs_practice_session', 'CREATE INDEX idx_logs_practice_session ON StudentLogs(practice_session_id)');
  } catch (error) {
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

  try {
    const result = await db.query(
      `INSERT INTO PracticeSessions
        (student_id, lesson_id, chapter_id, scope_semester, session_mode, title, question_ids, question_count, current_index, status)
       VALUES (?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, 0, 'IN_PROGRESS')`,
      [
        studentId,
        lessonId,
        chapterId,
        [1, 2].includes(Number(semester)) ? Number(semester) : null,
        mode,
        title,
        JSON.stringify(ids),
        ids.length
      ]
    );
    return getSessionById(studentId, result.insertId);
  } catch (error) {
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
      current_index: 0,
      status: 'IN_PROGRESS',
      started_at: new Date(),
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
    ensureFallbackStore();
    return sampleData.practiceSessions.find(
      (session) => Number(session.id) === Number(sessionId) && Number(session.student_id) === Number(studentId)
    ) || null;
  }
}

async function listSessions(studentId, limit = 50) {
  await ensureSchema();
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  try {
    const rows = await db.query(
      `SELECT ps.*
       FROM PracticeSessions ps
       WHERE ps.student_id = ?
       ORDER BY ps.started_at DESC
       LIMIT ${safeLimit}`,
      [studentId]
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
    ensureFallbackStore();
    return sampleData.practiceSessions
      .filter((session) => Number(session.student_id) === Number(studentId))
      .slice(-limit)
      .reverse()
      .map((session) => ({
        ...session,
        answered_count: sampleData.studentLogs.filter((log) => Number(log.practice_session_id) === Number(session.id)).length,
        correct_count: sampleData.studentLogs.filter((log) => Number(log.practice_session_id) === Number(session.id) && log.is_correct).length,
        chat_count: sampleData.practiceChats.filter((chat) => Number(chat.practice_session_id) === Number(session.id) && chat.role === 'student').length
      }));
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
  ensureSchema,
  createSession,
  getActiveLessonSession,
  getSessionById,
  listSessions,
  listAnswers,
  listChats,
  saveChat,
  syncSessionProgress,
  completeSession
};
