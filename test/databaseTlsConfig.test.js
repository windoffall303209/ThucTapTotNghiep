// Bộ kiểm thử database tls config.test xác minh hành vi và các điều kiện biên quan trọng của hệ thống.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  buildDatabasePoolOptions,
  isLoopbackDatabaseHost,
  loadDatabaseSslMaterial,
  normalizeDatabaseSslMode,
  validateDatabaseSslConfig
} = require('../config/db');
const { validateProductionConfig } = require('../config/runtimeSecurity');

// Hàm databaseEnv dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function databaseEnv(overrides = {}) {
  return {
    NODE_ENV: 'development',
    DB_HOST: '127.0.0.1',
    DB_PORT: '3306',
    DB_USER: 'app',
    DB_PASSWORD: 'not-logged-by-tests',
    DB_NAME: 'app',
    DB_CONNECTION_LIMIT: '12',
    DB_QUEUE_LIMIT: '25',
    DB_CONNECT_TIMEOUT_MS: '7000',
    ...overrides
  };
}

// Hàm productionEnv dùng để thực hiện logic nghiệp vụ chính và trả kết quả cho luồng gọi; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function productionEnv(overrides = {}) {
  return {
    ...databaseEnv(),
    NODE_ENV: 'production',
    SESSION_SECRET: 's'.repeat(48),
    JWT_SECRET: 'j'.repeat(48),
    API_KEY_ENCRYPTION_SECRET: 'e'.repeat(48),
    EMAIL_OTP_SECRET: 'o'.repeat(48),
    APP_ORIGIN: 'https://example.com',
    TRUST_PROXY: '1',
    RESEND_API_KEY: 're_test_key',
    RESEND_FROM: 'no-reply@example.com',
    ...overrides
  };
}

test('DB SSL mode only accepts the three documented values', () => {
  assert.equal(normalizeDatabaseSslMode(undefined), 'disabled');
  assert.equal(normalizeDatabaseSslMode(' REQUIRED '), 'required');
  assert.equal(normalizeDatabaseSslMode('verify-ca'), 'verify-ca');
  assert.throws(
    () => normalizeDatabaseSslMode('preferred'),
    (error) => error.code === 'INVALID_DB_SSL_CONFIG'
  );
});

test('loopback detection covers localhost, IPv4 range and IPv6', () => {
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const host of ['localhost', 'LOCALHOST.', '127.0.0.1', '127.9.8.7', '::1', '[::1]']) {
    assert.equal(isLoopbackDatabaseHost(host), true, host);
  }
  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const host of ['10.0.0.5', '192.168.1.10', 'db.internal', 'mysql.example.com', '0.0.0.0']) {
    assert.equal(isLoopbackDatabaseHost(host), false, host);
  }
});

test('disabled mode keeps the existing local pool configuration without an SSL option', () => {
  const options = buildDatabasePoolOptions(databaseEnv());
  assert.equal(options.host, '127.0.0.1');
  assert.equal(options.connectionLimit, 12);
  assert.equal(options.queueLimit, 25);
  assert.equal(options.connectTimeout, 7000);
  assert.equal(Object.hasOwn(options, 'ssl'), false);
});

test('required mode encrypts MySQL traffic without requiring a CA file', () => {
  const options = buildDatabasePoolOptions(databaseEnv({
    DB_HOST: 'mysql.example.com',
    DB_SSL_MODE: 'required'
  }));
  assert.deepEqual(options.ssl, { rejectUnauthorized: false });
});

test('verify-ca mode requires loaded CA contents and enables certificate verification', () => {
  const env = databaseEnv({
    DB_HOST: 'mysql.example.com',
    DB_SSL_MODE: 'verify-ca',
    DB_SSL_CA_FILE: 'certs/mysql-ca.pem'
  });
  const options = buildDatabasePoolOptions(env, { ca: 'test-ca-contents' });
  assert.equal(options.ssl.ca, 'test-ca-contents');
  assert.equal(options.ssl.rejectUnauthorized, true);

  assert.throws(
    () => buildDatabasePoolOptions(env),
    (error) => error.code === 'INVALID_DB_SSL_CONFIG'
  );
  assert.throws(
    () => validateDatabaseSslConfig({
      ...env,
      DB_SSL_CA_FILE: ''
    }),
    /DB_SSL_CA_FILE is required/
  );
});

test('CA file is read only through the initialization loader and its contents are not logged', () => {
  const env = databaseEnv({
    DB_SSL_MODE: 'verify-ca',
    DB_SSL_CA_FILE: 'certs/mysql-ca.pem'
  });
  let requestedPath = '';
  const material = loadDatabaseSslMaterial(env, {
    // Hàm readFileSync dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
    readFileSync(filePath, encoding) {
      requestedPath = filePath;
      assert.equal(encoding, 'utf8');
      return 'private-test-ca';
    }
  });
  assert.equal(requestedPath, path.resolve('certs/mysql-ca.pem'));
  assert.deepEqual(material, { ca: 'private-test-ca' });

  assert.throws(
    () => loadDatabaseSslMaterial(env, {
      // Hàm readFileSync dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
      readFileSync() {
        throw new Error('read failed');
      }
    }),
    (error) => (
      error.code === 'INVALID_DB_SSL_CONFIG'
      && !error.message.includes('private-test-ca')
    )
  );
});

test('production rejects TLS modes that do not authenticate a remote database', () => {
  const remoteDisabled = productionEnv({
    DB_HOST: 'mysql.example.com',
    DB_SSL_MODE: 'disabled'
  });
  assert.throws(
    () => validateDatabaseSslConfig(remoteDisabled),
    /must be verify-ca in production/
  );
  assert.throws(
    () => validateProductionConfig(remoteDisabled),
    /DB_SSL_MODE must be verify-ca/
  );
  assert.throws(
    () => validateProductionConfig(productionEnv({
      DB_HOST: 'mysql.example.com',
      DB_SSL_MODE: 'required'
    })),
    /DB_SSL_MODE must be verify-ca/
  );
});

test('production permits local disabled mode and remote verify-ca mode', () => {
  assert.doesNotThrow(() => validateProductionConfig(productionEnv({
    DB_HOST: '127.0.0.1',
    DB_SSL_MODE: 'disabled'
  })));
  assert.doesNotThrow(() => validateProductionConfig(productionEnv({
    DB_HOST: 'mysql.example.com',
    DB_SSL_MODE: 'verify-ca',
    DB_SSL_CA_FILE: '/run/secrets/mysql-ca.pem'
  })));
});
