// Kiểm tra bộ điều khiển đăng nhập nối đúng với dịch vụ khóa tạm tài khoản.
const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

const Student = require('../models/Student');
const AuthController = require('../controllers/AuthController');
const LoginAttemptService = require('../services/LoginAttemptService');

function makeRequest(password = 'wrong-password') {
  return {
    body: { username: 'student01', password },
    session: {}
  };
}

function makeResponse() {
  return {
    redirectedTo: '',
    redirect(url) {
      this.redirectedTo = url;
      return this;
    },
    cookie() {}
  };
}

test('lần sai thứ năm hiển thị thời gian chờ và không cấp cookie đăng nhập', async (t) => {
  const originals = {
    findByUsername: Student.findByUsername,
    compare: bcrypt.compare,
    recordFailure: LoginAttemptService.recordFailure
  };
  t.after(() => {
    Student.findByUsername = originals.findByUsername;
    bcrypt.compare = originals.compare;
    LoginAttemptService.recordFailure = originals.recordFailure;
  });

  Student.findByUsername = async () => ({
    id: 11,
    username: 'student01',
    password_hash: '$2b$10$hash',
    is_active: 1,
    failed_login_attempts: 4,
    login_locked_until: null
  });
  bcrypt.compare = async () => false;
  LoginAttemptService.recordFailure = async (accountType, accountId) => {
    assert.equal(accountType, 'student');
    assert.equal(accountId, 11);
    return {
      locked: true,
      failedAttempts: 5,
      remainingMs: 5 * 60 * 1000
    };
  };

  const req = makeRequest();
  const res = makeResponse();
  await AuthController.studentLogin(req, res, assert.fail);

  assert.equal(res.redirectedTo, '/auth/student/login');
  assert.match(req.session.flash.message, /5 lần liên tiếp/u);
  assert.match(req.session.flash.message, /5 phút/u);
});

test('đăng nhập đúng xóa chuỗi lần sai trước khi cấp quyền', async (t) => {
  const originals = {
    findByUsername: Student.findByUsername,
    compare: bcrypt.compare,
    clearFailures: LoginAttemptService.clearFailures
  };
  t.after(() => {
    Student.findByUsername = originals.findByUsername;
    bcrypt.compare = originals.compare;
    LoginAttemptService.clearFailures = originals.clearFailures;
  });

  Student.findByUsername = async () => ({
    id: 12,
    username: 'student01',
    fullname: 'Học sinh thử nghiệm',
    password_hash: '$2b$10$hash',
    registered_grade: 3,
    current_grade: 3,
    is_active: 1,
    failed_login_attempts: 3,
    login_locked_until: null
  });
  bcrypt.compare = async () => true;
  let cleared = null;
  LoginAttemptService.clearFailures = async (...args) => {
    cleared = args;
  };

  const req = makeRequest('correct-password');
  const res = makeResponse();
  await AuthController.studentLogin(req, res, assert.fail);

  assert.deepEqual(cleared, ['student', 12]);
  assert.equal(res.redirectedTo, '/student/dashboard');
});
