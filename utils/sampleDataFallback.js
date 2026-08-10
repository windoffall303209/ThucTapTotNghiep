// Tiện ích sample data fallback cung cấp các hàm dùng chung cho chuẩn hóa dữ liệu, bảo mật và xử lý lỗi.
const DATABASE_UNAVAILABLE_CODES = new Set([
  'DB_UNAVAILABLE',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'PROTOCOL_CONNECTION_LOST',
  'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR',
  'POOL_CLOSED'
]);

// Hàm isSampleDataFallbackEnabled dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function isSampleDataFallbackEnabled() {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (process.env.NODE_ENV === 'production') return false;
  return String(process.env.ALLOW_SAMPLE_DATA_FALLBACK ?? 'true').toLowerCase() === 'true';
}

// Hàm isDatabaseUnavailableError dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function isDatabaseUnavailableError(error) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!error) return false;
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (error.databaseUnavailable === true) return true;
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (DATABASE_UNAVAILABLE_CODES.has(String(error.code || '').toUpperCase())) return true;
  return isDatabaseUnavailableError(error.cause);
}

// Hàm fallbackOrThrow dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function fallbackOrThrow(error) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!isSampleDataFallbackEnabled() || !isDatabaseUnavailableError(error)) {
    throw error;
  }
}

module.exports = {
  fallbackOrThrow,
  isDatabaseUnavailableError,
  isSampleDataFallbackEnabled
};
