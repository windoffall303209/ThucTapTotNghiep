require('dotenv').config();

const db = require('../config/db');
const SystemSetting = require('../models/SystemSetting');

async function columnExists(table, column) {
  const rows = await db.query(
    `SELECT COUNT(*) AS count
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?`,
    [table, column]
  );
  return Number(rows[0]?.count || 0) > 0;
}

async function indexExists(table, index) {
  const rows = await db.query(
    `SELECT COUNT(*) AS count
       FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND INDEX_NAME = ?`,
    [table, index]
  );
  return Number(rows[0]?.count || 0) > 0;
}

async function main() {
  const connection = await db.testConnection();
  if (!connection.connected) {
    throw new Error(`Không kết nối được MySQL: ${connection.reason || 'missing_config'}`);
  }

  await db.query(
    `CREATE TABLE IF NOT EXISTS SystemSettings (
      setting_key VARCHAR(100) PRIMARY KEY,
      setting_value TEXT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  for (const [count, defaultMinutes] of Object.entries(SystemSetting.PRACTICE_DURATION_DEFAULTS)) {
    await db.query(
      `INSERT IGNORE INTO SystemSettings (setting_key, setting_value)
       VALUES (?, ?)`,
      [SystemSetting.PRACTICE_DURATION_SETTING_KEYS[count], String(defaultMinutes)]
    );
  }

  if (!(await columnExists('PracticeSessions', 'duration_seconds'))) {
    await db.query(
      'ALTER TABLE PracticeSessions ADD COLUMN duration_seconds INT NULL AFTER question_count'
    );
  }
  if (!(await columnExists('PracticeSessions', 'expires_at'))) {
    await db.query(
      'ALTER TABLE PracticeSessions ADD COLUMN expires_at TIMESTAMP NULL AFTER started_at'
    );
  }

  const settings = await SystemSetting.getSettings();
  const seconds5 = SystemSetting.getPracticeDurationSeconds(5, settings);
  const seconds15 = SystemSetting.getPracticeDurationSeconds(15, settings);
  const seconds20 = SystemSetting.getPracticeDurationSeconds(20, settings);

  const durationCase = `
    CASE question_count
      WHEN 5 THEN ?
      WHEN 15 THEN ?
      WHEN 20 THEN ?
      ELSE NULL
    END`;
  const params = [seconds5, seconds15, seconds20];

  const result = await db.query(
    `UPDATE PracticeSessions
        SET duration_seconds = COALESCE(duration_seconds, ${durationCase}),
            expires_at = COALESCE(
              expires_at,
              TIMESTAMPADD(
                SECOND,
                COALESCE(duration_seconds, ${durationCase}),
                started_at
              )
            )
      WHERE session_mode IN ('LESSON', 'CHAPTER', 'COMPREHENSIVE')
        AND question_count IN (5, 15, 20)
        AND (duration_seconds IS NULL OR expires_at IS NULL)`,
    [...params, ...params]
  );

  if (!(await indexExists('PracticeSessions', 'idx_practice_sessions_expiry'))) {
    await db.query(
      'CREATE INDEX idx_practice_sessions_expiry ON PracticeSessions(student_id, status, expires_at)'
    );
  }

  console.log(JSON.stringify({
    durationMinutes: {
      5: seconds5 / 60,
      15: seconds15 / 60,
      20: seconds20 / 60
    },
    migratedSessions: Number(result.affectedRows || 0),
    columns: ['duration_seconds', 'expires_at'],
    index: 'idx_practice_sessions_expiry'
  }, null, 2));
}

main()
  .then(() => db.close())
  .catch(async (error) => {
    console.error('Lỗi cập nhật thời gian phiên luyện tập:', error.message);
    await db.close();
    process.exitCode = 1;
  });
