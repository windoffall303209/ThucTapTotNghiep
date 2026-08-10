// Script apply session integrity hỗ trợ nhập, xuất, kiểm tra hoặc bảo trì dữ liệu và cấu hình của dự án.
/* eslint-disable no-console */
require('dotenv').config({ quiet: true });

const fs = require('node:fs/promises');
const path = require('node:path');
const db = require('../config/db');

const APPLY_FLAG = '--apply';
const HELP_FLAGS = new Set(['--help', '-h']);
const COMPLETION_REASONS = Object.freeze({
  MISSING_QUESTION: 'CONTENT_UNAVAILABLE',
  EXPIRED: 'EXPIRED',
  DUPLICATE: 'REPLACED'
});

// Hàm parseArgs dùng để phân tích đầu vào thành cấu trúc có thể sử dụng; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function parseArgs(argv) {
  const unknown = argv.filter((arg) => arg !== APPLY_FLAG && !HELP_FLAGS.has(arg));
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (unknown.length > 0) {
    throw new Error(`Tham số không được hỗ trợ: ${unknown.join(', ')}`);
  }
  return {
    apply: argv.includes(APPLY_FLAG),
    help: argv.some((arg) => HELP_FLAGS.has(arg))
  };
}

// Hàm printHelp dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function printHelp() {
  console.log(`
Rà soát và nâng cấp tính toàn vẹn phiên luyện tập.

Cách dùng:
  node scripts/apply_session_integrity.js
      Chỉ chạy preflight read-only, không thay đổi database.

  node scripts/apply_session_integrity.js --apply
      Sao lưu dữ liệu bị tác động vào tmp/, sau đó áp dụng migration và reconcile.

Migration không tự ghép câu hỏi mới vào phiên cũ bị mất câu. Những phiên đó được
kết thúc với completion_reason=${COMPLETION_REASONS.MISSING_QUESTION}.
`.trim());
}

// Hàm asNumber dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

// Hàm firstRow dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function firstRow(rows) {
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : {};
}

// Hàm quoteIdentifier dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function quoteIdentifier(value) {
  const identifier = String(value || '');
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!/^[A-Za-z0-9_$]+$/.test(identifier)) {
    throw new Error(`Tên định danh database không hợp lệ: ${identifier}`);
  }
  return `\`${identifier}\``;
}

// Hàm tableExists dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function tableExists(tableName) {
  const rows = await db.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = LOWER(?)`,
    [tableName]
  );
  return asNumber(rows[0]?.count) > 0;
}

// Hàm columnExists dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function columnExists(tableName, columnName) {
  const rows = await db.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND LOWER(TABLE_NAME) = LOWER(?)
       AND LOWER(COLUMN_NAME) = LOWER(?)`,
    [tableName, columnName]
  );
  return asNumber(rows[0]?.count) > 0;
}

// Hàm indexExists dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function indexExists(tableName, indexName) {
  const rows = await db.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND LOWER(TABLE_NAME) = LOWER(?)
       AND LOWER(INDEX_NAME) = LOWER(?)`,
    [tableName, indexName]
  );
  return asNumber(rows[0]?.count) > 0;
}

// Hàm constraintExists dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function constraintExists(tableName, constraintName) {
  const rows = await db.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE()
       AND LOWER(TABLE_NAME) = LOWER(?)
       AND LOWER(CONSTRAINT_NAME) = LOWER(?)`,
    [tableName, constraintName]
  );
  return asNumber(rows[0]?.count) > 0;
}

// Hàm foreignKeyExistsForColumns dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function foreignKeyExistsForColumns(
  tableName,
  columnNames,
  referencedTableName,
  referencedColumnNames
) {
  const rows = await db.query(
    `SELECT kcu.CONSTRAINT_NAME
     FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
     WHERE kcu.CONSTRAINT_SCHEMA = DATABASE()
       AND LOWER(kcu.TABLE_NAME) = LOWER(?)
       AND LOWER(kcu.REFERENCED_TABLE_NAME) = LOWER(?)
     GROUP BY kcu.CONSTRAINT_NAME
     HAVING LOWER(GROUP_CONCAT(kcu.COLUMN_NAME ORDER BY kcu.ORDINAL_POSITION)) = LOWER(?)
        AND LOWER(GROUP_CONCAT(kcu.REFERENCED_COLUMN_NAME ORDER BY kcu.ORDINAL_POSITION)) = LOWER(?)
     LIMIT 1`,
    [
      tableName,
      referencedTableName,
      columnNames.join(','),
      referencedColumnNames.join(',')
    ]
  );
  return rows[0] || null;
}

