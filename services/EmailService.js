const crypto = require('node:crypto');
const { validateEmail } = require('../utils/emailValidation');

const RESEND_EMAILS_ENDPOINT = 'https://api.resend.com/emails';

function getResendConfig(env = process.env) {
  return {
    apiKey: String(env.RESEND_API_KEY || '').trim(),
    from: String(env.RESEND_FROM || '').trim()
  };
}

function isConfigured(env = process.env) {
  const config = getResendConfig(env);
  return Boolean(config.apiKey && extractSenderEmail(config.from));
}

function extractSenderEmail(from) {
  const value = String(from || '').trim();
  if (!value || /[\r\n]/u.test(value)) return '';
  const bracketed = value.match(/^[^<>]{1,100}<([^<>]+)>$/u);
  const email = bracketed ? bracketed[1].trim() : value;
  return validateEmail(email) ? '' : email;
}

async function sendVerificationCode({ to, code, purpose, fetchImpl = globalThis.fetch }) {
  const config = getResendConfig();
  if (!isConfigured()) {
    const error = new Error('Dịch vụ gửi email qua Resend chưa được cấu hình.');
    error.code = 'EMAIL_NOT_CONFIGURED';
    throw error;
  }
  if (typeof fetchImpl !== 'function') {
    const error = new Error('Môi trường chạy không hỗ trợ gửi yêu cầu đến Resend.');
    error.code = 'EMAIL_SEND_FAILED';
    throw error;
  }

  const isReset = purpose === 'RESET_PASSWORD';
  const subject = isReset
    ? 'Mã đặt lại mật khẩu Toán Bổ Trợ'
    : 'Mã xác thực email Toán Bổ Trợ';
  const action = isReset ? 'đặt lại mật khẩu' : 'xác thực địa chỉ email';
  const idempotencyKey = `otp-${crypto
    .createHash('sha256')
    .update(`${purpose}:${to}:${code}`)
    .digest('hex')}`;

  try {
    const response = await fetchImpl(RESEND_EMAILS_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
        'User-Agent': 'math-revision-ai-tutor/0.1'
      },
      body: JSON.stringify({
        from: config.from,
        to: [to],
        subject,
        text: `Mã ${action} của bạn là ${code}. Mã có hiệu lực trong 10 phút. Không chia sẻ mã này với bất kỳ ai.`,
        html: `<p>Mã ${action} của bạn:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>Mã có hiệu lực trong 10 phút. Không chia sẻ mã này với bất kỳ ai.</p>`
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) {
      // Chỉ đọc một phần phản hồi để giải phóng connection; không đưa nội dung provider ra UI/log.
      await response.text().then((body) => body.slice(0, 2048)).catch(() => '');
      const error = new Error('Resend từ chối yêu cầu gửi email.');
      error.code = 'EMAIL_SEND_FAILED';
      error.status = response.status;
      throw error;
    }
    if (typeof response.text === 'function') await response.text().catch(() => '');
    return true;
  } catch (error) {
    if (error.code === 'EMAIL_SEND_FAILED') throw error;
    const sendError = new Error('Không thể gửi email lúc này. Vui lòng thử lại sau.');
    sendError.code = 'EMAIL_SEND_FAILED';
    sendError.cause = error;
    throw sendError;
  }
}

module.exports = {
  RESEND_EMAILS_ENDPOINT,
  extractSenderEmail,
  getResendConfig,
  isConfigured,
  sendVerificationCode
};
