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

module.exports = {
  logAIInteraction
};
