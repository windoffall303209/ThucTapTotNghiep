// Bộ lưu trữ my sqlsession store kết nối trạng thái phiên hoặc giới hạn truy cập với cơ sở dữ liệu.
const session = require('express-session');
const db = require('../config/db');

const DEFAULT_TTL_MS = 8 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

// Lớp MySQLSessionStore đóng gói trạng thái và các hành vi liên quan thành một đơn vị có thể tái sử dụng.
class MySQLSessionStore extends session.Store {
  // Hàm constructor dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  constructor({ ttlMs = DEFAULT_TTL_MS } = {}) {
    super();
    this.ttlMs = Number.isFinite(Number(ttlMs)) && Number(ttlMs) > 0
      ? Number(ttlMs)
      : DEFAULT_TTL_MS;
    this.schemaCheckPromise = null;
    this.cleanupTimer = null;
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
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'AppSessions'`
    );
    const columns = new Set(rows.map((row) => String(row.COLUMN_NAME).toLowerCase()));
    const missing = ['session_id', 'session_data', 'expires_at']
      .filter((column) => !columns.has(column));
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (missing.length > 0) {
      const error = new Error(
        `Database thiếu bảng lưu phiên AppSessions (${missing.join(', ')}). `
        + 'Chạy npm run db:runtime-storage -- --apply trước khi khởi động.'
      );
      error.code = 'SCHEMA_MIGRATION_REQUIRED';
      throw error;
    }
  }

  // Hàm get dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  get(sessionId, callback) {
    this.run(callback, async () => {
      const rows = await db.query(
        `SELECT session_data
         FROM AppSessions
         WHERE session_id = ? AND expires_at > CURRENT_TIMESTAMP(3)
         LIMIT 1`,
        [sessionId]
      );
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (!rows[0]) return null;
      return parseSessionData(rows[0].session_data);
    });
  }

  // Hàm set dùng để cập nhật trạng thái hoặc dữ liệu theo quy tắc nghiệp vụ; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
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

  // Hàm touch dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
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

  // Hàm destroy dùng để xóa hoặc giải phóng tài nguyên theo điều kiện an toàn; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  destroy(sessionId, callback) {
    this.run(callback, async () => {
      await db.query('DELETE FROM AppSessions WHERE session_id = ?', [sessionId]);
    });
  }

  // Hàm clear dùng để xóa hoặc giải phóng tài nguyên theo điều kiện an toàn; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  clear(callback) {
    this.run(callback, async () => {
      await db.query('DELETE FROM AppSessions');
    });
  }

  // Hàm length dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  length(callback) {
    this.run(callback, async () => {
      const rows = await db.query(
        'SELECT COUNT(*) AS total FROM AppSessions WHERE expires_at > CURRENT_TIMESTAMP(3)'
      );
      return Number(rows[0]?.total || 0);
    });
  }

  // Hàm prune dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  async prune() {
    await db.query('DELETE FROM AppSessions WHERE expires_at <= CURRENT_TIMESTAMP(3)');
  }

  // Hàm startCleanupTimer dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  startCleanupTimer() {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => {
      this.prune().catch((error) => this.emit('disconnect', error));
    }, CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref?.();
  }

  // Hàm shutdown dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  shutdown() {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
  }

  // Hàm run dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
  run(callback, operation) {
    const done = typeof callback === 'function' ? callback : () => {};
    Promise.resolve()
      .then(operation)
      .then((result) => done(null, result))
      .catch((error) => done(error));
  }
}

// Hàm getSessionExpiry dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function getSessionExpiry(sessionData, ttlMs = DEFAULT_TTL_MS) {
  const configuredExpiry = sessionData?.cookie?.expires
    ? new Date(sessionData.cookie.expires)
    : null;
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (configuredExpiry && Number.isFinite(configuredExpiry.getTime())) {
    return configuredExpiry;
  }
  return new Date(Date.now() + ttlMs);
}

// Hàm parseSessionData dùng để phân tích đầu vào thành cấu trúc có thể sử dụng; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function parseSessionData(value) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!value) return null;
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (typeof value === 'object') return value;
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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
