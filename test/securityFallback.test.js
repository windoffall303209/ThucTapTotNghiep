// B? ki?m th? security fallback.test x?c minh h?nh vi v? c?c ?i?u ki?n bi?n quan tr?ng c?a h? th?ng.
const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../config/db');
const Admin = require('../models/Admin');
const Student = require('../models/Student');
const sampleData = require('../sample-data/sampleData');
const { getCredentialVersion } = require('../utils/authToken');
const { validateProductionConfig } = require('../config/runtimeSecurity');
const { findKnownDemoAccounts } = require('../services/SecurityStartupService');
const { validatePassword, validateUsername } = require('../utils/accountValidation');
const {
  fallbackOrThrow,
  isSampleDataFallbackEnabled
} = require('../utils/sampleDataFallback');

test('không biến lỗi dữ liệu khi đăng ký thành tài khoản học sinh mẫu', async () => {
  const originalQuery = db.query;
  const originalLength = sampleData.students.length;
  const databaseError = Object.assign(new Error('Data too long'), {
    code: 'ER_DATA_TOO_LONG'
  });
  db.query = async () => {
    throw databaseError;
  };

  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    await assert.rejects(
      Student.createStudent({
        username: 'x'.repeat(100),
        password: 'mat-khau-hop-le',
        fullname: 'Học sinh kiểm thử',
        grade: 3
      }),
      (error) => error === databaseError
    );
    assert.equal(sampleData.students.length, originalLength);
  } finally {
    db.query = originalQuery;
  }
});

test('xác thực luôn đóng khi database mất kết nối, kể cả chế độ phát triển', async () => {
  const originalQuery = db.query;
  const unavailable = Object.assign(new Error('Database unavailable'), {
    code: 'DB_UNAVAILABLE',
    databaseUnavailable: true
  });
  db.query = async () => {
    throw unavailable;
  };

  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    await assert.rejects(Admin.findByUsername('admin'), (error) => error === unavailable);
    await assert.rejects(Student.findByUsername('annguyen'), (error) => error === unavailable);
    await assert.rejects(Student.findById(1), (error) => error === unavailable);
    await assert.rejects(
      Student.createStudent({
        username: 'hoc_sinh_moi',
        password: 'mat-khau-hop-le',
        fullname: 'Học sinh mới',
        grade: 3
      }),
      (error) => error === unavailable
    );
  } finally {
    db.query = originalQuery;
  }
});

test('fallback dữ liệu mẫu chỉ dùng cho lỗi mất DB ngoài production', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalFallback = process.env.ALLOW_SAMPLE_DATA_FALLBACK;
  const unavailable = Object.assign(new Error('Database unavailable'), {
    code: 'DB_UNAVAILABLE',
    databaseUnavailable: true
  });

  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_SAMPLE_DATA_FALLBACK = 'true';
    assert.equal(isSampleDataFallbackEnabled(), true);
    assert.doesNotThrow(() => fallbackOrThrow(unavailable));

    assert.throws(
      () => fallbackOrThrow(Object.assign(new Error('Invalid SQL'), { code: 'ER_PARSE_ERROR' })),
      /Invalid SQL/
    );

    process.env.NODE_ENV = 'production';
    assert.equal(isSampleDataFallbackEnabled(), false);
    assert.throws(() => fallbackOrThrow(unavailable), /Database unavailable/);
  } finally {
    restoreEnv('NODE_ENV', originalNodeEnv);
    restoreEnv('ALLOW_SAMPLE_DATA_FALLBACK', originalFallback);
  }
});

test('production từ chối secret mẫu và cấu hình thiếu', () => {
  assert.throws(
    () => validateProductionConfig({
      NODE_ENV: 'production',
      SESSION_SECRET: 'change-this-session-secret',
      JWT_SECRET: 'change-this-jwt-secret',
      API_KEY_ENCRYPTION_SECRET: 'change_me_for_admin_saved_api_keys',
      DB_HOST: '127.0.0.1',
      DB_USER: 'app',
      DB_NAME: 'app',
      APP_ORIGIN: 'http://example.com'
    }),
    /Cấu hình production không an toàn/
  );

  assert.doesNotThrow(() => validateProductionConfig({
    NODE_ENV: 'production',
    SESSION_SECRET: 's'.repeat(48),
    JWT_SECRET: 'j'.repeat(48),
    API_KEY_ENCRYPTION_SECRET: 'e'.repeat(48),
    DB_HOST: '127.0.0.1',
    DB_USER: 'app',
    DB_NAME: 'app',
    APP_ORIGIN: 'https://example.com',
    TRUST_PROXY: '1'
  }));
});

test('phiên đăng nhập đổi phiên bản khi mật khẩu thay đổi', () => {
  const originalJwtSecret = process.env.JWT_SECRET;
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-hmac';
    const first = getCredentialVersion('hash-a');
    const second = getCredentialVersion('hash-b');
    assert.equal(first.length, 24);
    assert.notEqual(first, second);
  } finally {
    restoreEnv('JWT_SECRET', originalJwtSecret);
  }
});

test('phát hiện tài khoản vẫn dùng mật khẩu demo công khai', async () => {
  const unsafe = await findKnownDemoAccounts([
    {
      username: 'admin',
      password_hash: '$2b$10$Px9plvW0cgBO6TvqWiEiFOYSO3FvjvVfslUIdG2RjQCVjRZxv8qH2'
    },
    {
      username: 'admin-an-toan',
      password_hash: await require('bcryptjs').hash('mat-khau-rieng', 4)
    }
  ]);
  assert.deepEqual(unsafe, ['admin']);
});

test('giới hạn đầu vào tài khoản theo kích thước cột và giới hạn bcrypt', () => {
  assert.match(validateUsername('x'.repeat(51)), /3 đến 50/);
  assert.equal(validateUsername('hoc_sinh-01'), '');
  assert.match(validatePassword('á'.repeat(40)), /72 byte/);
  assert.equal(validatePassword('mat-khau-an-toan'), '');
});

// H?m restoreEnv d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function restoreEnv(key, value) {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (value === undefined) delete process.env[key];
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  else process.env[key] = value;
}
