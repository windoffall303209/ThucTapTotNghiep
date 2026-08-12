const nodemailer = require('nodemailer');

let transporter = null;

function getMailConfig(env = process.env) {
  const port = Number(env.SMTP_PORT || 587);
  return {
    host: String(env.SMTP_HOST || '').trim(),
    port: Number.isInteger(port) && port > 0 && port <= 65535 ? port : 587,
    secure: String(env.SMTP_SECURE || '').toLowerCase() === 'true',
    user: String(env.SMTP_USER || '').trim(),
    password: String(env.SMTP_PASSWORD || ''),
    from: String(env.SMTP_FROM || '').trim()
  };
}

function isConfigured(env = process.env) {
  const config = getMailConfig(env);
  return Boolean(config.host && config.user && config.password && config.from);
}

function getTransporter() {
  if (transporter) return transporter;
  const config = getMailConfig();
  if (!isConfigured()) {
    const error = new Error('Dịch vụ gửi email chưa được cấu hình.');
    error.code = 'EMAIL_NOT_CONFIGURED';
    throw error;
  }
  transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.password },
    disableFileAccess: true,
    disableUrlAccess: true,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000
  });
  return transporter;
}

async function sendVerificationCode({ to, code, purpose }) {
  const config = getMailConfig();
  const isReset = purpose === 'RESET_PASSWORD';
  const subject = isReset
    ? 'Mã đặt lại mật khẩu Toán Bổ Trợ'
    : 'Mã xác thực email Toán Bổ Trợ';
  const action = isReset ? 'đặt lại mật khẩu' : 'xác thực địa chỉ email';
  try {
    await getTransporter().sendMail({
      from: config.from,
      to,
      subject,
      text: `Mã ${action} của bạn là ${code}. Mã có hiệu lực trong 10 phút. Không chia sẻ mã này với bất kỳ ai.`,
      html: `<p>Mã ${action} của bạn:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>Mã có hiệu lực trong 10 phút. Không chia sẻ mã này với bất kỳ ai.</p>`
    });
  } catch (error) {
    if (error.code === 'EMAIL_NOT_CONFIGURED') throw error;
    const sendError = new Error('Không thể gửi email lúc này. Vui lòng thử lại sau.');
    sendError.code = 'EMAIL_SEND_FAILED';
    sendError.cause = error;
    throw sendError;
  }
}

module.exports = { getMailConfig, isConfigured, sendVerificationCode };
