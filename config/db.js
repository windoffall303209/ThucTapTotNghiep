const mysql = require('mysql2/promise');

const hasDatabaseConfig = Boolean(process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME);

let pool = null;
let connected = false;

function numberFromEnv(name, fallback, min = 0) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.round(value));
}

function getPool() {
  if (!hasDatabaseConfig) return null;

  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: numberFromEnv('DB_CONNECTION_LIMIT', 30, 1),
      queueLimit: numberFromEnv('DB_QUEUE_LIMIT', 100, 0),
      namedPlaceholders: true,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
      connectTimeout: numberFromEnv('DB_CONNECT_TIMEOUT_MS', 10000, 1000)
    });
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
    throw new Error('Database is not available');
  }

  const [rows] = await getPool().execute(sql, params);
  return rows;
}

async function transaction(callback) {
  if (!connected) {
    await testConnection();
  }

  if (!connected) {
    throw new Error('Database is not available');
  }

  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function isDatabaseConnected() {
  return connected;
}

async function close() {
  if (pool) {
    await pool.end();
    pool = null;
  }
  connected = false;
}

module.exports = {
  query,
  transaction,
  testConnection,
  isDatabaseConnected,
  close
};
