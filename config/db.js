// Cấu hình db tập trung các hằng số và quy tắc khởi chạy dùng chung của ứng dụng.
const mysql = require('mysql2/promise');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

const hasDatabaseConfig = Boolean(process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME);
const DB_SSL_MODES = Object.freeze(['disabled', 'required', 'verify-ca']);

let pool = null;
let connected = false;

const DATABASE_UNAVAILABLE_CODES = new Set([
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

// Hàm numberFromConfig dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function numberFromConfig(env, name, fallback, min = 0) {
  const value = Number(env[name]);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.round(value));
}

// Hàm normalizeDatabaseSslMode dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function normalizeDatabaseSslMode(value) {
  const mode = String(value || 'disabled').trim().toLowerCase();
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!DB_SSL_MODES.includes(mode)) {
    throw createDatabaseSslConfigError(
      `DB_SSL_MODE must be one of: ${DB_SSL_MODES.join(', ')}`
    );
  }
  return mode;
}

// Hàm isLoopbackDatabaseHost dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function isLoopbackDatabaseHost(value) {
  const host = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!host) return false;
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (host === 'localhost' || host === '::1') return true;
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (host.startsWith('::ffff:')) {
    return isLoopbackDatabaseHost(host.slice('::ffff:'.length));
  }
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (net.isIP(host) === 4) {
    return Number(host.split('.')[0]) === 127;
  }
  return false;
}

// Hàm validateDatabaseSslConfig dùng để kiểm tra tính hợp lệ và các điều kiện an toàn; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function validateDatabaseSslConfig(
  env = process.env,
  { production = env.NODE_ENV === 'production' } = {}
) {
  const mode = normalizeDatabaseSslMode(env.DB_SSL_MODE);
  const caFile = String(env.DB_SSL_CA_FILE || '').trim();
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (mode === 'verify-ca' && !caFile) {
    throw createDatabaseSslConfigError(
      'DB_SSL_CA_FILE is required when DB_SSL_MODE=verify-ca'
    );
  }
  const host = String(env.DB_HOST || '').trim();
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (production && host && !isLoopbackDatabaseHost(host) && mode !== 'verify-ca') {
    throw createDatabaseSslConfigError(
      'DB_SSL_MODE must be verify-ca in production when DB_HOST is not loopback'
    );
  }
  return { mode, caFile };
}

// Hàm loadDatabaseSslMaterial dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function loadDatabaseSslMaterial(
  env = process.env,
  { readFileSync = fs.readFileSync } = {}
) {
  const sslConfig = validateDatabaseSslConfig(env);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (sslConfig.mode !== 'verify-ca') return {};

  const caPath = path.resolve(sslConfig.caFile);
  let ca;
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  try {
    ca = readFileSync(caPath, 'utf8');
  } catch (cause) {
    throw createDatabaseSslConfigError(
      `Cannot read DB_SSL_CA_FILE at ${caPath}`,
      cause
    );
  }
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!String(ca || '').trim()) {
    throw createDatabaseSslConfigError('DB_SSL_CA_FILE must not be empty');
  }
  return { ca };
}

// Hàm buildDatabasePoolOptions dùng để xây dựng kết quả từ các nguồn dữ liệu và quy tắc liên quan; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function buildDatabasePoolOptions(env = process.env, sslMaterial = {}) {
  const sslConfig = validateDatabaseSslConfig(env);
  const options = {
    host: env.DB_HOST,
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER,
    password: env.DB_PASSWORD || '',
    database: env.DB_NAME,
    waitForConnections: true,
    connectionLimit: numberFromConfig(env, 'DB_CONNECTION_LIMIT', 30, 1),
    queueLimit: numberFromConfig(env, 'DB_QUEUE_LIMIT', 100, 0),
    namedPlaceholders: true,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    connectTimeout: numberFromConfig(env, 'DB_CONNECT_TIMEOUT_MS', 10000, 1000)
  };

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (sslConfig.mode === 'required') {
    options.ssl = { rejectUnauthorized: false };
  } else if (sslConfig.mode === 'verify-ca') {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!String(sslMaterial.ca || '').trim()) {
      throw createDatabaseSslConfigError(
        'CA contents are required to build a verify-ca MySQL pool'
      );
    }
    options.ssl = {
      ca: sslMaterial.ca,
      rejectUnauthorized: true
    };
  }
  return options;
}

// Hàm createDatabaseSslConfigError dùng để tạo bản ghi hoặc tài nguyên mới sau khi kiểm tra đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function createDatabaseSslConfigError(message, cause = null) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = 'INVALID_DB_SSL_CONFIG';
  return error;
}

// Hàm getPool dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function getPool() {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!hasDatabaseConfig) return null;

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!pool) {
    const sslMaterial = loadDatabaseSslMaterial(process.env);
    pool = mysql.createPool(buildDatabasePoolOptions(process.env, sslMaterial));
  }

  return pool;
}

// Hàm testConnection dùng để đối chiếu kết quả với các điều kiện mong đợi và báo cáo sai lệch; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function testConnection() {
  const activePool = getPool();
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!activePool) {
    connected = false;
    return { connected: false, reason: 'missing_config' };
  }

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  try {
    await activePool.query('SELECT 1');
    connected = true;
    return { connected: true };
  } catch (error) {
    connected = false;
    console.warn('Không kết nối được MySQL, chuyển sang dữ liệu mẫu:', error.message);
    return { connected: false, reason: error.message };
  }
}

// Hàm query dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function query(sql, params = []) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!connected) {
    await testConnection();
  }

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!connected) {
    throw createDatabaseUnavailableError();
  }

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  try {
    const [rows] = await getPool().execute(sql, params);
    return rows;
  } catch (error) {
    throw normalizeDatabaseError(error);
  }
}

// Hàm transaction dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function transaction(callback) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!connected) {
    await testConnection();
  }

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!connected) {
    throw createDatabaseUnavailableError();
  }

  const connection = await getPool().getConnection();
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw normalizeDatabaseError(error);
  } finally {
    connection.release();
  }
}

// Hàm createDatabaseUnavailableError dùng để tạo bản ghi hoặc tài nguyên mới sau khi kiểm tra đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function createDatabaseUnavailableError(cause = null) {
  const error = new Error('Database is not available', cause ? { cause } : undefined);
  error.code = 'DB_UNAVAILABLE';
  error.databaseUnavailable = true;
  return error;
}

// Hàm normalizeDatabaseError dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function normalizeDatabaseError(error) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (DATABASE_UNAVAILABLE_CODES.has(String(error?.code || '').toUpperCase())) {
    connected = false;
    error.databaseUnavailable = true;
  }
  return error;
}

// Hàm isDatabaseConnected dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function isDatabaseConnected() {
  return connected;
}

// Hàm isDatabaseConfigured dùng để khởi tạo trạng thái và các phụ thuộc cần thiết; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function isDatabaseConfigured() {
  return hasDatabaseConfig;
}

// Hàm close dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
async function close() {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (pool) {
    await pool.end();
    pool = null;
  }
  connected = false;
}

module.exports = {
  DB_SSL_MODES,
  buildDatabasePoolOptions,
  isLoopbackDatabaseHost,
  loadDatabaseSslMaterial,
  normalizeDatabaseSslMode,
  query,
  transaction,
  testConnection,
  validateDatabaseSslConfig,
  isDatabaseConfigured,
  isDatabaseConnected,
  close
};
