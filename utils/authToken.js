// Tiện ích auth token cung cấp các hàm dùng chung cho chuẩn hóa dữ liệu, bảo mật và xử lý lỗi.
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const AUTH_COOKIE_NAME = 'auth_token';
const DEFAULT_JWT_EXPIRES_IN = '8h';

// Hàm getJwtExpiresIn dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function getJwtExpiresIn() {
  const value = String(process.env.JWT_EXPIRES_IN || DEFAULT_JWT_EXPIRES_IN).trim();
  return /^\d+$/.test(value) ? Number(value) : value;
}

// Hàm getAuthCookieMaxAge dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function getAuthCookieMaxAge() {
  return parseDurationToMs(getJwtExpiresIn()) || parseDurationToMs(DEFAULT_JWT_EXPIRES_IN);
}

// Hàm getJwtSecret dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function getJwtSecret() {
  const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET;
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (secret) return secret;
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required in production');
  }
  return 'dev-jwt-secret-change-me';
}

// Hàm signAuthToken dùng để xử lý xác thực và cập nhật trạng thái phiên người dùng; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function signAuthToken(payload) {
  return jwt.sign(payload, getJwtSecret(), {
    algorithm: 'HS256',
    expiresIn: getJwtExpiresIn(),
    issuer: 'math-revision-ai-tutor',
    audience: 'math-revision-web'
  });
}

// Hàm setAuthCookie dùng để cập nhật trạng thái hoặc dữ liệu theo quy tắc nghiệp vụ; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function setAuthCookie(res, payload) {
  const token = signAuthToken(payload);
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: getAuthCookieMaxAge()
  });
}

// Hàm clearAuthCookie dùng để xóa hoặc giải phóng tài nguyên theo điều kiện an toàn; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function clearAuthCookie(res) {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/'
  });
}

// Hàm attachAuthUser dùng để xử lý xác thực và cập nhật trạng thái phiên người dùng; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function attachAuthUser(req, res, next) {
  const token = req.cookies?.[AUTH_COOKIE_NAME];
  req.auth = null;

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!token) return next();

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  try {
    const payload = jwt.verify(token, getJwtSecret(), {
      algorithms: ['HS256'],
      issuer: 'math-revision-ai-tutor',
      audience: 'math-revision-web'
    });
    req.auth = payload;
  } catch (error) {
    clearAuthCookie(res);
  }

  return next();
}

// Hàm getCredentialVersion dùng để lấy dữ liệu và xử lý trường hợp không tìm thấy kết quả; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function getCredentialVersion(passwordHash) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!passwordHash) return '';
  return crypto
    .createHmac('sha256', getJwtSecret())
    .update(String(passwordHash))
    .digest('base64url')
    .slice(0, 24);
}

// Hàm parseDurationToMs dùng để phân tích đầu vào thành cấu trúc có thể sử dụng; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function parseDurationToMs(value) {
  const rawValue = String(value || '').trim();
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!rawValue) return null;

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (/^\d+$/.test(rawValue)) {
    return Number(rawValue) * 1000;
  }

  const match = rawValue.match(/^(\d+)\s*(ms|s|m|h|d)$/i);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };

  return amount * multipliers[unit];
}

module.exports = {
  AUTH_COOKIE_NAME,
  attachAuthUser,
  clearAuthCookie,
  getCredentialVersion,
  setAuthCookie
};
