/* eslint-disable no-console */
require('dotenv').config({ quiet: true });

const db = require('../config/db');
const SystemSetting = require('../models/SystemSetting');

const APPLY_FLAG = '--apply';
const REQUIRED_COLUMNS = [
  'id',
  'lesson_id',
  'question_id',
  'blocked_reason',
  'chat_history',
  'created_at'
];
const INDEX_DEFINITIONS = Object.freeze([
  {
    name: 'idx_ai_logs_created_at',
    sql: 'ALTER TABLE AIConversationLogs ADD INDEX idx_ai_logs_created_at (created_at)'
  },
  {
    name: 'idx_ai_logs_lesson_created_at',
    sql: 'ALTER TABLE AIConversationLogs ADD INDEX idx_ai_logs_lesson_created_at (lesson_id, created_at)'
  },
  {
    name: 'idx_ai_logs_question_created_at',
    sql: 'ALTER TABLE AIConversationLogs ADD INDEX idx_ai_logs_question_created_at (question_id, created_at)'
  }
]);

function parseArgs(argv = []) {
  const unknown = argv.filter((arg) => arg !== APPLY_FLAG);
  if (unknown.length > 0) {
    throw new Error(`Tham số không được hỗ trợ: ${unknown.join(', ')}`);
  }
  return { apply: argv.includes(APPLY_FLAG) };
}

function retentionCutoff(retentionDays, now = new Date()) {
  const days = Number(retentionDays);
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    throw new Error('Thời gian lưu nhật ký AI phải từ 1 đến 365 ngày.');
  }
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

async function getSchemaState() {
  const [columnRows, indexRows] = await Promise.all([
    db.query(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'AIConversationLogs'`
    ),
    db.query(
      `SELECT DISTINCT INDEX_NAME
       FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'AIConversationLogs'`
    )
  ]);
  const columns = columnRows.map((row) => String(row.COLUMN_NAME).toLowerCase());
  const indexes = indexRows.map((row) => String(row.INDEX_NAME).toLowerCase());
  return {
    ready: REQUIRED_COLUMNS.every((column) => columns.includes(column)),
    columns,
    indexes,
    missingIndexes: INDEX_DEFINITIONS
      .map((definition) => definition.name)
      .filter((name) => !indexes.includes(name))
  };
}

async function getPruneState(retentionDays, cutoff, schemaState = null) {
  const schema = schemaState || await getSchemaState();
  if (!schema.ready) {
    return {
      retentionDays,
      cutoff: cutoff.toISOString(),
      schemaReady: false,
      columns: schema.columns,
      missingIndexes: schema.missingIndexes,
      totalRows: 0,
      expiredRows: 0,
      blockedRowsWithContent: 0,
      oldestExpiredAt: null,
      newestExpiredAt: null
    };
  }

  const rows = await db.query(
    `SELECT
       COUNT(*) AS total_rows,
       SUM(created_at < ?) AS expired_rows,
       SUM(
         blocked_reason IS NOT NULL
         AND COALESCE(JSON_LENGTH(chat_history), 0) > 0
       ) AS blocked_rows_with_content,
       MIN(CASE WHEN created_at < ? THEN created_at END) AS oldest_expired_at,
       MAX(CASE WHEN created_at < ? THEN created_at END) AS newest_expired_at
     FROM AIConversationLogs`,
    [cutoff, cutoff, cutoff]
  );
  const row = rows[0] || {};
  return {
    retentionDays,
    cutoff: cutoff.toISOString(),
    schemaReady: true,
    columns: schema.columns,
    missingIndexes: schema.missingIndexes,
    totalRows: Number(row.total_rows || 0),
    expiredRows: Number(row.expired_rows || 0),
    blockedRowsWithContent: Number(row.blocked_rows_with_content || 0),
    oldestExpiredAt: row.oldest_expired_at || null,
    newestExpiredAt: row.newest_expired_at || null
  };
}

async function applyIndexes(schemaState) {
  for (const definition of INDEX_DEFINITIONS) {
    if (schemaState.indexes.includes(definition.name)) continue;
    await db.query(definition.sql);
  }
}

async function applyRetention(retentionDays, cutoff, schemaState) {
  if (!schemaState.ready) {
    throw new Error(
      `AIConversationLogs thiếu cột bắt buộc: ${REQUIRED_COLUMNS
        .filter((column) => !schemaState.columns.includes(column))
        .join(', ')}`
    );
  }

  await db.query(
    `INSERT IGNORE INTO SystemSettings (setting_key, setting_value)
     VALUES ('ai_log_retention_days', ?)`,
    [String(retentionDays)]
  );
  await applyIndexes(schemaState);
  const redactionResult = await db.query(
    `UPDATE AIConversationLogs
     SET chat_history = JSON_ARRAY()
     WHERE blocked_reason IS NOT NULL
       AND COALESCE(JSON_LENGTH(chat_history), 0) > 0`
  );
  const deletionResult = await db.query(
    'DELETE FROM AIConversationLogs WHERE created_at < ?',
    [cutoff]
  );
  return {
    redactedRows: Number(redactionResult.affectedRows || 0),
    deletedRows: Number(deletionResult.affectedRows || 0)
  };
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const connection = await db.testConnection();
  if (!connection.connected) {
    throw new Error(`Không kết nối được database: ${connection.reason || 'unknown'}`);
  }

  const settings = await SystemSetting.getSettings();
  const retentionDays = SystemSetting.getAiLogRetentionDays(settings);
  const cutoff = retentionCutoff(retentionDays);
  const schemaState = await getSchemaState();
  const before = await getPruneState(retentionDays, cutoff, schemaState);

  console.log(JSON.stringify({ mode: 'preflight', ...before }, null, 2));
  if (!options.apply) {
    console.log(
      `Chưa thay đổi database. Dùng "node scripts/apply_ai_log_retention.js ${APPLY_FLAG}" `
      + 'để tạo index còn thiếu và xóa các nhật ký quá hạn.'
    );
    return before;
  }

  const changes = await applyRetention(retentionDays, cutoff, schemaState);
  const afterSchema = await getSchemaState();
  const after = await getPruneState(retentionDays, cutoff, afterSchema);
  console.log(JSON.stringify({ mode: 'post-apply', ...changes, ...after }, null, 2));
  return { ...changes, ...after };
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error('Migration/retention nhật ký AI thất bại:', error.message);
      process.exitCode = 1;
    })
    .finally(async () => {
      if (typeof db.close === 'function') await db.close().catch(() => {});
    });
}

module.exports = {
  APPLY_FLAG,
  INDEX_DEFINITIONS,
  parseArgs,
  retentionCutoff,
  getSchemaState,
  getPruneState,
  applyRetention,
  main
};