// Hàm addColumnIfMissing dùng để tạo bản ghi hoặc tài nguyên mới sau khi kiểm tra đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function addColumnIfMissing(tableName, columnName, definition) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (await columnExists(tableName, columnName)) return false;
  await db.query(
    `ALTER TABLE ${quoteIdentifier(tableName)}
     ADD COLUMN ${quoteIdentifier(columnName)} ${definition}`
  );
  console.log(`+ Đã thêm ${tableName}.${columnName}`);
  return true;
}

// Hàm addIndexIfMissing dùng để tạo bản ghi hoặc tài nguyên mới sau khi kiểm tra đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function addIndexIfMissing(tableName, indexName, createSql) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (await indexExists(tableName, indexName)) return false;
  await db.query(createSql);
  console.log(`+ Đã thêm index ${indexName}`);
  return true;
}

// Hàm addConstraintIfMissing dùng để tạo bản ghi hoặc tài nguyên mới sau khi kiểm tra đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function addConstraintIfMissing(tableName, constraintName, alterSql) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (await constraintExists(tableName, constraintName)) return false;
  await db.query(alterSql);
  console.log(`+ Đã thêm constraint ${constraintName}`);
  return true;
}

// Hàm getSchemaState dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function getSchemaState() {
  const [
    hasPracticeSessionQuestions,
    hasAIUsageDaily,
    hasQuestionActive,
    hasCompletionReason,
    hasActiveKey,
    hasSessionAIHintCount
  ] = await Promise.all([
    tableExists('PracticeSessionQuestions'),
    tableExists('AIUsageDaily'),
    columnExists('QuestionBank', 'is_active'),
    columnExists('PracticeSessions', 'completion_reason'),
    columnExists('PracticeSessions', 'active_key'),
    columnExists('PracticeSessions', 'ai_hint_count')
  ]);

  return {
    hasPracticeSessionQuestions,
    hasAIUsageDaily,
    hasQuestionActive,
    hasCompletionReason,
    hasActiveKey,
    hasSessionAIHintCount
  };
}

