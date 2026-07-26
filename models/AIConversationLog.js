const db = require('../config/db');
const sampleData = require('../sample-data/sampleData');

async function ensureSchema() {
  try {
    await db.query(
      `CREATE TABLE IF NOT EXISTS AIConversationLogs (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        student_id INT NOT NULL,
        session_type VARCHAR(20),
        reference_id INT NOT NULL DEFAULT 0,
        practice_session_id BIGINT NULL,
        question_id INT NULL,
        lesson_id INT NULL,
        provider VARCHAR(50) NULL,
        model VARCHAR(120) NULL,
        is_fallback TINYINT(1) DEFAULT 0,
        blocked_reason VARCHAR(120) NULL,
        chat_history JSON NOT NULL,
        total_tokens_used INT DEFAULT 0,
        estimated_cost_usd DECIMAL(10, 6) DEFAULT 0.000000,
        is_flagged_inaccurate TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    );

    await addColumnIfMissing('practice_session_id', 'ALTER TABLE AIConversationLogs ADD COLUMN practice_session_id BIGINT NULL AFTER reference_id');
    await addColumnIfMissing('question_id', 'ALTER TABLE AIConversationLogs ADD COLUMN question_id INT NULL AFTER practice_session_id');
    await addColumnIfMissing('lesson_id', 'ALTER TABLE AIConversationLogs ADD COLUMN lesson_id INT NULL AFTER question_id');
    await addColumnIfMissing('provider', 'ALTER TABLE AIConversationLogs ADD COLUMN provider VARCHAR(50) NULL AFTER lesson_id');
    await addColumnIfMissing('model', 'ALTER TABLE AIConversationLogs ADD COLUMN model VARCHAR(120) NULL AFTER provider');
    await addColumnIfMissing('is_fallback', 'ALTER TABLE AIConversationLogs ADD COLUMN is_fallback TINYINT(1) DEFAULT 0 AFTER model');
    await addColumnIfMissing('blocked_reason', 'ALTER TABLE AIConversationLogs ADD COLUMN blocked_reason VARCHAR(120) NULL AFTER is_fallback');
  } catch (error) {
    sampleData.aiLogs = sampleData.aiLogs || [];
  }
}

async function addColumnIfMissing(columnName, alterSql) {
  const rows = await db.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'AIConversationLogs' AND COLUMN_NAME = ?`,
    [columnName]
  );
  if (Number(rows[0]?.count || 0) === 0) {
    await db.query(alterSql);
  }
}

async function logAIInteraction(input) {
  const sessionType = input.sessionType || 'EXERCISE_HELP';
  const referenceId = Number(input.referenceId || input.questionId || input.lessonId || 0);
  const chatHistory = Array.isArray(input.chatHistory) ? input.chatHistory : [];

  try {
    await ensureSchema();
    await db.query(
      `INSERT INTO AIConversationLogs
        (student_id, session_type, reference_id, practice_session_id, question_id, lesson_id, provider, model, is_fallback, blocked_reason, chat_history, total_tokens_used, estimated_cost_usd)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), 0, 0.000000)`,
      [
        input.studentId,
        sessionType,
        referenceId,
        input.practiceSessionId || null,
        input.questionId || null,
        input.lessonId || null,
        input.provider || null,
        input.model || null,
        input.isFallback ? 1 : 0,
        input.blockedReason || null,
        JSON.stringify(chatHistory)
      ]
    );
  } catch (error) {
    sampleData.aiLogs = sampleData.aiLogs || [];
    sampleData.aiLogs.push({
      id: sampleData.aiLogs.length + 1,
      student_id: input.studentId,
      session_type: sessionType,
      reference_id: referenceId,
      practice_session_id: input.practiceSessionId || null,
      question_id: input.questionId || null,
      lesson_id: input.lessonId || null,
      provider: input.provider || null,
      model: input.model || null,
      is_fallback: Boolean(input.isFallback),
      blocked_reason: input.blockedReason || null,
      chat_history: chatHistory,
      created_at: new Date()
    });
  }
}

function parseChatHistory(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function normalizeLogRow(row) {
  return {
    ...row,
    chat_history: parseChatHistory(row.chat_history),
    is_fallback: Number(row.is_fallback) === 1 || row.is_fallback === true,
    is_flagged_inaccurate: Number(row.is_flagged_inaccurate) === 1 || row.is_flagged_inaccurate === true
  };
}

// Chức năng AD-08: liệt kê nhật ký hội thoại để quản trị viên rà soát chất lượng
// câu trả lời của AI và phát hiện câu hỏi lệch chủ đề từ học sinh.
async function listLogs({ page = 1, limit = 20, studentId = null, sessionType = '', onlyFlagged = false } = {}) {
  await ensureSchema();
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 5), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const conditions = [];
  const params = [];
  if (studentId) {
    conditions.push('log.student_id = ?');
    params.push(Number(studentId));
  }
  if (sessionType) {
    conditions.push('log.session_type = ?');
    params.push(sessionType);
  }
  if (onlyFlagged) {
    conditions.push('log.is_flagged_inaccurate = 1');
  }
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const countRows = await db.query(
      `SELECT COUNT(*) AS total FROM AIConversationLogs log ${whereClause}`,
      params
    );
    const total = Number(countRows[0]?.total || 0);

    const rows = await db.query(
      `SELECT
          log.*,
          s.username,
          s.fullname,
          s.current_grade,
          l.lesson_name
       FROM AIConversationLogs log
       LEFT JOIN Students s ON s.id = log.student_id
       LEFT JOIN Lessons l ON l.id = log.lesson_id
       ${whereClause}
       ORDER BY log.created_at DESC, log.id DESC
       LIMIT ${safeLimit} OFFSET ${offset}`,
      params
    );

    return {
      logs: rows.map(normalizeLogRow),
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.max(Math.ceil(total / safeLimit), 1)
      }
    };
  } catch (error) {
    const all = (sampleData.aiLogs || []).map(normalizeLogRow);
    return {
      logs: all.slice(offset, offset + safeLimit),
      pagination: {
        page: safePage,
        limit: safeLimit,
        total: all.length,
        totalPages: Math.max(Math.ceil(all.length / safeLimit), 1)
      }
    };
  }
}

