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

test('Resend chỉ được xem là sẵn sàng khi đủ API key và địa chỉ gửi', () => {
  assert.equal(EmailService.isConfigured({}), false);
  assert.equal(EmailService.isConfigured({
    RESEND_API_KEY: 're_test_key',
    RESEND_FROM: 'WIND OF FALL <noreply@example.com>'
  }), true);
  assert.equal(EmailService.isConfigured({
    RESEND_API_KEY: 're_test_key',
    RESEND_FROM: 'noreply@example.com\r\nBcc: attacker@example.com'
  }), false);
  assert.equal(EmailService.isConfigured({
    RESEND_API_KEY: 're_test_key',
    RESEND_FROM: 'WIND OF FALL <khong-phai-email>'
  }), false);
});

test('dịch vụ gửi mã dùng đúng API Resend và không đặt API key trong payload', async () => {
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalFrom = process.env.RESEND_FROM;
  process.env.RESEND_API_KEY = 're_private_test_key';
  process.env.RESEND_FROM = 'WIND OF FALL <noreply@example.com>';
  let request = null;
  try {
    await EmailService.sendVerificationCode({
      to: 'student@example.com',
      code: '123456',
      purpose: 'VERIFY_EMAIL',
      fetchImpl: async (url, options) => {
        request = { url, options };
        return { ok: true };
      }
    });
    assert.equal(request.url, 'https://api.resend.com/emails');
    assert.equal(request.options.method, 'POST');
    assert.equal(request.options.redirect, 'error');
    assert.equal(request.options.headers.Authorization, 'Bearer re_private_test_key');
    assert.match(request.options.headers['Idempotency-Key'], /^otp-[a-f0-9]{64}$/);
    const payload = JSON.parse(request.options.body);
    assert.equal(payload.from, process.env.RESEND_FROM);
    assert.deepEqual(payload.to, ['student@example.com']);
    assert.match(payload.text, /123456/);
    assert.equal(request.options.body.includes('re_private_test_key'), false);
  } finally {
    if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalApiKey;
    if (originalFrom === undefined) delete process.env.RESEND_FROM;
    else process.env.RESEND_FROM = originalFrom;
  }
});

test('lỗi Resend được thu gọn thành mã lỗi nội bộ an toàn', async () => {
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalFrom = process.env.RESEND_FROM;
  process.env.RESEND_API_KEY = 're_private_test_key';
  process.env.RESEND_FROM = 'noreply@example.com';
  try {
    await assert.rejects(
      EmailService.sendVerificationCode({
        to: 'student@example.com',
        code: '654321',
        purpose: 'RESET_PASSWORD',
        fetchImpl: async () => ({
          ok: false,
          status: 403,
          text: async () => 'provider-secret-detail'
        })
      }),
      (error) => error.code === 'EMAIL_SEND_FAILED'
        && error.status === 403
        && !error.message.includes('provider-secret-detail')
    );
  } finally {
    if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalApiKey;
    if (originalFrom === undefined) delete process.env.RESEND_FROM;
    else process.env.RESEND_FROM = originalFrom;
  }
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

test('giao diện tài khoản và đăng nhập nối đủ luồng xác thực, khôi phục', async () => {
  const read = (relativePath) => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
  const accountView = read('views/student/account.ejs');
  const loginView = read('views/auth/login.ejs');
  const commonScript = read('public/js/common.js');
  const studentRoutes = read('routes/studentRoutes.js');
  const studentController = read('controllers/StudentController.js');
  assert.match(accountView, /action="\/student\/account\/email"/);
  assert.match(accountView, /action="\/student\/account\/email\/verify"/);
  assert.match(accountView, /formaction="\/student\/account\/email\/cancel" formnovalidate/);
  assert.match(accountView, /class="email-code-actions"/);
  assert.match(studentRoutes, /router\.post\('\/account\/email\/cancel', StudentController\.cancelEmailVerification\)/);
  assert.match(studentController, /invalidateActiveCodes\(\{[^]*purpose: 'VERIFY_EMAIL'/);
  assert.match(studentController, /Student\.clearPendingEmail\(student\.id, pendingEmail\)/);
  assert.match(accountView, /class="email-request-row"/);
  assert.match(accountView, /data-email-edit-trigger/);
  assert.match(accountView, /data-email-edit-cancel/);
  assert.match(accountView, /name="verification_code" data-verification-code-value/);
  assert.match(loginView, /href="\/auth\/forgot-password"/);
  assert.doesNotMatch(commonScript, />Chưa nhập<\/strong>/);

  const ejs = require('ejs');
  const renderedAccount = await ejs.renderFile(
    path.join(__dirname, '..', 'views/student/account.ejs'),
    {
      account: {
        fullname: 'Học sinh kiểm thử',
        username: 'hoc_sinh',
        registered_grade: 3,
        current_grade: 3,
        created_at: new Date('2026-08-12T00:00:00Z'),
        email: null,
        email_verified_at: null,
        pending_email: 'student@example.com'
      },
      csrfToken: 'test-token',
      pageStyles: [],
      pageScripts: []
    }
  );
  assert.equal((renderedAccount.match(/data-verification-digit/g) || []).length, 6);

  const renderedVerifiedAccount = await ejs.renderFile(
    path.join(__dirname, '..', 'views/student/account.ejs'),
    {
      account: {
        fullname: 'Học sinh kiểm thử',
        username: 'hoc_sinh',
        registered_grade: 3,
        current_grade: 3,
        created_at: new Date('2026-08-12T00:00:00Z'),
        email: 'verified@example.com',
        email_verified_at: new Date('2026-08-12T01:00:00Z'),
        pending_email: null
      },
      csrfToken: 'test-token',
      pageStyles: [],
      pageScripts: []
    }
  );
  assert.match(renderedVerifiedAccount, /data-email-edit-trigger[^>]*>[^]*Sửa/);
  assert.match(renderedVerifiedAccount, /data-email-edit-form hidden/);
  assert.match(renderedVerifiedAccount, /data-email-edit-cancel>Hủy/);
});
