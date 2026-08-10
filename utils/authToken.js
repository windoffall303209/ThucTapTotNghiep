// Ti?n ?ch auth token cung c?p c?c h?m d?ng chung cho chu?n h?a d? li?u, b?o m?t v? x? l? l?i.
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const AUTH_COOKIE_NAME = 'auth_token';
const DEFAULT_JWT_EXPIRES_IN = '8h';

// H?m getJwtExpiresIn d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function getJwtExpiresIn() {
  const value = String(process.env.JWT_EXPIRES_IN || DEFAULT_JWT_EXPIRES_IN).trim();
  return /^\d+$/.test(value) ? Number(value) : value;
}

// H?m getAuthCookieMaxAge d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function getAuthCookieMaxAge() {
  return parseDurationToMs(getJwtExpiresIn()) || parseDurationToMs(DEFAULT_JWT_EXPIRES_IN);
}

// H?m getJwtSecret d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function getJwtSecret() {
  const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET;
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (secret) return secret;
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required in production');
  }
  return 'dev-jwt-secret-change-me';
}

// H?m signAuthToken d?ng ?? x? l? x?c th?c v? c?p nh?t tr?ng th?i phi?n ng??i d?ng; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function signAuthToken(payload) {
  return jwt.sign(payload, getJwtSecret(), {
    algorithm: 'HS256',
    expiresIn: getJwtExpiresIn(),
    issuer: 'math-revision-ai-tutor',
    audience: 'math-revision-web'
  });
}

// H?m setAuthCookie d?ng ?? c?p nh?t tr?ng th?i ho?c d? li?u theo quy t?c nghi?p v?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
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

// H?m clearAuthCookie d?ng ?? x?a ho?c gi?i ph?ng t?i nguy?n theo ?i?u ki?n an to?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function clearAuthCookie(res) {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/'
  });
}

// H?m attachAuthUser d?ng ?? x? l? x?c th?c v? c?p nh?t tr?ng th?i phi?n ng??i d?ng; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function attachAuthUser(req, res, next) {
  const token = req.cookies?.[AUTH_COOKIE_NAME];
  req.auth = null;

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!token) return next();

  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
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

// H?m getCredentialVersion d?ng ?? l?y d? li?u v? x? l? tr??ng h?p kh?ng t?m th?y k?t qu?; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function getCredentialVersion(passwordHash) {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!passwordHash) return '';
  return crypto
    .createHmac('sha256', getJwtSecret())
    .update(String(passwordHash))
    .digest('base64url')
    .slice(0, 24);
}

// H?m parseDurationToMs d?ng ?? ph?n t?ch ??u v?o th?nh c?u tr?c c? th? s? d?ng; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function parseDurationToMs(value) {
  const rawValue = String(value || '').trim();
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!rawValue) return null;

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (/^\d+$/.test(rawValue)) {
    return Number(rawValue) * 1000;
  }

  const match = rawValue.match(/^(\d+)\s*(ms|s|m|h|d)$/i);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
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
