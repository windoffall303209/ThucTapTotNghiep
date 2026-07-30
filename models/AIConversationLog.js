const db = require('../config/db');
const sampleData = require('../sample-data/sampleData');
const { fallbackOrThrow } = require('../utils/sampleDataFallback');

let schemaCheckPromise = null;
const AI_SESSION_TYPES = new Set(['EXERCISE_HELP', 'THEORY_EXPLAIN']);
const DAY_IN_MS = 24 * 60 * 60 * 1000;

async function ensureSchema() {
  if (!schemaCheckPromise) {
    schemaCheckPromise = verifySchemaReady();
  }
  try {
    await schemaCheckPromise;
  } catch (error) {
    schemaCheckPromise = null;
    fallbackOrThrow(error);
    sampleData.aiLogs = sampleData.aiLogs || [];
  }
}

async function verifySchemaReady() {
  const requiredColumns = [
    'practice_session_id',
    'question_id',
    'lesson_id',
    'provider',
    'model',
    'is_fallback',
    'blocked_reason',
    'chat_history',
    'is_flagged_inaccurate',
    'created_at'
  ];
  const rows = await db.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'AIConversationLogs'`
  );
  const columns = new Set(rows.map((row) => String(row.COLUMN_NAME).toLowerCase()));
  const missing = requiredColumns.filter((column) => !columns.has(column));
  if (missing.length > 0) {
    const error = new Error(
      `Database thiếu schema AIConversationLogs (${missing.join(', ')}). `
      + 'Hãy chạy migration database trước khi khởi động ứng dụng.'
    );
    error.code = 'SCHEMA_MIGRATION_REQUIRED';
    error.status = 503;
    throw error;
  }
}

function invalidLogFilter(message) {
  const error = new Error(message);
  error.code = 'INVALID_AI_LOG_FILTER';
  error.status = 400;
  return error;
}

function normalizeDateFilter(value, label) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw invalidLogFilter(`${label} phải có định dạng YYYY-MM-DD.`);
  }

  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) {
    throw invalidLogFilter(`${label} không phải ngày hợp lệ.`);
  }
  return normalized;
}

function normalizePositiveId(value, label) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const normalized = String(value).trim();
  if (!/^[1-9]\d*$/.test(normalized)) {
    throw invalidLogFilter(`${label} không hợp lệ.`);
  }
  const number = Number(normalized);
  if (!Number.isSafeInteger(number)) throw invalidLogFilter(`${label} không hợp lệ.`);
  return number;
}

function normalizeLogFilters(filters = {}) {
  const from = normalizeDateFilter(filters.from, 'Ngày bắt đầu');
  const to = normalizeDateFilter(filters.to, 'Ngày kết thúc');
  if (from && to && from > to) {
    throw invalidLogFilter('Ngày bắt đầu không được sau ngày kết thúc.');
  }

  const sessionType = String(filters.sessionType || '').trim().toUpperCase();
  if (sessionType && !AI_SESSION_TYPES.has(sessionType)) {
    throw invalidLogFilter('Loại hội thoại không hợp lệ.');
  }

  return {
    studentId: normalizePositiveId(filters.studentId, 'Học sinh'),
    sessionType,
    onlyFlagged:
      filters.onlyFlagged === true
      || filters.onlyFlagged === 1
      || filters.onlyFlagged === '1',
    lessonId: normalizePositiveId(filters.lessonId, 'Bài học'),
    from,
    to
  };
}

function buildLogFilter(filters = {}) {
  const normalized = normalizeLogFilters(filters);
  const conditions = [];
  const params = [];

  if (normalized.studentId) {
    conditions.push('log.student_id = ?');
    params.push(normalized.studentId);
  }
  if (normalized.sessionType) {
    conditions.push('log.session_type = ?');
    params.push(normalized.sessionType);
  }
  if (normalized.onlyFlagged) {
    conditions.push('log.is_flagged_inaccurate = 1');
  }
  if (normalized.lessonId) {
    conditions.push(
      `(log.lesson_id = ?
        OR log.question_id IN (
          SELECT question_filter.id
          FROM QuestionBank question_filter
          WHERE question_filter.lesson_id = ?
        ))`
    );
    params.push(normalized.lessonId, normalized.lessonId);
  }
  if (normalized.from) {
    conditions.push('log.created_at >= ?');
    params.push(`${normalized.from} 00:00:00`);
  }
  if (normalized.to) {
    conditions.push('log.created_at < DATE_ADD(?, INTERVAL 1 DAY)');
    params.push(`${normalized.to} 00:00:00`);
  }

  return {
    filters: normalized,
    conditions,
    params,
    whereClause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  };
}

function normalizeStoredChatHistory(value, blockedReason = null) {
  if (blockedReason) return [];
  return Array.isArray(value) ? value : [];
}

async function logAIInteraction(input) {
  const sessionType = input.sessionType || 'EXERCISE_HELP';
  const referenceId = Number(input.referenceId || input.questionId || input.lessonId || 0);
  const blockedReason = String(input.blockedReason || '').trim().slice(0, 120) || null;
  const chatHistory = normalizeStoredChatHistory(input.chatHistory, blockedReason);

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
        blockedReason,
        JSON.stringify(chatHistory)
      ]
    );
  } catch (error) {
    fallbackOrThrow(error);
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
      blocked_reason: blockedReason,
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
  const blockedReason = String(row.blocked_reason || '').trim() || null;
  return {
    ...row,
    blocked_reason: blockedReason,
    chat_history: normalizeStoredChatHistory(parseChatHistory(row.chat_history), blockedReason),
    is_fallback: Number(row.is_fallback) === 1 || row.is_fallback === true,
    is_flagged_inaccurate: Number(row.is_flagged_inaccurate) === 1 || row.is_flagged_inaccurate === true
  };
}

function filterSampleLogs(rows, filters) {
  const fromMs = filters.from ? Date.parse(`${filters.from}T00:00:00.000Z`) : null;
  const toExclusiveMs = filters.to
    ? Date.parse(`${filters.to}T00:00:00.000Z`) + DAY_IN_MS
    : null;

  return rows.filter((item) => {
    if (filters.studentId && Number(item.student_id) !== filters.studentId) return false;
    if (filters.sessionType && String(item.session_type) !== filters.sessionType) return false;
    if (filters.onlyFlagged && !(Number(item.is_flagged_inaccurate) === 1 || item.is_flagged_inaccurate === true)) {
      return false;
    }
    if (filters.lessonId) {
      const question = (sampleData.questions || []).find(
        (candidate) => Number(candidate.id) === Number(item.question_id)
      );
      const effectiveLessonId = Number(item.lesson_id || question?.lesson_id);
      if (effectiveLessonId !== filters.lessonId) return false;
    }
    if (fromMs !== null || toExclusiveMs !== null) {
      const createdAt = new Date(item.created_at).getTime();
      if (!Number.isFinite(createdAt)) return false;
      if (fromMs !== null && createdAt < fromMs) return false;
      if (toExclusiveMs !== null && createdAt >= toExclusiveMs) return false;
    }
    return true;
  });
}

// Chức năng AD-08: liệt kê nhật ký hội thoại để quản trị viên rà soát chất lượng
// câu trả lời của AI và phát hiện câu hỏi lệch chủ đề từ học sinh.
async function listLogs(options = {}) {
  const { page = 1, limit = 20 } = options;
  const filter = buildLogFilter(options);
  await ensureSchema();
  const requestedLimit = Number(limit);
  const requestedPage = Number(page);
  const safeLimit = Number.isSafeInteger(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 5), 100)
    : 20;
  const safePage = Number.isSafeInteger(requestedPage) && requestedPage > 0
    ? requestedPage
    : 1;
  const offset = (safePage - 1) * safeLimit;

  try {
    const countRows = await db.query(
      `SELECT COUNT(*) AS total FROM AIConversationLogs log ${filter.whereClause}`,
      filter.params
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
       LEFT JOIN QuestionBank q ON q.id = log.question_id
       LEFT JOIN Lessons l ON l.id = COALESCE(log.lesson_id, q.lesson_id)
       ${filter.whereClause}
       ORDER BY log.created_at DESC, log.id DESC
       LIMIT ${safeLimit} OFFSET ${offset}`,
      filter.params
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
    fallbackOrThrow(error);
    const all = filterSampleLogs(
      (sampleData.aiLogs || []).map(normalizeLogRow),
      filter.filters
    ).sort((left, right) => {
      const dateDifference = new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
      return dateDifference || Number(right.id) - Number(left.id);
    });
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
async function getLogStats(filters = {}) {
  const filter = buildLogFilter(filters);
  await ensureSchema();
  try {
    const blockedWhereClause = filter.conditions.length > 0
      ? `WHERE ${filter.conditions.join(' AND ')} AND log.blocked_reason IS NOT NULL`
      : 'WHERE log.blocked_reason IS NOT NULL';
    const [rows, providers, blocked] = await Promise.all([
      db.query(
        `SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN log.is_fallback = 1 THEN 1 ELSE 0 END) AS fallback_count,
          SUM(CASE WHEN log.blocked_reason IS NOT NULL THEN 1 ELSE 0 END) AS blocked_count,
          SUM(CASE WHEN log.is_flagged_inaccurate = 1 THEN 1 ELSE 0 END) AS flagged_count,
          COUNT(DISTINCT log.student_id) AS student_count
       FROM AIConversationLogs log
       ${filter.whereClause}`,
        filter.params
      ),
      db.query(
        `SELECT COALESCE(log.provider, 'chưa ghi nhận') AS provider, COUNT(*) AS count
         FROM AIConversationLogs log
         ${filter.whereClause}
         GROUP BY log.provider
         ORDER BY count DESC`,
        filter.params
      ),
      db.query(
        `SELECT log.blocked_reason, COUNT(*) AS count
         FROM AIConversationLogs log
         ${blockedWhereClause}
         GROUP BY log.blocked_reason
         ORDER BY count DESC`,
        filter.params
      )
    ]);

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
    fallbackOrThrow(error);
    const all = filterSampleLogs(
      (sampleData.aiLogs || []).map(normalizeLogRow),
      filter.filters
    );
    const providerCounts = new Map();
    const blockedCounts = new Map();
    for (const item of all) {
      const provider = item.provider || 'chưa ghi nhận';
      providerCounts.set(provider, (providerCounts.get(provider) || 0) + 1);
      if (item.blocked_reason) {
        blockedCounts.set(
          item.blocked_reason,
          (blockedCounts.get(item.blocked_reason) || 0) + 1
        );
      }
    }
    return {
      total: all.length,
      fallbackCount: all.filter((item) => item.is_fallback).length,
      blockedCount: all.filter((item) => item.blocked_reason).length,
      flaggedCount: all.filter((item) => item.is_flagged_inaccurate).length,
      studentCount: new Set(all.map((item) => item.student_id)).size,
      providers: Array.from(providerCounts, ([provider, count]) => ({ provider, count }))
        .sort((left, right) => right.count - left.count),
      blockedReasons: Array.from(blockedCounts, ([reason, count]) => ({ reason, count }))
        .sort((left, right) => right.count - left.count)
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
    fallbackOrThrow(error);
    const log = (sampleData.aiLogs || []).find((item) => Number(item.id) === Number(logId));
    if (!log) return false;
    log.is_flagged_inaccurate = Boolean(flagged);
    return true;
  }
}

module.exports = {
  ensureSchema,
  logAIInteraction,
  listLogs,
  getLogStats,
  setFlagged,
  normalizeLogFilters,
  buildLogFilter,
  normalizeStoredChatHistory
};