// Hàm getPreflightReport dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function getPreflightReport() {
  const schema = await getSchemaState();
  const [
    totals,
    missingQuestionRefs,
    expiredActiveSessions,
    duplicateActiveSessions,
    duplicateSessionQuestionRefs,
    invalidProgress,
    duplicateAnswers,
    duplicateMisconceptions,
    orphanSessionLogs,
    answerOwnerMismatches,
    orphanQuestionLogs,
    chatsWithoutQuestion
  ] = await Promise.all([
    db.query(
      `SELECT
         (SELECT COUNT(*) FROM QuestionBank) AS questions,
         (SELECT COUNT(*) FROM PracticeSessions) AS sessions,
         (SELECT COUNT(*) FROM StudentLogs) AS answers,
         (SELECT COUNT(*) FROM PracticeSessionChats) AS chats,
         (SELECT COUNT(*) FROM AIConversationLogs) AS ai_logs`
    ),
    db.query(
      `SELECT COUNT(DISTINCT ps.id) AS sessions, COUNT(*) AS missing_refs
       FROM PracticeSessions ps
       JOIN JSON_TABLE(
         ps.question_ids,
         '$[*]' COLUMNS(question_id INT PATH '$')
       ) AS jt
       LEFT JOIN QuestionBank q ON q.id = jt.question_id
       WHERE q.id IS NULL`
    ),
    db.query(
      `SELECT COUNT(*) AS count
       FROM PracticeSessions
       WHERE status = 'IN_PROGRESS'
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
         )`
    ),
    db.query(
      `SELECT COUNT(*) AS groups_count, COALESCE(SUM(item_count - 1), 0) AS extra_sessions
       FROM (
         SELECT
           student_id,
           session_mode,
           COALESCE(lesson_id, 0) AS lesson_scope,
           COALESCE(chapter_id, 0) AS chapter_scope,
           COALESCE(scope_semester, 0) AS semester_scope,
           COUNT(*) AS item_count
         FROM PracticeSessions
         WHERE status = 'IN_PROGRESS'
         GROUP BY
           student_id,
           session_mode,
           COALESCE(lesson_id, 0),
           COALESCE(chapter_id, 0),
           COALESCE(scope_semester, 0)
         HAVING COUNT(*) > 1
       ) AS duplicate_groups`
    ),
    db.query(
      `SELECT COUNT(*) AS groups_count, COALESCE(SUM(item_count - 1), 0) AS duplicate_refs
       FROM (
         SELECT ps.id, jt.question_id, COUNT(*) AS item_count
         FROM PracticeSessions ps
         JOIN JSON_TABLE(
           ps.question_ids,
           '$[*]' COLUMNS(question_id INT PATH '$')
         ) AS jt
         GROUP BY ps.id, jt.question_id
         HAVING COUNT(*) > 1
       ) AS duplicate_refs`
    ),
    db.query(
      `SELECT COUNT(*) AS count
       FROM PracticeSessions ps
       LEFT JOIN (
         SELECT practice_session_id, COUNT(DISTINCT question_id) AS answered_count
         FROM StudentLogs
         WHERE practice_session_id IS NOT NULL
         GROUP BY practice_session_id
       ) AS answers ON answers.practice_session_id = ps.id
       WHERE ps.current_index <> COALESCE(answers.answered_count, 0)`
    ),
    db.query(
      `SELECT COUNT(*) AS groups_count, COALESCE(SUM(item_count - 1), 0) AS extra_rows
       FROM (
         SELECT practice_session_id, question_id, COUNT(*) AS item_count
         FROM StudentLogs
         WHERE practice_session_id IS NOT NULL
         GROUP BY practice_session_id, question_id
         HAVING COUNT(*) > 1
       ) AS duplicate_answers`
    ),
    db.query(
      `SELECT COUNT(*) AS groups_count, COALESCE(SUM(item_count - 1), 0) AS extra_rows
       FROM (
         SELECT question_id, distractor_key, COUNT(*) AS item_count
         FROM CommonMisconceptions
         GROUP BY question_id, distractor_key
         HAVING COUNT(*) > 1
       ) AS duplicate_misconceptions`
    ),
    db.query(
      `SELECT COUNT(*) AS count
       FROM StudentLogs sl
       LEFT JOIN PracticeSessions ps ON ps.id = sl.practice_session_id
       WHERE sl.practice_session_id IS NOT NULL AND ps.id IS NULL`
    ),
    db.query(
      `SELECT COUNT(*) AS count
       FROM StudentLogs sl
       JOIN PracticeSessions ps ON ps.id = sl.practice_session_id
       WHERE sl.student_id <> ps.student_id`
    ),
    db.query(
      `SELECT COUNT(*) AS count
       FROM StudentLogs sl
       LEFT JOIN QuestionBank q ON q.id = sl.question_id
       WHERE q.id IS NULL`
    ),
    db.query(
      `SELECT COUNT(*) AS count
       FROM PracticeSessionChats
       WHERE question_id IS NULL`
    )
  ]);

  let answerMembershipMismatches = null;
  let chatMembershipMismatches = null;
  let aiSessionMismatches = null;
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (schema.hasPracticeSessionQuestions) {
    [answerMembershipMismatches, chatMembershipMismatches, aiSessionMismatches] = await Promise.all([
      db.query(
        `SELECT COUNT(*) AS count
         FROM StudentLogs sl
         LEFT JOIN PracticeSessionQuestions psq
           ON psq.practice_session_id = sl.practice_session_id
          AND psq.question_id = sl.question_id
         WHERE sl.practice_session_id IS NOT NULL
           AND psq.practice_session_id IS NULL`
      ),
      db.query(
        `SELECT COUNT(*) AS count
         FROM PracticeSessionChats chat
         LEFT JOIN PracticeSessionQuestions psq
           ON psq.practice_session_id = chat.practice_session_id
          AND psq.question_id = chat.question_id
         WHERE chat.question_id IS NOT NULL
           AND psq.practice_session_id IS NULL`
      ),
      db.query(
        `SELECT COUNT(*) AS count
         FROM AIConversationLogs ai
         LEFT JOIN PracticeSessions ps ON ps.id = ai.practice_session_id
         LEFT JOIN PracticeSessionQuestions psq
           ON psq.practice_session_id = ai.practice_session_id
          AND psq.question_id = ai.question_id
         WHERE ai.practice_session_id IS NOT NULL
           AND (
             ps.id IS NULL
             OR ps.student_id <> ai.student_id
             OR (ai.question_id IS NOT NULL AND psq.practice_session_id IS NULL)
           )`
      )
    ]);
  }

  return {
    generated_at: new Date().toISOString(),
    mode: 'preflight',
    schema,
    totals: firstRow(totals),
    integrity: {
      missing_question_references: firstRow(missingQuestionRefs),
      expired_active_sessions: asNumber(firstRow(expiredActiveSessions).count),
      duplicate_active_sessions: firstRow(duplicateActiveSessions),
      duplicate_session_question_references: firstRow(duplicateSessionQuestionRefs),
      sessions_with_invalid_progress: asNumber(firstRow(invalidProgress).count),
      duplicate_answers: firstRow(duplicateAnswers),
      duplicate_misconceptions: firstRow(duplicateMisconceptions),
      orphan_session_logs: asNumber(firstRow(orphanSessionLogs).count),
      answer_owner_mismatches: asNumber(firstRow(answerOwnerMismatches).count),
      orphan_question_logs: asNumber(firstRow(orphanQuestionLogs).count),
      chats_without_question: asNumber(firstRow(chatsWithoutQuestion).count),
      answer_membership_mismatches: answerMembershipMismatches
        ? asNumber(firstRow(answerMembershipMismatches).count)
        : null,
      chat_membership_mismatches: chatMembershipMismatches
        ? asNumber(firstRow(chatMembershipMismatches).count)
        : null,
      ai_session_mismatches: aiSessionMismatches
        ? asNumber(firstRow(aiSessionMismatches).count)
        : null
    }
  };
}

