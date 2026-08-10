// Migration 20260807 remove unapproved question supplements c?p nh?t c?u tr?c ho?c d? li?u c? s? d? li?u theo c?ch c? th? ki?m tra v? l?p l?i.
/* eslint-disable no-console */
require('dotenv').config({ quiet: true });

const db = require('../config/db');

const APPLY_FLAG = '--apply';
const CONFIRM_PREFIX = '--confirm-db=';
const SOURCE_PATTERN = 'SUP-20260807-%';

// H?m parseArguments d?ng ?? ph?n t?ch ??u v?o th?nh c?u tr?c c? th? s? d?ng; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function parseArguments(argv) {
  const unknown = argv.filter((value) => value !== APPLY_FLAG && !value.startsWith(CONFIRM_PREFIX));
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (unknown.length) throw new Error(`Tham số không hợp lệ: ${unknown.join(', ')}`);
  return {
    apply: argv.includes(APPLY_FLAG),
    confirmDatabase: argv.find((value) => value.startsWith(CONFIRM_PREFIX))?.slice(CONFIRM_PREFIX.length) || ''
  };
}

// H?m execute d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function execute(executor, sql, params = []) {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (executor === db) return db.query(sql, params);
  const [rows] = await executor.execute(sql, params);
  return rows;
}

// H?m countAffected d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function countAffected(executor = db) {
  const rows = await execute(executor,
    `WITH supplemental AS (
       SELECT id
       FROM QuestionBank
       WHERE JSON_UNQUOTE(JSON_EXTRACT(content, '$.source_key')) LIKE ?
     )
     SELECT
       (SELECT COUNT(*) FROM supplemental) AS questions,
       (SELECT COUNT(*) FROM CommonMisconceptions m JOIN supplemental s ON s.id = m.question_id) AS misconceptions,
       (SELECT COUNT(*) FROM PracticeSessionQuestions p JOIN supplemental s ON s.id = p.question_id) AS session_questions,
       (SELECT COUNT(*) FROM StudentLogs l JOIN supplemental s ON s.id = l.question_id) AS student_logs,
       (SELECT COUNT(*) FROM PracticeSessionChats c JOIN supplemental s ON s.id = c.question_id) AS chats,
       (SELECT COUNT(*) FROM AIConversationLogs a JOIN supplemental s ON s.id = a.question_id) AS ai_logs`,
    [SOURCE_PATTERN]
  );
  return Object.fromEntries(Object.entries(rows[0]).map(([key, value]) => [key, Number(value)]));
}

// H?m hasUsage d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function hasUsage(counts) {
  return counts.session_questions > 0 || counts.student_logs > 0 || counts.chats > 0 || counts.ai_logs > 0;
}

// H?m main d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function main() {
  const options = parseArguments(process.argv.slice(2));
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    const connectionState = await db.testConnection();
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!connectionState.connected) throw new Error(`Không kết nối được database: ${connectionState.reason}`);
    const [databaseRow] = await db.query('SELECT DATABASE() AS database_name');
    const databaseName = String(databaseRow.database_name || '');
    const before = await countAffected(db);

    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!options.apply) {
      console.log(JSON.stringify({ readOnly: true, database: databaseName, sourcePattern: SOURCE_PATTERN, affected: before }, null, 2));
      return;
    }
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!databaseName || options.confirmDatabase !== databaseName) {
      throw new Error(`Để xóa dữ liệu, cần truyền ${CONFIRM_PREFIX}${databaseName}`);
    }
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (hasUsage(before)) {
      throw new Error('Lô câu hỏi đã phát sinh dữ liệu học tập; từ chối xóa tự động để bảo vệ lịch sử học sinh.');
    }

    const result = await db.transaction(async (connection) => {
      const locked = await execute(
        connection,
        `SELECT id
         FROM QuestionBank
         WHERE JSON_UNQUOTE(JSON_EXTRACT(content, '$.source_key')) LIKE ?
         FOR UPDATE`,
        [SOURCE_PATTERN]
      );
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (locked.length !== before.questions) throw new Error('Số câu thay đổi trong lúc khóa dữ liệu; đã hủy thao tác.');
      const [deletion] = await connection.execute(
        `DELETE FROM QuestionBank
         WHERE JSON_UNQUOTE(JSON_EXTRACT(content, '$.source_key')) LIKE ?`,
        [SOURCE_PATTERN]
      );
      const after = await countAffected(connection);
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (after.questions !== 0 || after.misconceptions !== 0) {
        throw new Error('Vẫn còn dữ liệu bổ sung sau khi xóa; đã rollback transaction.');
      }
      return { deletedQuestions: Number(deletion.affectedRows), after };
    });
    console.log(JSON.stringify({ readOnly: false, database: databaseName, before, ...result }, null, 2));
  } finally {
    await db.close();
  }
}

// Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { SOURCE_PATTERN, countAffected, hasUsage, parseArguments };
