// Kiểm tra bộ đếm sai liên tiếp, thời gian khóa và thao tác xóa bộ đếm.
const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../config/db');
const LoginAttemptService = require('../services/LoginAttemptService');

test('lần sai thứ năm khóa tài khoản trong 5 phút', async (t) => {
  const originalTransaction = db.transaction;
  const databaseNow = new Date('2026-08-25T10:00:00.000Z');
  const account = {
    failed_login_attempts: 4,
    login_locked_until: null,
    database_now: databaseNow
  };
  let update = null;

  t.after(() => {
    db.transaction = originalTransaction;
  });
  db.transaction = async (callback) => callback({
    async execute(sql, params) {
      if (/SELECT failed_login_attempts/u.test(sql)) return [[account]];
      update = { sql, params };
      return [{ affectedRows: 1 }];
    }
  });

  const result = await LoginAttemptService.recordFailure('student', 7);

  assert.equal(result.failedAttempts, 5);
  assert.equal(result.locked, true);
  assert.equal(result.remainingMs, 5 * 60 * 1000);
  assert.equal(result.lockedUntil.toISOString(), '2026-08-25T10:05:00.000Z');
  assert.match(update.sql, /UPDATE Students/u);
  assert.deepEqual(update.params, [5, result.lockedUntil, 7]);
});

test('lần sai đầu tiên sau khi hết khóa bắt đầu một chuỗi mới', async (t) => {
  const originalTransaction = db.transaction;
  const account = {
    failed_login_attempts: 5,
    login_locked_until: new Date('2026-08-25T09:59:00.000Z'),
    database_now: new Date('2026-08-25T10:00:00.000Z')
  };
  let updateParams = null;

  t.after(() => {
    db.transaction = originalTransaction;
  });
  db.transaction = async (callback) => callback({
    async execute(sql, params) {
      if (/SELECT failed_login_attempts/u.test(sql)) return [[account]];
      updateParams = params;
      return [{ affectedRows: 1 }];
    }
  });

  const result = await LoginAttemptService.recordFailure('admin', 3);

  assert.equal(result.failedAttempts, 1);
  assert.equal(result.locked, false);
  assert.deepEqual(updateParams, [1, null, 3]);
});

test('đăng nhập thành công xóa bộ đếm và mốc khóa', async (t) => {
  const originalQuery = db.query;
  let statement = null;

  t.after(() => {
    db.query = originalQuery;
  });
  db.query = async (sql, params) => {
    statement = { sql, params };
    return { affectedRows: 1 };
  };

  await LoginAttemptService.clearFailures('student', 9);

  assert.match(statement.sql, /failed_login_attempts = 0/u);
  assert.match(statement.sql, /login_locked_until = NULL/u);
  assert.deepEqual(statement.params, [9]);
});

test('trạng thái khóa trả số thời gian còn lại để hiển thị', () => {
  const state = LoginAttemptService.getLockState(
    {
      failed_login_attempts: 5,
      login_locked_until: '2026-08-25T10:05:00.000Z'
    },
    new Date('2026-08-25T10:01:30.000Z').getTime()
  );

  assert.equal(state.locked, true);
  assert.equal(state.failedAttempts, 5);
  assert.equal(state.remainingMs, 210_000);
  assert.match(LoginAttemptService.lockMessage(state), /4 phút/u);
});