// Hàm selectIfTableExists dùng để lựa chọn phương án phù hợp dựa trên trạng thái và ưu tiên; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function selectIfTableExists(tableName, sql = null) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!(await tableExists(tableName))) return [];
  return db.query(sql || `SELECT * FROM ${quoteIdentifier(tableName)} ORDER BY 1`);
}

// Hàm backupAffectedData dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function backupAffectedData(preflight) {
  const [
    practiceSessions,
    studentLogs,
    practiceSessionChats,
    aiConversationLogs,
    existingSnapshots,
    existingDailyUsage,
    referencedQuestions,
    referencedMisconceptions
  ] = await Promise.all([
    selectIfTableExists('PracticeSessions'),
    selectIfTableExists('StudentLogs'),
    selectIfTableExists('PracticeSessionChats'),
    selectIfTableExists('AIConversationLogs'),
    selectIfTableExists('PracticeSessionQuestions'),
    selectIfTableExists('AIUsageDaily'),
    db.query(
      `SELECT DISTINCT q.*
       FROM PracticeSessions ps
       JOIN JSON_TABLE(
         ps.question_ids,
         '$[*]' COLUMNS(question_id INT PATH '$')
       ) AS jt
       JOIN QuestionBank q ON q.id = jt.question_id
       ORDER BY q.id`
    ),
    db.query(
      `SELECT DISTINCT cm.*
       FROM PracticeSessions ps
       JOIN JSON_TABLE(
         ps.question_ids,
         '$[*]' COLUMNS(question_id INT PATH '$')
       ) AS jt
       JOIN CommonMisconceptions cm ON cm.question_id = jt.question_id
       ORDER BY cm.id`
    )
  ]);

  const backup = {
    backup_version: 1,
    created_at: new Date().toISOString(),
    purpose: 'apply_session_integrity',
    preflight,
    data: {
      PracticeSessions: practiceSessions,
      StudentLogs: studentLogs,
      PracticeSessionChats: practiceSessionChats,
      AIConversationLogs: aiConversationLogs,
      PracticeSessionQuestions: existingSnapshots,
      AIUsageDaily: existingDailyUsage,
      ReferencedQuestionBank: referencedQuestions,
      ReferencedCommonMisconceptions: referencedMisconceptions
    }
  };

  const tmpDirectory = path.resolve(__dirname, '..', 'tmp');
  await fs.mkdir(tmpDirectory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(tmpDirectory, `session-integrity-backup-${timestamp}.json`);
  await fs.writeFile(backupPath, `${JSON.stringify(backup, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx'
  });
  console.log(`Đã sao lưu dữ liệu bị tác động: ${backupPath}`);
  return backupPath;
}

// Hàm expandSchema dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function expandSchema() {
  await addColumnIfMissing(
    'QuestionBank',
    'is_active',
    'TINYINT(1) NOT NULL DEFAULT 1 AFTER explanation'
  );
  await addColumnIfMissing(
    'QuestionBank',
    'archived_at',
    'TIMESTAMP NULL AFTER is_active'
  );
  await addColumnIfMissing(
    'QuestionBank',
    'updated_at',
    'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at'
  );
  await addIndexIfMissing(
    'QuestionBank',
    'idx_questions_active_lesson',
    `CREATE INDEX idx_questions_active_lesson
     ON QuestionBank(is_active, lesson_id, difficulty, id)`
  );

  await addColumnIfMissing(
    'PracticeSessions',
    'completion_reason',
    'VARCHAR(40) NULL AFTER status'
  );
  await addColumnIfMissing(
    'PracticeSessions',
    'ai_hint_count',
    'INT UNSIGNED NOT NULL DEFAULT 0 AFTER current_index'
  );
  await addColumnIfMissing(
    'PracticeSessions',
    'active_key',
    'VARCHAR(191) NULL AFTER completion_reason'
  );

  await db.query(
    `CREATE TABLE IF NOT EXISTS PracticeSessionQuestions (
       practice_session_id BIGINT NOT NULL,
       question_id INT NOT NULL,
       position INT UNSIGNED NOT NULL,
       snapshot JSON NOT NULL,
       ai_hint_count INT UNSIGNED NOT NULL DEFAULT 0,
       PRIMARY KEY (practice_session_id, question_id),
       UNIQUE KEY uq_practice_session_question_position (practice_session_id, position),
       CONSTRAINT fk_practice_session_questions_session
         FOREIGN KEY (practice_session_id)
         REFERENCES PracticeSessions(id)
         ON DELETE CASCADE
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
  await addIndexIfMissing(
    'PracticeSessionQuestions',
    'idx_practice_session_questions_source',
    `CREATE INDEX idx_practice_session_questions_source
     ON PracticeSessionQuestions(question_id)`
  );

  await db.query(
    `CREATE TABLE IF NOT EXISTS AIUsageDaily (
       student_id INT NOT NULL,
       usage_date DATE NOT NULL,
       request_count INT UNSIGNED NOT NULL DEFAULT 0,
       updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
       PRIMARY KEY (student_id, usage_date),
       CONSTRAINT fk_ai_usage_daily_student
         FOREIGN KEY (student_id)
         REFERENCES Students(id)
         ON DELETE CASCADE
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
}

// Hàm backfillQuestionSnapshots dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function backfillQuestionSnapshots() {
  const result = await db.query(
    `INSERT IGNORE INTO PracticeSessionQuestions
       (practice_session_id, question_id, position, snapshot, ai_hint_count)
     SELECT
       ps.id,
       jt.question_id,
       jt.position - 1,
       JSON_OBJECT(
         'snapshot_version', 1,
         'id', q.id,
         'lesson_id', q.lesson_id,
         'concept_id', q.concept_id,
         'question_type', q.question_type,
         'difficulty', q.difficulty,
         'layout_template', q.layout_template,
         'content', q.content,
         'choices', q.choices,
         'correct_answer', q.correct_answer,
         'explanation', q.explanation,
         'lesson_name', l.lesson_name,
         'chapter_id', c.id,
         'chapter_name', c.chapter_name,
         'grade', c.grade,
         'misconceptions', COALESCE(
           (
             SELECT JSON_ARRAYAGG(
               JSON_OBJECT(
                 'id', cm.id,
                 'distractor_key', cm.distractor_key,
                 'misconception_name', cm.misconception_name,
                 'explanation', cm.explanation
               )
             )
             FROM CommonMisconceptions cm
             WHERE cm.question_id = q.id
           ),
           JSON_ARRAY()
         )
       ),
       0
     FROM PracticeSessions ps
     JOIN JSON_TABLE(
       ps.question_ids,
       '$[*]' COLUMNS(
         position FOR ORDINALITY,
         question_id INT PATH '$'
       )
     ) AS jt
     JOIN QuestionBank q ON q.id = jt.question_id
     JOIN Lessons l ON l.id = q.lesson_id
     JOIN Chapters c ON c.id = l.chapter_id`
  );
  console.log(`+ Đã backfill ${asNumber(result.affectedRows)} snapshot câu hỏi mới`);

  await db.query(
    `UPDATE PracticeSessionQuestions psq
     LEFT JOIN (
       SELECT practice_session_id, question_id, COUNT(*) AS hint_count
       FROM PracticeSessionChats
       WHERE role = 'ai' AND question_id IS NOT NULL
       GROUP BY practice_session_id, question_id
     ) AS chat_usage
       ON chat_usage.practice_session_id = psq.practice_session_id
      AND chat_usage.question_id = psq.question_id
     SET psq.ai_hint_count = COALESCE(chat_usage.hint_count, 0)`
  );
  await db.query(
    `UPDATE PracticeSessions ps
     LEFT JOIN (
       SELECT practice_session_id, COUNT(*) AS hint_count
       FROM PracticeSessionChats
       WHERE role = 'ai'
       GROUP BY practice_session_id
     ) AS chat_usage ON chat_usage.practice_session_id = ps.id
     SET ps.ai_hint_count = COALESCE(chat_usage.hint_count, 0)`
  );
  await db.query(
    `INSERT INTO AIUsageDaily (student_id, usage_date, request_count)
     SELECT student_id, DATE(created_at), COUNT(*)
     FROM AIConversationLogs
     WHERE blocked_reason IS NULL
     GROUP BY student_id, DATE(created_at)
     ON DUPLICATE KEY UPDATE
       request_count = GREATEST(request_count, VALUES(request_count))`
  );
  console.log('+ Đã đồng bộ bộ đếm AI từ lịch sử chat và log hiện có');
}

// Hàm reconcileSessions dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function reconcileSessions() {
  const results = await db.transaction(async (connection) => {
    // Temporary tables are connection-scoped, so every statement in this block must use
    // the same transaction connection instead of the pool-level db.query helper.
    await connection.execute(
      `CREATE TEMPORARY TABLE IF NOT EXISTS tmp_missing_practice_sessions (
         id BIGINT PRIMARY KEY
       ) ENGINE=InnoDB`
    );
    await connection.execute('DELETE FROM tmp_missing_practice_sessions');
    await connection.execute(
      `INSERT IGNORE INTO tmp_missing_practice_sessions (id)
       SELECT ps.id
       FROM PracticeSessions ps
       JOIN JSON_TABLE(
         ps.question_ids,
         '$[*]' COLUMNS(question_id INT PATH '$')
       ) AS jt
       LEFT JOIN QuestionBank q ON q.id = jt.question_id
       WHERE q.id IS NULL`
    );
    const [missing] = await connection.execute(
      `UPDATE PracticeSessions ps
       JOIN tmp_missing_practice_sessions missing_session
         ON missing_session.id = ps.id
       SET
         ps.status = 'COMPLETED',
         ps.completion_reason = ?,
         ps.active_key = NULL,
         ps.completed_at = COALESCE(ps.completed_at, CURRENT_TIMESTAMP)`,
      [COMPLETION_REASONS.MISSING_QUESTION]
    );

    const [expired] = await connection.execute(
      `UPDATE PracticeSessions
       SET
         status = 'COMPLETED',
         completion_reason = COALESCE(completion_reason, ?),
         active_key = NULL,
         completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP)
       WHERE status = 'IN_PROGRESS'
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
      [COMPLETION_REASONS.EXPIRED]
    );

    await connection.execute(
      `CREATE TEMPORARY TABLE IF NOT EXISTS tmp_duplicate_practice_sessions (
         id BIGINT PRIMARY KEY
       ) ENGINE=InnoDB`
    );
    await connection.execute('DELETE FROM tmp_duplicate_practice_sessions');
    await connection.execute(
      `INSERT INTO tmp_duplicate_practice_sessions (id)
       SELECT ranked.id
       FROM (
         SELECT
           ps.id,
           ROW_NUMBER() OVER (
             PARTITION BY
               ps.student_id,
               ps.session_mode,
               COALESCE(ps.lesson_id, 0),
               COALESCE(ps.chapter_id, 0),
               COALESCE(ps.scope_semester, 0)
             ORDER BY
               COALESCE(answer_stats.answered_count, 0) DESC,
               ps.started_at DESC,
               ps.id DESC
           ) AS row_number_in_scope
         FROM PracticeSessions ps
         LEFT JOIN (
           SELECT practice_session_id, COUNT(DISTINCT question_id) AS answered_count
           FROM StudentLogs
           WHERE practice_session_id IS NOT NULL
           GROUP BY practice_session_id
         ) AS answer_stats ON answer_stats.practice_session_id = ps.id
         WHERE ps.status = 'IN_PROGRESS'
       ) AS ranked
       WHERE ranked.row_number_in_scope > 1`
    );
    const [duplicate] = await connection.execute(
      `UPDATE PracticeSessions ps
       JOIN tmp_duplicate_practice_sessions duplicate_session
         ON duplicate_session.id = ps.id
       SET
         ps.status = 'COMPLETED',
         ps.completion_reason = ?,
         ps.active_key = NULL,
         ps.completed_at = COALESCE(ps.completed_at, CURRENT_TIMESTAMP)`,
      [COMPLETION_REASONS.DUPLICATE]
    );

    const [progress] = await connection.execute(
      `UPDATE PracticeSessions ps
       LEFT JOIN (
         SELECT practice_session_id, COUNT(DISTINCT question_id) AS answered_count
         FROM StudentLogs
         WHERE practice_session_id IS NOT NULL
         GROUP BY practice_session_id
       ) AS answer_stats ON answer_stats.practice_session_id = ps.id
       SET ps.current_index = COALESCE(answer_stats.answered_count, 0)
       WHERE ps.current_index <> COALESCE(answer_stats.answered_count, 0)`
    );

    const [activeKeys] = await connection.execute(
      `UPDATE PracticeSessions
       SET active_key = CONCAT(
         student_id, ':',
         UPPER(TRIM(session_mode)), ':',
         COALESCE(lesson_id, 0), ':',
         COALESCE(chapter_id, 0), ':',
         COALESCE(scope_semester, 0)
       )
       WHERE status = 'IN_PROGRESS'
         AND (
           active_key IS NULL
           OR active_key <> CONCAT(
             student_id, ':',
             UPPER(TRIM(session_mode)), ':',
             COALESCE(lesson_id, 0), ':',
             COALESCE(chapter_id, 0), ':',
             COALESCE(scope_semester, 0)
           )
         )`
    );
    await connection.execute(
      `UPDATE PracticeSessions
       SET active_key = NULL
       WHERE status <> 'IN_PROGRESS' AND active_key IS NOT NULL`
    );

    await connection.execute('DROP TEMPORARY TABLE IF EXISTS tmp_missing_practice_sessions');
    await connection.execute('DROP TEMPORARY TABLE IF EXISTS tmp_duplicate_practice_sessions');
    return { missing, expired, duplicate, progress, activeKeys };
  });

  console.log(`+ Đã đánh dấu ${asNumber(results.missing.affectedRows)} phiên mất câu là không thể phục hồi`);
  console.log(`+ Đã kết thúc ${asNumber(results.expired.affectedRows)} phiên hết hạn`);
  console.log(`+ Đã kết thúc ${asNumber(results.duplicate.affectedRows)} phiên hoạt động bị trùng`);
  console.log(`+ Đã đồng bộ current_index cho ${asNumber(results.progress.affectedRows)} phiên`);
  console.log(`+ Đã gán active_key cho ${asNumber(results.activeKeys.affectedRows)} phiên còn hoạt động`);
}

