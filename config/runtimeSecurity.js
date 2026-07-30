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

function validateProductionConfig(env = process.env) {
  if (env.NODE_ENV !== 'production') return;

  const errors = [];
  validateSecret(env, 'SESSION_SECRET', errors);
  validateSecret(env, 'JWT_SECRET', errors);
  validateSecret(env, 'API_KEY_ENCRYPTION_SECRET', errors);

  for (const key of ['DB_HOST', 'DB_USER', 'DB_NAME']) {
    if (!String(env[key] || '').trim()) {
      errors.push(`${key} is required in production`);
    }
  }
  try {
    validateDatabaseSslConfig(env, { production: true });
  } catch (error) {
    errors.push(error.message);
  }

  if (!String(env.APP_ORIGIN || '').trim()) {
    errors.push('APP_ORIGIN is required in production');
  } else {
    try {
      const origin = new URL(env.APP_ORIGIN);
      if (origin.protocol !== 'https:') {
        errors.push('APP_ORIGIN must use HTTPS in production');
      }
    } catch (error) {
      errors.push('APP_ORIGIN must be a valid absolute URL');
    }
  }

  const trustProxyHops = Number(env.TRUST_PROXY);
  if (!Number.isInteger(trustProxyHops) || trustProxyHops < 1 || trustProxyHops > 10) {
    errors.push('TRUST_PROXY must be an integer from 1 to 10 matching the TLS proxy hop count');
  }

  try {
    validateAllowedProviderOrigins(env);
  } catch (error) {
    errors.push(error.message);
  }

  if (errors.length > 0) {
    const error = new Error(`Cấu hình production không an toàn:\n- ${errors.join('\n- ')}`);
    error.code = 'INVALID_PRODUCTION_CONFIG';
    throw error;
  }
}

function validateSecret(env, key, errors) {
  const value = String(env[key] || '');
  if (value.length < 32) {
    errors.push(`${key} must contain at least 32 characters`);
    return;
  }
  if (PLACEHOLDER_SECRETS.has(value.toLowerCase())) {
    errors.push(`${key} must not use a documented placeholder`);
  }
}

module.exports = {
  validateProductionConfig
};
