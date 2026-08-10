// C?u h?nh db t?p trung c?c h?ng s? v? quy t?c kh?i ch?y d?ng chung c?a ?ng d?ng.
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

// H?m numberFromConfig d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function numberFromConfig(env, name, fallback, min = 0) {
  const value = Number(env[name]);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.round(value));
}

// H?m normalizeDatabaseSslMode d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function normalizeDatabaseSslMode(value) {
  const mode = String(value || 'disabled').trim().toLowerCase();
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!DB_SSL_MODES.includes(mode)) {
    throw createDatabaseSslConfigError(
      `DB_SSL_MODE must be one of: ${DB_SSL_MODES.join(', ')}`
    );
  }
  return mode;
}

// H?m isLoopbackDatabaseHost d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function isLoopbackDatabaseHost(value) {
  const host = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!host) return false;
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (host === 'localhost' || host === '::1') return true;
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (host.startsWith('::ffff:')) {
    return isLoopbackDatabaseHost(host.slice('::ffff:'.length));
  }
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (net.isIP(host) === 4) {
    return Number(host.split('.')[0]) === 127;
  }
  return false;
}

// H?m validateDatabaseSslConfig d?ng ?? ki?m tra t?nh h?p l? v? c?c ?i?u ki?n an to?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function validateDatabaseSslConfig(
  env = process.env,
  { production = env.NODE_ENV === 'production' } = {}
) {
  const mode = normalizeDatabaseSslMode(env.DB_SSL_MODE);
  const caFile = String(env.DB_SSL_CA_FILE || '').trim();
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (mode === 'verify-ca' && !caFile) {
    throw createDatabaseSslConfigError(
      'DB_SSL_CA_FILE is required when DB_SSL_MODE=verify-ca'
    );
  }
  const host = String(env.DB_HOST || '').trim();
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (production && host && !isLoopbackDatabaseHost(host) && mode !== 'verify-ca') {
    throw createDatabaseSslConfigError(
      'DB_SSL_MODE must be verify-ca in production when DB_HOST is not loopback'
    );
  }
  return { mode, caFile };
}

// H?m loadDatabaseSslMaterial d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function loadDatabaseSslMaterial(
  env = process.env,
  { readFileSync = fs.readFileSync } = {}
) {
  const sslConfig = validateDatabaseSslConfig(env);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (sslConfig.mode !== 'verify-ca') return {};

  const caPath = path.resolve(sslConfig.caFile);
  let ca;
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    ca = readFileSync(caPath, 'utf8');
  } catch (cause) {
    throw createDatabaseSslConfigError(
      `Cannot read DB_SSL_CA_FILE at ${caPath}`,
      cause
    );
  }
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!String(ca || '').trim()) {
    throw createDatabaseSslConfigError('DB_SSL_CA_FILE must not be empty');
  }
  return { ca };
}

// H?m buildDatabasePoolOptions d?ng ?? x?y d?ng k?t qu? t? c?c ngu?n d? li?u v? quy t?c li?n quan; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
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

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (sslConfig.mode === 'required') {
    options.ssl = { rejectUnauthorized: false };
  } else if (sslConfig.mode === 'verify-ca') {
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
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

// H?m createDatabaseSslConfigError d?ng ?? t?o b?n ghi ho?c t?i nguy?n m?i sau khi ki?m tra ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function createDatabaseSslConfigError(message, cause = null) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = 'INVALID_DB_SSL_CONFIG';
  return error;
}

// H?m getPool d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function getPool() {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!hasDatabaseConfig) return null;

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!pool) {
    const sslMaterial = loadDatabaseSslMaterial(process.env);
    pool = mysql.createPool(buildDatabasePoolOptions(process.env, sslMaterial));
  }

  return pool;
}

// H?m testConnection d?ng ?? ??i chi?u k?t qu? v?i c?c ?i?u ki?n mong ??i v? b?o c?o sai l?ch; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function testConnection() {
  const activePool = getPool();
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!activePool) {
    connected = false;
    return { connected: false, reason: 'missing_config' };
  }

  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
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

// H?m query d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function query(sql, params = []) {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!connected) {
    await testConnection();
  }

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!connected) {
    throw createDatabaseUnavailableError();
  }

  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    const [rows] = await getPool().execute(sql, params);
    return rows;
  } catch (error) {
    throw normalizeDatabaseError(error);
  }
}

// H?m transaction d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function transaction(callback) {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!connected) {
    await testConnection();
  }

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!connected) {
    throw createDatabaseUnavailableError();
  }

  const connection = await getPool().getConnection();
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
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

// H?m createDatabaseUnavailableError d?ng ?? t?o b?n ghi ho?c t?i nguy?n m?i sau khi ki?m tra ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function createDatabaseUnavailableError(cause = null) {
  const error = new Error('Database is not available', cause ? { cause } : undefined);
  error.code = 'DB_UNAVAILABLE';
  error.databaseUnavailable = true;
  return error;
}

// H?m normalizeDatabaseError d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function normalizeDatabaseError(error) {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (DATABASE_UNAVAILABLE_CODES.has(String(error?.code || '').toUpperCase())) {
    connected = false;
    error.databaseUnavailable = true;
  }
  return error;
}

// H?m isDatabaseConnected d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function isDatabaseConnected() {
  return connected;
}

// H?m isDatabaseConfigured d?ng ?? kh?i t?o tr?ng th?i v? c?c ph? thu?c c?n thi?t; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function isDatabaseConfigured() {
  return hasDatabaseConfig;
}

// H?m close d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
async function close() {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
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
