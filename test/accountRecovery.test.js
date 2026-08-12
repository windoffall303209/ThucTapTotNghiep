const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const AccountRecoveryService = require('../services/AccountRecoveryService');
const EmailService = require('../services/EmailService');
const { normalizeEmail, validateEmail } = require('../utils/emailValidation');
const {
  REQUIRED_COLUMNS,
  parseArguments
} = require('../migrations/20260812_add_student_email_recovery');

test('chuẩn hóa và từ chối email sai cấu trúc trước khi lưu', () => {
  assert.equal(normalizeEmail('  HocSinh@VíDụ.VN '), 'hocsinh@xn--vd-nja3081a.vn');
  assert.equal(validateEmail('hoc.sinh+1@example.com'), '');
  for (const invalid of [
    'hoc sinh@example.com',
    '.hocsinh@example.com',
    'hocsinh..lop5@example.com',
    'hocsinh@example',
    'hocsinh@-example.com',
    `hocsinh@${'a'.repeat(64)}.com`
  ]) {
    assert.match(validateEmail(invalid), /không hợp lệ/, invalid);
  }
});

test('mã xác thực luôn gồm 6 chữ số và bản HMAC không chứa mã rõ', () => {
  const originalSecret = process.env.EMAIL_OTP_SECRET;
  process.env.EMAIL_OTP_SECRET = 'test-otp-secret-is-longer-than-thirty-two-characters';
  try {
    for (let index = 0; index < 50; index += 1) {
      assert.match(AccountRecoveryService.generateCode(), /^\d{6}$/);
    }
    const input = {
      studentId: 7,
      purpose: 'VERIFY_EMAIL',
      email: 'student@example.com',
      code: '012345'
    };
    const hash = AccountRecoveryService.hashCode(input);
    assert.match(hash, /^[a-f0-9]{64}$/);
    assert.equal(hash.includes(input.code), false);
    assert.equal(AccountRecoveryService.safeEqualHex(hash, hash), true);
    assert.equal(AccountRecoveryService.safeEqualHex(hash, 'not-a-hash'), false);
  } finally {
    if (originalSecret === undefined) delete process.env.EMAIL_OTP_SECRET;
    else process.env.EMAIL_OTP_SECRET = originalSecret;
  }
});

test('SMTP chỉ được xem là sẵn sàng khi đủ credential', () => {
  assert.equal(EmailService.isConfigured({}), false);
  assert.equal(EmailService.isConfigured({
    SMTP_HOST: 'smtp.example.com',
    SMTP_USER: 'mailer',
    SMTP_PASSWORD: 'secret',
    SMTP_FROM: 'no-reply@example.com'
  }), true);
});

test('migration email recovery là preflight mặc định và cần xác nhận đúng database', () => {
  assert.deepEqual(Object.keys(REQUIRED_COLUMNS), ['email', 'email_verified_at', 'pending_email']);
  assert.deepEqual(parseArguments([], { DB_NAME: 'math_app' }), { applyRequested: false });
  assert.throws(
    () => parseArguments(['--apply', '--confirm-database=wrong'], { DB_NAME: 'math_app' }),
    /xác nhận đúng database/
  );
  assert.deepEqual(
    parseArguments(['--apply', '--confirm-database=math_app'], { DB_NAME: 'math_app' }),
    { applyRequested: true }
  );
});

test('giao diện tài khoản và đăng nhập nối đủ luồng xác thực, khôi phục', () => {
  const read = (relativePath) => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
  const accountView = read('views/student/account.ejs');
  const loginView = read('views/auth/login.ejs');
  const commonScript = read('public/js/common.js');
  assert.match(accountView, /action="\/student\/account\/email"/);
  assert.match(accountView, /action="\/student\/account\/email\/verify"/);
  assert.match(accountView, /pattern="\[0-9\]\{6\}"/);
  assert.match(loginView, /href="\/auth\/forgot-password"/);
  assert.doesNotMatch(commonScript, />Chưa nhập<\/strong>/);
});
