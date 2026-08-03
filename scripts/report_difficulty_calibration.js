/* eslint-disable no-console */
require('dotenv').config({ quiet: true });

const db = require('../config/db');
const {
  MIN_CALIBRATION_ATTEMPTS,
  buildDifficultyWarning
} = require('../utils/difficultyCalibration');

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

async function main() {
  const connection = await db.testConnection();
  if (!connection.connected) throw new Error(`Không kết nối được database: ${connection.reason}`);
  console.log(JSON.stringify(await buildReport(), null, 2));
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(`Báo cáo hiệu chỉnh độ khó thất bại: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(() => db.close());
}

module.exports = { buildReport };
