const session = require('express-session');
const db = require('../config/db');

const DEFAULT_TTL_MS = 8 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

class MySQLSessionStore extends session.Store {
  constructor({ ttlMs = DEFAULT_TTL_MS } = {}) {
    super();
    this.ttlMs = Number.isFinite(Number(ttlMs)) && Number(ttlMs) > 0
      ? Number(ttlMs)
      : DEFAULT_TTL_MS;
    this.schemaCheckPromise = null;
    this.cleanupTimer = null;
  }

  async ensureReady() {
    if (!this.schemaCheckPromise) {
      this.schemaCheckPromise = this.verifySchema();
    }
    try {
      await this.schemaCheckPromise;
      await this.prune();
      this.startCleanupTimer();
    } catch (error) {
      this.schemaCheckPromise = null;
      throw error;
    }
  }

  async verifySchema() {
    const rows = await db.query(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'AppSessions'`
    );
    const columns = new Set(rows.map((row) => String(row.COLUMN_NAME).toLowerCase()));
    const missing = ['session_id', 'session_data', 'expires_at']
      .filter((column) => !columns.has(column));
    if (missing.length > 0) {
      const error = new Error(
        `Database thiếu bảng lưu phiên AppSessions (${missing.join(', ')}). `
        + 'Chạy npm run db:runtime-storage -- --apply trước khi khởi động.'
      );
      error.code = 'SCHEMA_MIGRATION_REQUIRED';
      throw error;
    }
  }

  get(sessionId, callback) {
    this.run(callback, async () => {
      const rows = await db.query(
        `SELECT session_data
         FROM AppSessions
         WHERE session_id = ? AND expires_at > CURRENT_TIMESTAMP(3)
         LIMIT 1`,
        [sessionId]
      );
      if (!rows[0]) return null;
      return parseSessionData(rows[0].session_data);
    });
  }

  set(sessionId, sessionData, callback) {
    this.run(callback, async () => {
      const expiresAt = getSessionExpiry(sessionData, this.ttlMs);
      await db.query(
        `INSERT INTO AppSessions (session_id, session_data, expires_at)
         VALUES (?, CAST(? AS JSON), ?)
         ON DUPLICATE KEY UPDATE
           session_data = VALUES(session_data),
           expires_at = VALUES(expires_at),
           updated_at = CURRENT_TIMESTAMP(3)`,
        [sessionId, JSON.stringify(sessionData || {}), expiresAt]
      );
    });
  }

  touch(sessionId, sessionData, callback) {
    this.run(callback, async () => {
      await db.query(
        `UPDATE AppSessions
         SET expires_at = ?, updated_at = CURRENT_TIMESTAMP(3)
         WHERE session_id = ?`,
        [getSessionExpiry(sessionData, this.ttlMs), sessionId]
      );
    });
  }

  destroy(sessionId, callback) {
    this.run(callback, async () => {
      await db.query('DELETE FROM AppSessions WHERE session_id = ?', [sessionId]);
    });
  }

  clear(callback) {
    this.run(callback, async () => {
      await db.query('DELETE FROM AppSessions');
    });
  }

  length(callback) {
    this.run(callback, async () => {
      const rows = await db.query(
        'SELECT COUNT(*) AS total FROM AppSessions WHERE expires_at > CURRENT_TIMESTAMP(3)'
      );
      return Number(rows[0]?.total || 0);
    });
  }

  async prune() {
    await db.query('DELETE FROM AppSessions WHERE expires_at <= CURRENT_TIMESTAMP(3)');
  }

  startCleanupTimer() {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => {
      this.prune().catch((error) => this.emit('disconnect', error));
    }, CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref?.();
  }

  shutdown() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
  }

  run(callback, operation) {
    const done = typeof callback === 'function' ? callback : () => {};
    Promise.resolve()
      .then(operation)
      .then((result) => done(null, result))
      .catch((error) => done(error));
  }
}

function getSessionExpiry(sessionData, ttlMs = DEFAULT_TTL_MS) {
  const configuredExpiry = sessionData?.cookie?.expires
    ? new Date(sessionData.cookie.expires)
    : null;
  if (configuredExpiry && Number.isFinite(configuredExpiry.getTime())) {
    return configuredExpiry;
  }
  return new Date(Date.now() + ttlMs);
}

function parseSessionData(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    return null;
  }
}

module.exports = {
  DEFAULT_TTL_MS,
  CLEANUP_INTERVAL_MS,
  MySQLSessionStore,
  getSessionExpiry,
  parseSessionData
};
