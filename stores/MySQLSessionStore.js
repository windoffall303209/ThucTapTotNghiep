// B? l?u tr? my sqlsession store k?t n?i tr?ng th?i phi?n ho?c gi?i h?n truy c?p v?i c? s? d? li?u.
const session = require('express-session');
const db = require('../config/db');

const DEFAULT_TTL_MS = 8 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

// L?p MySQLSessionStore ??ng g?i tr?ng th?i v? c?c h?nh vi li?n quan th?nh m?t ??n v? c? th? t?i s? d?ng.
class MySQLSessionStore extends session.Store {
  // H?m constructor d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  constructor({ ttlMs = DEFAULT_TTL_MS } = {}) {
    super();
    this.ttlMs = Number.isFinite(Number(ttlMs)) && Number(ttlMs) > 0
      ? Number(ttlMs)
      : DEFAULT_TTL_MS;
    this.schemaCheckPromise = null;
    this.cleanupTimer = null;
  }

  // H?m ensureReady d?ng ?? ki?m tra t?nh h?p l? v? c?c ?i?u ki?n an to?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  async ensureReady() {
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!this.schemaCheckPromise) {
      this.schemaCheckPromise = this.verifySchema();
    }
    // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
    try {
      await this.schemaCheckPromise;
      await this.prune();
      this.startCleanupTimer();
    } catch (error) {
      this.schemaCheckPromise = null;
      throw error;
    }
  }

  // H?m verifySchema d?ng ?? ??i chi?u k?t qu? v?i c?c ?i?u ki?n mong ??i v? b?o c?o sai l?ch; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  async verifySchema() {
    const rows = await db.query(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'AppSessions'`
    );
    const columns = new Set(rows.map((row) => String(row.COLUMN_NAME).toLowerCase()));
    const missing = ['session_id', 'session_data', 'expires_at']
      .filter((column) => !columns.has(column));
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (missing.length > 0) {
      const error = new Error(
        `Database thiếu bảng lưu phiên AppSessions (${missing.join(', ')}). `
        + 'Chạy npm run db:runtime-storage -- --apply trước khi khởi động.'
      );
      error.code = 'SCHEMA_MIGRATION_REQUIRED';
      throw error;
    }
  }

  // H?m get d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  get(sessionId, callback) {
    this.run(callback, async () => {
      const rows = await db.query(
        `SELECT session_data
         FROM AppSessions
         WHERE session_id = ? AND expires_at > CURRENT_TIMESTAMP(3)
         LIMIT 1`,
        [sessionId]
      );
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (!rows[0]) return null;
      return parseSessionData(rows[0].session_data);
    });
  }

  // H?m set d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
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

  // H?m touch d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
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

  // H?m destroy d?ng ?? x?a ho?c gi?i ph?ng t?i nguy?n theo ?i?u ki?n an to?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  destroy(sessionId, callback) {
    this.run(callback, async () => {
      await db.query('DELETE FROM AppSessions WHERE session_id = ?', [sessionId]);
    });
  }

  // H?m clear d?ng ?? x?a ho?c gi?i ph?ng t?i nguy?n theo ?i?u ki?n an to?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  clear(callback) {
    this.run(callback, async () => {
      await db.query('DELETE FROM AppSessions');
    });
  }

  // H?m length d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  length(callback) {
    this.run(callback, async () => {
      const rows = await db.query(
        'SELECT COUNT(*) AS total FROM AppSessions WHERE expires_at > CURRENT_TIMESTAMP(3)'
      );
      return Number(rows[0]?.total || 0);
    });
  }

  // H?m prune d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  async prune() {
    await db.query('DELETE FROM AppSessions WHERE expires_at <= CURRENT_TIMESTAMP(3)');
  }

  // H?m startCleanupTimer d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  startCleanupTimer() {
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => {
      this.prune().catch((error) => this.emit('disconnect', error));
    }, CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref?.();
  }

  // H?m shutdown d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  shutdown() {
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
  }

  // H?m run d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  run(callback, operation) {
    const done = typeof callback === 'function' ? callback : () => {};
    Promise.resolve()
      .then(operation)
      .then((result) => done(null, result))
      .catch((error) => done(error));
  }
}

// H?m getSessionExpiry d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function getSessionExpiry(sessionData, ttlMs = DEFAULT_TTL_MS) {
  const configuredExpiry = sessionData?.cookie?.expires
    ? new Date(sessionData.cookie.expires)
    : null;
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (configuredExpiry && Number.isFinite(configuredExpiry.getTime())) {
    return configuredExpiry;
  }
  return new Date(Date.now() + ttlMs);
}

// H?m parseSessionData d?ng ?? ph?n t?ch ??u v?o th?nh c?u tr?c c? th? s? d?ng; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function parseSessionData(value) {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!value) return null;
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (typeof value === 'object') return value;
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
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
