// Theo dõi các lần nhập sai mật khẩu liên tiếp và khóa tạm từng tài khoản.
const db = require('../config/db');

const ACCOUNT_TABLES = Object.freeze({
  admin: 'Admins',
  student: 'Students'
});

const MAX_FAILED_ATTEMPTS = readPositiveInteger(
  process.env.LOGIN_MAX_FAILED_ATTEMPTS,
  5,
  2,
  20
);
const LOCK_DURATION_MINUTES = readPositiveInteger(
  process.env.LOGIN_LOCK_MINUTES,
  5,
  1,
  1440
);
const LOCK_DURATION_MS = LOCK_DURATION_MINUTES * 60 * 1000;

function readPositiveInteger(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function resolveAccountTable(accountType) {
  const table = ACCOUNT_TABLES[String(accountType || '').trim().toLowerCase()];
  if (table) return table;
  const error = new Error('Loại tài khoản đăng nhập không hợp lệ.');
  error.code = 'INVALID_LOGIN_ACCOUNT_TYPE';
  throw error;
}

function normalizeAccountId(accountId) {
  const id = Number(accountId);
  if (Number.isInteger(id) && id > 0) return id;
  const error = new Error('ID tài khoản đăng nhập không hợp lệ.');
  error.code = 'INVALID_LOGIN_ACCOUNT_ID';
  throw error;
}

/**
 * Đọc trạng thái khóa đã được lấy cùng bản ghi tài khoản.
 * Hàm này không truy vấn thêm, nhờ đó mỗi lần đăng nhập chỉ cần một lần tìm tài khoản.
 */
function getLockState(account, nowMs = Date.now()) {
  const lockedUntilMs = new Date(account?.login_locked_until || 0).getTime();
  const locked = Number.isFinite(lockedUntilMs) && lockedUntilMs > Number(nowMs);
  return {
    locked,
    lockedUntil: locked ? new Date(lockedUntilMs) : null,
    remainingMs: locked ? Math.max(lockedUntilMs - Number(nowMs), 0) : 0,
    failedAttempts: Math.max(Number(account?.failed_login_attempts) || 0, 0)
  };
}

/**
 * Tăng bộ đếm sai trong transaction và khóa dòng bằng FOR UPDATE.
 * Nếu khóa cũ đã hết hạn, lần sai hiện tại được tính là lần thứ nhất của chuỗi mới.
 */
async function recordFailure(accountType, accountId) {
  const table = resolveAccountTable(accountType);
  const id = normalizeAccountId(accountId);

  return db.transaction(async (connection) => {
    const [rows] = await connection.execute(
      `SELECT failed_login_attempts, login_locked_until,
              CURRENT_TIMESTAMP(3) AS database_now
       FROM ${table}
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`,
      [id]
    );
    const account = rows[0] || null;
    if (!account) return null;

    const databaseNow = new Date(account.database_now);
    const nowMs = databaseNow.getTime();
    const currentState = getLockState(account, nowMs);
    if (currentState.locked) return currentState;

    const previousLockMs = new Date(account.login_locked_until || 0).getTime();
    const previousLockExpired = Number.isFinite(previousLockMs)
      && previousLockMs > 0
      && previousLockMs <= nowMs;
    const previousFailures = previousLockExpired
      ? 0
      : Math.max(Number(account.failed_login_attempts) || 0, 0);
    const failedAttempts = Math.min(previousFailures + 1, MAX_FAILED_ATTEMPTS);
    const locked = failedAttempts >= MAX_FAILED_ATTEMPTS;
    const lockedUntil = locked ? new Date(nowMs + LOCK_DURATION_MS) : null;

    await connection.execute(
      `UPDATE ${table}
       SET failed_login_attempts = ?,
           login_locked_until = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [failedAttempts, lockedUntil, id]
    );

    return {
      locked,
      lockedUntil,
      remainingMs: locked ? LOCK_DURATION_MS : 0,
      failedAttempts
    };
  });
}

/** Xóa chuỗi lần sai ngay sau khi tài khoản đăng nhập thành công. */
async function clearFailures(accountType, accountId) {
  const table = resolveAccountTable(accountType);
  const id = normalizeAccountId(accountId);
  await db.query(
    `UPDATE ${table}
     SET failed_login_attempts = 0,
         login_locked_until = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?
       AND (failed_login_attempts <> 0 OR login_locked_until IS NOT NULL)`,
    [id]
  );
}

function lockMessage(lockState) {
  const remainingMinutes = Math.max(Math.ceil(Number(lockState?.remainingMs || 0) / 60_000), 1);
  return `Bạn đã nhập sai mật khẩu ${MAX_FAILED_ATTEMPTS} lần liên tiếp. `
    + `Vui lòng thử lại sau ${remainingMinutes} phút.`;
}

module.exports = {
  LOCK_DURATION_MINUTES,
  LOCK_DURATION_MS,
  MAX_FAILED_ATTEMPTS,
  clearFailures,
  getLockState,
  lockMessage,
  recordFailure
};
