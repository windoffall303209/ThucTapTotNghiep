const crypto = require('node:crypto');
const db = require('../config/db');

const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_SECONDS = 60;
const PURPOSES = Object.freeze(['VERIFY_EMAIL', 'RESET_PASSWORD']);

function getOtpSecret() {
  const secret = String(process.env.EMAIL_OTP_SECRET || process.env.JWT_SECRET || process.env.SESSION_SECRET || '');
  if (process.env.NODE_ENV === 'production' && secret.length < 32) {
    const error = new Error('EMAIL_OTP_SECRET phải có ít nhất 32 ký tự trong production.');
    error.code = 'INVALID_OTP_SECRET';
    throw error;
  }
  return secret || 'dev-email-otp-secret-change-me';
}

function generateCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

function hashCode({ studentId, purpose, email, code }) {
  return crypto
    .createHmac('sha256', getOtpSecret())
    .update(`${studentId}:${purpose}:${email}:${code}`)
    .digest('hex');
}

function safeEqualHex(left, right) {
  const leftText = String(left || '');
  const rightText = String(right || '');
  const leftValid = /^[a-f0-9]{64}$/iu.test(leftText);
  const rightValid = /^[a-f0-9]{64}$/iu.test(rightText);
  const leftBuffer = Buffer.from(leftValid ? leftText : '0'.repeat(64), 'hex');
  const rightBuffer = Buffer.from(rightValid ? rightText : '0'.repeat(64), 'hex');
  const equal = crypto.timingSafeEqual(leftBuffer, rightBuffer);
  return leftValid && rightValid && equal;
}

async function issueCode({ studentId, purpose, email }) {
  if (!PURPOSES.includes(purpose)) throw new Error('Mục đích mã xác thực không hợp lệ.');
  return db.transaction(async (connection) => {
    // Khóa tài khoản gốc để hai yêu cầu đồng thời không thể cùng phát hành hai mã còn hiệu lực.
    const [students] = await connection.execute(
      'SELECT id FROM Students WHERE id = ? LIMIT 1 FOR UPDATE',
      [studentId]
    );
    if (!students[0]) throw new Error('Không tìm thấy tài khoản học sinh.');
    await connection.execute(
      `DELETE FROM AccountVerificationCodes
       WHERE student_id = ?
         AND (consumed_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 DAY)
              OR expires_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 DAY))`,
      [studentId]
    );
    const [recent] = await connection.execute(
      `SELECT id, created_at
       FROM AccountVerificationCodes
       WHERE student_id = ? AND purpose = ? AND target_email = ?
       ORDER BY id DESC LIMIT 1 FOR UPDATE`,
      [studentId, purpose, email]
    );
    if (recent[0] && Date.now() - new Date(recent[0].created_at).getTime() < OTP_RESEND_COOLDOWN_SECONDS * 1000) {
      const error = new Error('Vui lòng chờ 60 giây trước khi yêu cầu mã mới.');
      error.code = 'OTP_COOLDOWN';
      throw error;
    }

    await connection.execute(
      `UPDATE AccountVerificationCodes
       SET consumed_at = CURRENT_TIMESTAMP
       WHERE student_id = ? AND purpose = ? AND consumed_at IS NULL`,
      [studentId, purpose]
    );
    const code = generateCode();
    await connection.execute(
      `INSERT INTO AccountVerificationCodes
       (student_id, purpose, target_email, code_hash, expires_at)
       VALUES (?, ?, ?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? MINUTE))`,
      [studentId, purpose, email, hashCode({ studentId, purpose, email, code }), CODE_TTL_MINUTES]
    );
    return code;
  });
}

async function verifyCode({ studentId, purpose, email, code, connection = null }) {
  const run = async (dbConnection) => {
    const [rows] = await dbConnection.execute(
      `SELECT id, code_hash, attempts, expires_at,
              (expires_at > CURRENT_TIMESTAMP) AS is_valid
       FROM AccountVerificationCodes
       WHERE student_id = ? AND purpose = ? AND target_email = ? AND consumed_at IS NULL
       ORDER BY id DESC LIMIT 1 FOR UPDATE`,
      [studentId, purpose, email]
    );
    const record = rows[0];
    if (!record || Number(record.attempts) >= MAX_ATTEMPTS || Number(record.is_valid) !== 1) {
      return { ok: false, code: 'OTP_INVALID_OR_EXPIRED' };
    }
    const matches = safeEqualHex(
      record.code_hash,
      hashCode({ studentId, purpose, email, code })
    );
    if (!matches) {
      await dbConnection.execute(
        `UPDATE AccountVerificationCodes
         SET attempts = attempts + 1,
             consumed_at = IF(attempts + 1 >= ?, CURRENT_TIMESTAMP, consumed_at)
         WHERE id = ?`,
        [MAX_ATTEMPTS, record.id]
      );
      return { ok: false, code: 'OTP_INVALID_OR_EXPIRED' };
    }
    await dbConnection.execute(
      'UPDATE AccountVerificationCodes SET consumed_at = CURRENT_TIMESTAMP WHERE id = ?',
      [record.id]
    );
    return { ok: true, id: record.id };
  };
  return connection ? run(connection) : db.transaction(run);
}

async function invalidateActiveCodes({ studentId, purpose }) {
  if (!PURPOSES.includes(purpose)) return;
  await db.query(
    `UPDATE AccountVerificationCodes
     SET consumed_at = CURRENT_TIMESTAMP
     WHERE student_id = ? AND purpose = ? AND consumed_at IS NULL`,
    [studentId, purpose]
  );
}

async function resetPasswordWithCode({ studentId, email, code, passwordHash }) {
  return db.transaction(async (connection) => {
    const verification = await verifyCode({
      studentId,
      purpose: 'RESET_PASSWORD',
      email,
      code,
      connection
    });
    if (!verification.ok) return { ok: false, code: verification.code };
    const [result] = await connection.execute(
      `UPDATE Students
       SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND email = ? AND email_verified_at IS NOT NULL AND is_active = 1`,
      [passwordHash, studentId, email]
    );
    if (Number(result.affectedRows || 0) !== 1) {
      const error = new Error('Không thể cập nhật mật khẩu cho tài khoản đã xác minh.');
      error.code = 'PASSWORD_RESET_UPDATE_FAILED';
      throw error;
    }
    return { ok: true };
  });
}

async function verifyEmailWithCode({ studentId, email, code }) {
  return db.transaction(async (connection) => {
    const verification = await verifyCode({
      studentId,
      purpose: 'VERIFY_EMAIL',
      email,
      code,
      connection
    });
    if (!verification.ok) return { ok: false, code: verification.code };
    const [result] = await connection.execute(
      `UPDATE Students
       SET email = pending_email,
           pending_email = NULL,
           email_verified_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND pending_email = ?`,
      [studentId, email]
    );
    if (Number(result.affectedRows || 0) !== 1) {
      const error = new Error('Email chờ xác thực đã thay đổi.');
      error.code = 'PENDING_EMAIL_CHANGED';
      throw error;
    }
    return { ok: true };
  });
}

module.exports = {
  CODE_TTL_MINUTES,
  MAX_ATTEMPTS,
  PURPOSES,
  OTP_RESEND_COOLDOWN_SECONDS,
  generateCode,
  hashCode,
  invalidateActiveCodes,
  issueCode,
  resetPasswordWithCode,
  safeEqualHex,
  verifyCode,
  verifyEmailWithCode
};
