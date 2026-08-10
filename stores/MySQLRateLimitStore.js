// Bộ lưu trữ my sqlrate limit store kết nối trạng thái phiên hoặc giới hạn truy cập với cơ sở dữ liệu.
const crypto = require('crypto');
const db = require('../config/db');

const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

// Lớp MySQLRateLimitStore đóng gói trạng thái và các hành vi liên quan thành một đơn vị có thể tái sử dụng.
class MySQLRateLimitStore {
  // Hàm constructor dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  constructor(namespace) {
    this.namespace = String(namespace || 'default').slice(0, 32);
    this.prefix = `mysql:${this.namespace}:`;
    this.localKeys = false;
    this.windowMs = 60_000;
    this.schemaCheckPromise = null;
    this.cleanupTimer = null;
  }

  // Hàm init dùng để khởi tạo trạng thái và các phụ thuộc cần thiết; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  init(options) {
    this.windowMs = Math.max(Number(options?.windowMs) || 60_000, 1000);
  }

  // Hàm ensureReady dùng để kiểm tra tính hợp lệ và các điều kiện an toàn; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  async ensureReady() {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!this.schemaCheckPromise) {
      this.schemaCheckPromise = this.verifySchema();
    }
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    try {
      await this.schemaCheckPromise;
      await this.prune();
      this.startCleanupTimer();
    } catch (error) {
      this.schemaCheckPromise = null;
      throw error;
    }
  }

  // Hàm verifySchema dùng để đối chiếu kết quả với các điều kiện mong đợi và báo cáo sai lệch; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  async verifySchema() {
    const rows = await db.query(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'RequestRateLimits'`
    );
    const columns = new Set(rows.map((row) => String(row.COLUMN_NAME).toLowerCase()));
    const missing = ['namespace', 'key_hash', 'hits', 'reset_at']
      .filter((column) => !columns.has(column));
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (missing.length > 0) {
      const error = new Error(
        `Database thiếu bảng RequestRateLimits (${missing.join(', ')}). `
        + 'Chạy npm run db:runtime-storage -- --apply trước khi khởi động.'
      );
      error.code = 'SCHEMA_MIGRATION_REQUIRED';
      throw error;
    }
  }

  // Hàm increment dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
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

  // Hàm decrement dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  async decrement(key) {
    await db.query(
      `UPDATE RequestRateLimits
       SET hits = GREATEST(hits - 1, 0)
       WHERE namespace = ? AND key_hash = ?`,
      [this.namespace, hashKey(key)]
    );
  }

  // Hàm resetKey dùng để cập nhật trạng thái hoặc dữ liệu theo quy tắc nghiệp vụ; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  async resetKey(key) {
    await db.query(
      'DELETE FROM RequestRateLimits WHERE namespace = ? AND key_hash = ?',
      [this.namespace, hashKey(key)]
    );
  }

  // Hàm resetAll dùng để cập nhật trạng thái hoặc dữ liệu theo quy tắc nghiệp vụ; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  async resetAll() {
    await db.query('DELETE FROM RequestRateLimits WHERE namespace = ?', [this.namespace]);
  }

  // Hàm prune dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  async prune() {
    await db.query('DELETE FROM RequestRateLimits WHERE reset_at <= CURRENT_TIMESTAMP(3)');
  }

  // Hàm startCleanupTimer dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  startCleanupTimer() {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => {
      this.prune().catch(() => {});
    }, CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref?.();
  }

  // Hàm shutdown dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  shutdown() {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
  }
}

// Hàm hashKey dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function hashKey(key) {
  return crypto.createHash('sha256').update(String(key || '')).digest('hex');
}

module.exports = {
  CLEANUP_INTERVAL_MS,
  MySQLRateLimitStore,
  hashKey
};