// Hàm getForeignKeyForColumn dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function getForeignKeyForColumn(tableName, columnName, referencedTableName) {
  const rows = await db.query(
    `SELECT
       kcu.CONSTRAINT_NAME,
       rc.DELETE_RULE
     FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
     JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
       ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
      AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
      AND rc.TABLE_NAME = kcu.TABLE_NAME
     WHERE kcu.CONSTRAINT_SCHEMA = DATABASE()
       AND LOWER(kcu.TABLE_NAME) = LOWER(?)
       AND LOWER(kcu.COLUMN_NAME) = LOWER(?)
       AND LOWER(kcu.REFERENCED_TABLE_NAME) = LOWER(?)
     LIMIT 1`,
    [tableName, columnName, referencedTableName]
  );
  return rows[0] || null;
}

// Hàm addSafeConstraints dùng để tạo bản ghi hoặc tài nguyên mới sau khi kiểm tra đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function addSafeConstraints() {
  const report = await getPreflightReport();
  const issues = report.integrity;

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (asNumber(issues.duplicate_answers.extra_rows) === 0) {
    await addIndexIfMissing(
      'StudentLogs',
      'uq_logs_session_question',
      `CREATE UNIQUE INDEX uq_logs_session_question
       ON StudentLogs(practice_session_id, question_id)`
    );
  } else {
    console.warn('! Bỏ qua unique đáp án: vẫn còn bản ghi trả lời trùng.');
  }

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (asNumber(issues.duplicate_misconceptions.extra_rows) === 0) {
    await addIndexIfMissing(
      'CommonMisconceptions',
      'uq_misconceptions_question_distractor',
      `CREATE UNIQUE INDEX uq_misconceptions_question_distractor
       ON CommonMisconceptions(question_id, distractor_key)`
    );
  } else {
    console.warn('! Bỏ qua unique misconception: vẫn còn distractor trùng.');
  }

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (
    asNumber(issues.duplicate_active_sessions.extra_sessions) === 0
  ) {
    await addIndexIfMissing(
      'PracticeSessions',
      'uq_practice_sessions_active_key',
      `CREATE UNIQUE INDEX uq_practice_sessions_active_key
       ON PracticeSessions(active_key)`
    );
  } else {
    console.warn('! Bỏ qua unique active_key: vẫn còn phiên hoạt động hoặc ID câu bị trùng.');
  }

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (
    issues.orphan_session_logs === 0
    && issues.answer_membership_mismatches === 0
  ) {
    const answerMembershipForeignKey = await foreignKeyExistsForColumns(
      'StudentLogs',
      ['practice_session_id', 'question_id'],
      'PracticeSessionQuestions',
      ['practice_session_id', 'question_id']
    );
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!answerMembershipForeignKey) {
      await addConstraintIfMissing(
        'StudentLogs',
        'fk_student_logs_session_question',
        `ALTER TABLE StudentLogs
         ADD CONSTRAINT fk_student_logs_session_question
         FOREIGN KEY (practice_session_id, question_id)
         REFERENCES PracticeSessionQuestions(practice_session_id, question_id)
         ON DELETE RESTRICT`
      );
    }
  } else {
    console.warn('! Bỏ qua FK StudentLogs → phiên/snapshot vì dữ liệu chưa sạch.');
  }

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (issues.chat_membership_mismatches === 0 && issues.chats_without_question === 0) {
    const chatMembershipForeignKey = await foreignKeyExistsForColumns(
      'PracticeSessionChats',
      ['practice_session_id', 'question_id'],
      'PracticeSessionQuestions',
      ['practice_session_id', 'question_id']
    );
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!chatMembershipForeignKey) {
      await addConstraintIfMissing(
        'PracticeSessionChats',
        'fk_practice_chats_session_question',
        `ALTER TABLE PracticeSessionChats
         ADD CONSTRAINT fk_practice_chats_session_question
         FOREIGN KEY (practice_session_id, question_id)
         REFERENCES PracticeSessionQuestions(practice_session_id, question_id)
         ON DELETE CASCADE`
      );
    }
    const existingChatQuestionForeignKey = await getForeignKeyForColumn(
      'PracticeSessionChats',
      'question_id',
      'QuestionBank'
    );
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (existingChatQuestionForeignKey) {
      await db.query(
        `ALTER TABLE PracticeSessionChats
         DROP FOREIGN KEY ${quoteIdentifier(existingChatQuestionForeignKey.CONSTRAINT_NAME)}`
      );
      console.log(`- Đã bỏ FK trực tiếp ${existingChatQuestionForeignKey.CONSTRAINT_NAME} của chat`);
    }
    const chatQuestionColumn = await db.query(
      `SELECT IS_NULLABLE
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND LOWER(TABLE_NAME) = 'practicesessionchats'
         AND LOWER(COLUMN_NAME) = 'question_id'
       LIMIT 1`
    );
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (String(chatQuestionColumn[0]?.IS_NULLABLE || '').toUpperCase() === 'YES') {
      await db.query(
        `ALTER TABLE PracticeSessionChats
         MODIFY COLUMN question_id INT NOT NULL`
      );
      console.log('+ Đã chuyển PracticeSessionChats.question_id thành NOT NULL');
    }
  } else {
    console.warn('! Bỏ qua FK chat → snapshot vì còn chat thiếu câu hoặc không thuộc phiên.');
  }

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (issues.orphan_question_logs === 0) {
    const existingQuestionForeignKey = await getForeignKeyForColumn(
      'StudentLogs',
      'question_id',
      'QuestionBank'
    );
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (
      existingQuestionForeignKey
      && String(existingQuestionForeignKey.DELETE_RULE).toUpperCase() === 'CASCADE'
    ) {
      await db.query(
        `ALTER TABLE StudentLogs
         DROP FOREIGN KEY ${quoteIdentifier(existingQuestionForeignKey.CONSTRAINT_NAME)}`
      );
      console.log(`- Đã bỏ FK cascade ${existingQuestionForeignKey.CONSTRAINT_NAME}`);
    }
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (
      !existingQuestionForeignKey
      || String(existingQuestionForeignKey.DELETE_RULE).toUpperCase() === 'CASCADE'
    ) {
      await addConstraintIfMissing(
        'StudentLogs',
        'fk_student_logs_question_restrict',
        `ALTER TABLE StudentLogs
         ADD CONSTRAINT fk_student_logs_question_restrict
         FOREIGN KEY (question_id)
         REFERENCES QuestionBank(id)
         ON DELETE RESTRICT`
      );
    }
  } else {
    console.warn('! Bỏ qua đổi FK QuestionBank sang RESTRICT vì còn log mất câu nguồn.');
  }
}