// Số liệu tổng quan. Cố ý KHÔNG trả về token hay chi phí: câu INSERT trong
// logAIInteraction gán cứng total_tokens_used và estimated_cost_usd bằng 0 nên
// hai cột đó chưa có dữ liệu thật, hiển thị ra sẽ gây hiểu sai.
async function getLogStats() {
  await ensureSchema();
  try {
    const rows = await db.query(
      `SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN is_fallback = 1 THEN 1 ELSE 0 END) AS fallback_count,
          SUM(CASE WHEN blocked_reason IS NOT NULL THEN 1 ELSE 0 END) AS blocked_count,
          SUM(CASE WHEN is_flagged_inaccurate = 1 THEN 1 ELSE 0 END) AS flagged_count,
          COUNT(DISTINCT student_id) AS student_count
       FROM AIConversationLogs`
    );
    const providers = await db.query(
      `SELECT COALESCE(provider, 'chưa ghi nhận') AS provider, COUNT(*) AS count
       FROM AIConversationLogs
       GROUP BY provider
       ORDER BY count DESC`
    );
    const blocked = await db.query(
      `SELECT blocked_reason, COUNT(*) AS count
       FROM AIConversationLogs
       WHERE blocked_reason IS NOT NULL
       GROUP BY blocked_reason
       ORDER BY count DESC`
    );

    const summary = rows[0] || {};
    return {
      total: Number(summary.total || 0),
      fallbackCount: Number(summary.fallback_count || 0),
      blockedCount: Number(summary.blocked_count || 0),
      flaggedCount: Number(summary.flagged_count || 0),
      studentCount: Number(summary.student_count || 0),
      providers: providers.map((row) => ({ provider: row.provider, count: Number(row.count) })),
      blockedReasons: blocked.map((row) => ({ reason: row.blocked_reason, count: Number(row.count) }))
    };
  } catch (error) {
    const all = sampleData.aiLogs || [];
    return {
      total: all.length,
      fallbackCount: all.filter((item) => item.is_fallback).length,
      blockedCount: all.filter((item) => item.blocked_reason).length,
      flaggedCount: 0,
      studentCount: new Set(all.map((item) => item.student_id)).size,
      providers: [],
      blockedReasons: []
    };
  }
}

// Đánh dấu một hội thoại là AI trả lời sai kiến thức, phục vụ việc tối ưu prompt
// về sau. Trả về true nếu có bản ghi được cập nhật.
async function setFlagged(logId, flagged) {
  await ensureSchema();
  try {
    const result = await db.query(
      'UPDATE AIConversationLogs SET is_flagged_inaccurate = ? WHERE id = ?',
      [flagged ? 1 : 0, Number(logId)]
    );
    return Number(result?.affectedRows || 0) > 0;
  } catch (error) {
    const log = (sampleData.aiLogs || []).find((item) => Number(item.id) === Number(logId));
    if (!log) return false;
    log.is_flagged_inaccurate = Boolean(flagged);
    return true;
  }
}

module.exports = {
  logAIInteraction,
  listLogs,
  getLogStats,
  setFlagged
};
