// C?u h?nh runtime security t?p trung c?c h?ng s? v? quy t?c kh?i ch?y d?ng chung c?a ?ng d?ng.
const { validateDatabaseSslConfig } = require('./db');
const { validateAllowedProviderOrigins } = require('../utils/outboundUrlPolicy');

const PLACEHOLDER_SECRETS = new Set([
  'dev-session-secret',
  'dev-jwt-secret-change-me',
  'dev-only-change-this-secret',
  'change-this-session-secret',
  'change-this-jwt-secret',
  'change_me_for_admin_saved_api_keys'
]);

// H?m validateProductionConfig d?ng ?? ki?m tra t?nh h?p l? v? c?c ?i?u ki?n an to?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function validateProductionConfig(env = process.env) {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (env.NODE_ENV !== 'production') return;

  const errors = [];
  validateSecret(env, 'SESSION_SECRET', errors);
  validateSecret(env, 'JWT_SECRET', errors);
  validateSecret(env, 'API_KEY_ENCRYPTION_SECRET', errors);

  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const key of ['DB_HOST', 'DB_USER', 'DB_NAME']) {
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (!String(env[key] || '').trim()) {
      errors.push(`${key} is required in production`);
    }
  }
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    validateDatabaseSslConfig(env, { production: true });
  } catch (error) {
    errors.push(error.message);
  }

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!String(env.APP_ORIGIN || '').trim()) {
    errors.push('APP_ORIGIN is required in production');
  } else {
    // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
    try {
      const origin = new URL(env.APP_ORIGIN);
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (origin.protocol !== 'https:') {
        errors.push('APP_ORIGIN must use HTTPS in production');
      }
    } catch (error) {
      errors.push('APP_ORIGIN must be a valid absolute URL');
    }
  }

  const trustProxyHops = Number(env.TRUST_PROXY);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!Number.isInteger(trustProxyHops) || trustProxyHops < 1 || trustProxyHops > 10) {
    errors.push('TRUST_PROXY must be an integer from 1 to 10 matching the TLS proxy hop count');
  }

  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    validateAllowedProviderOrigins(env);
  } catch (error) {
    errors.push(error.message);
  }

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (errors.length > 0) {
    const error = new Error(`Cấu hình production không an toàn:\n- ${errors.join('\n- ')}`);
    error.code = 'INVALID_PRODUCTION_CONFIG';
    throw error;
  }
}

// H?m validateSecret d?ng ?? ki?m tra t?nh h?p l? v? c?c ?i?u ki?n an to?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function validateSecret(env, key, errors) {
  const value = String(env[key] || '');
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (value.length < 32) {
    errors.push(`${key} must contain at least 32 characters`);
    return;
  }
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (PLACEHOLDER_SECRETS.has(value.toLowerCase())) {
    errors.push(`${key} must not use a documented placeholder`);
  }
}

module.exports = {
  validateProductionConfig
};