// Hàm applyMigration dùng để cập nhật trạng thái hoặc dữ liệu theo quy tắc nghiệp vụ; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function applyMigration(initialPreflight) {
  const backupPath = await backupAffectedData(initialPreflight);
  console.log('Bắt đầu mở rộng schema...');
  await expandSchema();
  await backfillQuestionSnapshots();
  await reconcileSessions();
  await addSafeConstraints();
  return backupPath;
}

// Hàm main dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function main() {
  const args = parseArgs(process.argv.slice(2));
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (args.help) {
    printHelp();
    return;
  }

  const connection = await db.testConnection();
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!connection.connected) {
    throw new Error(`Không kết nối được database: ${connection.reason || 'unknown'}`);
  }

  const initialPreflight = await getPreflightReport();
  console.log(JSON.stringify(initialPreflight, null, 2));

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!args.apply) {
    console.log('\nPreflight hoàn tất. Database không bị thay đổi.');
    console.log(`Dùng "node scripts/apply_session_integrity.js ${APPLY_FLAG}" để áp dụng.`);
    return;
  }

  const backupPath = await applyMigration(initialPreflight);
  const finalPreflight = await getPreflightReport();
  finalPreflight.mode = 'post-apply';
  console.log(JSON.stringify(finalPreflight, null, 2));
  console.log(`\nMigration hoàn tất. Backup trước migration: ${backupPath}`);
}

main()
  .catch((error) => {
    console.error('Migration session integrity thất bại:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.close();
  });
