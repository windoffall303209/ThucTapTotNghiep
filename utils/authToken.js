const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const AUTH_COOKIE_NAME = 'auth_token';
const DEFAULT_JWT_EXPIRES_IN = '8h';

function getJwtExpiresIn() {
  const value = String(process.env.JWT_EXPIRES_IN || DEFAULT_JWT_EXPIRES_IN).trim();
  return /^\d+$/.test(value) ? Number(value) : value;
}

function getAuthCookieMaxAge() {
  return parseDurationToMs(getJwtExpiresIn()) || parseDurationToMs(DEFAULT_JWT_EXPIRES_IN);
}

function getJwtSecret() {
  const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required in production');
  }
  return 'dev-jwt-secret-change-me';
}

function signAuthToken(payload) {
  return jwt.sign(payload, getJwtSecret(), {
    algorithm: 'HS256',
    expiresIn: getJwtExpiresIn(),
    issuer: 'math-revision-ai-tutor',
    audience: 'math-revision-web'
  });
}

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

function clearAuthCookie(res) {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/'
  });
}

function attachAuthUser(req, res, next) {
  const token = req.cookies?.[AUTH_COOKIE_NAME];
  req.auth = null;

  if (!token) return next();

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

function getCredentialVersion(passwordHash) {
  if (!passwordHash) return '';
  return crypto
    .createHmac('sha256', getJwtSecret())
    .update(String(passwordHash))
    .digest('base64url')
    .slice(0, 24);
}

function parseDurationToMs(value) {
  const rawValue = String(value || '').trim();
  if (!rawValue) return null;

  if (/^\d+$/.test(rawValue)) {
    return Number(rawValue) * 1000;
  }

  const match = rawValue.match(/^(\d+)\s*(ms|s|m|h|d)$/i);
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
