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

function numberFromConfig(env, name, fallback, min = 0) {
  const value = Number(env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.round(value));
}

function normalizeDatabaseSslMode(value) {
  const mode = String(value || 'disabled').trim().toLowerCase();
  if (!DB_SSL_MODES.includes(mode)) {
    throw createDatabaseSslConfigError(
      `DB_SSL_MODE must be one of: ${DB_SSL_MODES.join(', ')}`
    );
  }
  return mode;
}

function isLoopbackDatabaseHost(value) {
  const host = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
  if (!host) return false;
  if (host === 'localhost' || host === '::1') return true;
  if (host.startsWith('::ffff:')) {
    return isLoopbackDatabaseHost(host.slice('::ffff:'.length));
  }
  if (net.isIP(host) === 4) {
    return Number(host.split('.')[0]) === 127;
  }
  return false;
}

function validateDatabaseSslConfig(
  env = process.env,
  { production = env.NODE_ENV === 'production' } = {}
) {
  const mode = normalizeDatabaseSslMode(env.DB_SSL_MODE);
  const caFile = String(env.DB_SSL_CA_FILE || '').trim();
  if (mode === 'verify-ca' && !caFile) {
    throw createDatabaseSslConfigError(
      'DB_SSL_CA_FILE is required when DB_SSL_MODE=verify-ca'
    );
  }
  const host = String(env.DB_HOST || '').trim();
  if (production && host && !isLoopbackDatabaseHost(host) && mode !== 'verify-ca') {
    throw createDatabaseSslConfigError(
      'DB_SSL_MODE must be verify-ca in production when DB_HOST is not loopback'
    );
  }
  return { mode, caFile };
}

function loadDatabaseSslMaterial(
  env = process.env,
  { readFileSync = fs.readFileSync } = {}
) {
  const sslConfig = validateDatabaseSslConfig(env);
  if (sslConfig.mode !== 'verify-ca') return {};

  const caPath = path.resolve(sslConfig.caFile);
  let ca;
  try {
    ca = readFileSync(caPath, 'utf8');
  } catch (cause) {
    throw createDatabaseSslConfigError(
      `Cannot read DB_SSL_CA_FILE at ${caPath}`,
      cause
    );
  }
  if (!String(ca || '').trim()) {
    throw createDatabaseSslConfigError('DB_SSL_CA_FILE must not be empty');
  }
  return { ca };
}

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

  if (sslConfig.mode === 'required') {
    options.ssl = { rejectUnauthorized: false };
  } else if (sslConfig.mode === 'verify-ca') {
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

function createDatabaseSslConfigError(message, cause = null) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = 'INVALID_DB_SSL_CONFIG';
  return error;
}

function getPool() {
  if (!hasDatabaseConfig) return null;

  if (!pool) {
    const sslMaterial = loadDatabaseSslMaterial(process.env);
    pool = mysql.createPool(buildDatabasePoolOptions(process.env, sslMaterial));
  }

  return pool;
}

async function testConnection() {
  const activePool = getPool();
  if (!activePool) {
    connected = false;
    return { connected: false, reason: 'missing_config' };
  }

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

async function query(sql, params = []) {
  if (!connected) {
    await testConnection();
  }

  if (!connected) {
    throw createDatabaseUnavailableError();
  }

  try {
    const [rows] = await getPool().execute(sql, params);
    return rows;
  } catch (error) {
    throw normalizeDatabaseError(error);
  }
}

async function transaction(callback) {
  if (!connected) {
    await testConnection();
  }

  if (!connected) {
    throw createDatabaseUnavailableError();
  }

  const connection = await getPool().getConnection();
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

function createDatabaseUnavailableError(cause = null) {
  const error = new Error('Database is not available', cause ? { cause } : undefined);
  error.code = 'DB_UNAVAILABLE';
  error.databaseUnavailable = true;
  return error;
}

function normalizeDatabaseError(error) {
  if (DATABASE_UNAVAILABLE_CODES.has(String(error?.code || '').toUpperCase())) {
    connected = false;
    error.databaseUnavailable = true;
  }
  return error;
}

function isDatabaseConnected() {
  return connected;
}

function isDatabaseConfigured() {
  return hasDatabaseConfig;
}

async function close() {
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
