// Script report difficulty calibration h? tr? nh?p, xu?t, ki?m tra ho?c b?o tr? d? li?u v? c?u h?nh c?a d? ?n.
/* eslint-disable no-console */
require('dotenv').config({ quiet: true });

const db = require('../config/db');
const {
  MIN_CALIBRATION_ATTEMPTS,
  buildDifficultyWarning
} = require('../utils/difficultyCalibration');

// H?m buildReport d?ng ?? x?y d?ng k?t qu? t? c?c ngu?n d? li?u v? quy t?c li?n quan; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function buildReport() {
  const rows = await db.query(
    `SELECT
        q.id AS question_id,
        q.lesson_id,
        q.difficulty,
        COUNT(sl.id) AS attempt_count,
        AVG(sl.is_correct) AS actual_accuracy
     FROM QuestionBank q
     JOIN StudentLogs sl ON sl.question_id = q.id
     GROUP BY q.id, q.lesson_id, q.difficulty
     HAVING COUNT(sl.id) >= ?
     ORDER BY COUNT(sl.id) DESC, q.id`,
    [MIN_CALIBRATION_ATTEMPTS]
  );
  return {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    minimumAttempts: MIN_CALIBRATION_ATTEMPTS,
    eligibleQuestions: rows.length,
    warnings: rows.map((row) => buildDifficultyWarning(row)).filter(Boolean)
  };
}

// H?m main d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function main() {
  const connection = await db.testConnection();
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!connection.connected) throw new Error(`Không kết nối được database: ${connection.reason}`);
  console.log(JSON.stringify(await buildReport(), null, 2));
}

// Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
if (require.main === module) {
  main()
    .catch((error) => {
      console.error(`Báo cáo hiệu chỉnh độ khó thất bại: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(() => db.close());
}

module.exports = { buildReport };
