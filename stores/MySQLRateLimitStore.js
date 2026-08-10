// B? l?u tr? my sqlrate limit store k?t n?i tr?ng th?i phi?n ho?c gi?i h?n truy c?p v?i c? s? d? li?u.
const crypto = require('crypto');
const db = require('../config/db');

const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

// L?p MySQLRateLimitStore ??ng g?i tr?ng th?i v? c?c h?nh vi li?n quan th?nh m?t ??n v? c? th? t?i s? d?ng.
class MySQLRateLimitStore {
  // H?m constructor d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  constructor(namespace) {
    this.namespace = String(namespace || 'default').slice(0, 32);
    this.prefix = `mysql:${this.namespace}:`;
    this.localKeys = false;
    this.windowMs = 60_000;
    this.schemaCheckPromise = null;
    this.cleanupTimer = null;
  }

  // H?m init d?ng ?? kh?i t?o tr?ng th?i v? c?c ph? thu?c c?n thi?t; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  init(options) {
    this.windowMs = Math.max(Number(options?.windowMs) || 60_000, 1000);
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
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'RequestRateLimits'`
    );
    const columns = new Set(rows.map((row) => String(row.COLUMN_NAME).toLowerCase()));
    const missing = ['namespace', 'key_hash', 'hits', 'reset_at']
      .filter((column) => !columns.has(column));
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (missing.length > 0) {
      const error = new Error(
        `Database thiếu bảng RequestRateLimits (${missing.join(', ')}). `
        + 'Chạy npm run db:runtime-storage -- --apply trước khi khởi động.'
      );
      error.code = 'SCHEMA_MIGRATION_REQUIRED';
      throw error;
    }
  }

  // H?m increment d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  async increment(key) {
    const keyHash = hashKey(key);
    const windowMicroseconds = Math.round(this.windowMs * 1000);
    return db.transaction(async (connection) => {
      await connection.execute(
        `INSERT INTO RequestRateLimits
           (namespace, key_hash, hits, reset_at)
         VALUES (
           ?, ?, 1,
           DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL ? MICROSECOND)
         )
         ON DUPLICATE KEY UPDATE
           hits = IF(reset_at <= CURRENT_TIMESTAMP(3), 1, hits + 1),
           reset_at = IF(
             reset_at <= CURRENT_TIMESTAMP(3),
             DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL ? MICROSECOND),
             reset_at
           )`,
        [this.namespace, keyHash, windowMicroseconds, windowMicroseconds]
      );
      const [rows] = await connection.execute(
        `SELECT hits, reset_at
         FROM RequestRateLimits
         WHERE namespace = ? AND key_hash = ?
         LIMIT 1
         FOR UPDATE`,
        [this.namespace, keyHash]
      );
      return {
        totalHits: Number(rows[0]?.hits || 1),
        resetTime: new Date(rows[0]?.reset_at || Date.now() + this.windowMs)
      };
    });
  }

  // H?m decrement d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  async decrement(key) {
    await db.query(
      `UPDATE RequestRateLimits
       SET hits = GREATEST(hits - 1, 0)
       WHERE namespace = ? AND key_hash = ?`,
      [this.namespace, hashKey(key)]
    );
  }

  // H?m resetKey d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  async resetKey(key) {
    await db.query(
      'DELETE FROM RequestRateLimits WHERE namespace = ? AND key_hash = ?',
      [this.namespace, hashKey(key)]
    );
  }

  // H?m resetAll d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  async resetAll() {
    await db.query('DELETE FROM RequestRateLimits WHERE namespace = ?', [this.namespace]);
  }

  // H?m prune d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  async prune() {
    await db.query('DELETE FROM RequestRateLimits WHERE reset_at <= CURRENT_TIMESTAMP(3)');
  }

  // H?m startCleanupTimer d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  startCleanupTimer() {
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => {
      this.prune().catch(() => {});
    }, CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref?.();
  }

  // H?m shutdown d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
  shutdown() {
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
  }
}

// H?m hashKey d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function hashKey(key) {
  return crypto.createHash('sha256').update(String(key || '')).digest('hex');
}

module.exports = {
  CLEANUP_INTERVAL_MS,
  MySQLRateLimitStore,
  hashKey
};
