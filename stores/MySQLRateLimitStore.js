const crypto = require('crypto');
const db = require('../config/db');

const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

class MySQLRateLimitStore {
  constructor(namespace) {
    this.namespace = String(namespace || 'default').slice(0, 32);
    this.prefix = `mysql:${this.namespace}:`;
    this.localKeys = false;
    this.windowMs = 60_000;
    this.schemaCheckPromise = null;
    this.cleanupTimer = null;
  }

  init(options) {
    this.windowMs = Math.max(Number(options?.windowMs) || 60_000, 1000);
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
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'RequestRateLimits'`
    );
    const columns = new Set(rows.map((row) => String(row.COLUMN_NAME).toLowerCase()));
    const missing = ['namespace', 'key_hash', 'hits', 'reset_at']
      .filter((column) => !columns.has(column));
    if (missing.length > 0) {
      const error = new Error(
        `Database thiếu bảng RequestRateLimits (${missing.join(', ')}). `
        + 'Chạy npm run db:runtime-storage -- --apply trước khi khởi động.'
      );
      error.code = 'SCHEMA_MIGRATION_REQUIRED';
      throw error;
    }
  }

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

  async decrement(key) {
    await db.query(
      `UPDATE RequestRateLimits
       SET hits = GREATEST(hits - 1, 0)
       WHERE namespace = ? AND key_hash = ?`,
      [this.namespace, hashKey(key)]
    );
  }

  async resetKey(key) {
    await db.query(
      'DELETE FROM RequestRateLimits WHERE namespace = ? AND key_hash = ?',
      [this.namespace, hashKey(key)]
    );
  }

  async resetAll() {
    await db.query('DELETE FROM RequestRateLimits WHERE namespace = ?', [this.namespace]);
  }

  async prune() {
    await db.query('DELETE FROM RequestRateLimits WHERE reset_at <= CURRENT_TIMESTAMP(3)');
  }

  startCleanupTimer() {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => {
      this.prune().catch(() => {});
    }, CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref?.();
  }

  shutdown() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
  }
}

function hashKey(key) {
  return crypto.createHash('sha256').update(String(key || '')).digest('hex');
}

module.exports = {
  CLEANUP_INTERVAL_MS,
  MySQLRateLimitStore,
  hashKey
};
