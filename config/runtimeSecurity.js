// Cấu hình runtime security tập trung các hằng số và quy tắc khởi chạy dùng chung của ứng dụng.
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

// Hàm validateProductionConfig dùng để kiểm tra tính hợp lệ và các điều kiện an toàn; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function validateProductionConfig(env = process.env) {
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (env.NODE_ENV !== 'production') return;

  const errors = [];
  validateSecret(env, 'SESSION_SECRET', errors);
  validateSecret(env, 'JWT_SECRET', errors);
  validateSecret(env, 'API_KEY_ENCRYPTION_SECRET', errors);

  // Vòng lặp duyệt hoặc chờ dữ liệu cho đến khi đạt điều kiện dừng đã định.
  for (const key of ['DB_HOST', 'DB_USER', 'DB_NAME']) {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (!String(env[key] || '').trim()) {
      errors.push(`${key} is required in production`);
    }
  }
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  try {
    validateDatabaseSslConfig(env, { production: true });
  } catch (error) {
    errors.push(error.message);
  }

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!String(env.APP_ORIGIN || '').trim()) {
    errors.push('APP_ORIGIN is required in production');
  } else {
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    try {
      const origin = new URL(env.APP_ORIGIN);
      // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
      if (origin.protocol !== 'https:') {
        errors.push('APP_ORIGIN must use HTTPS in production');
      }
    } catch (error) {
      errors.push('APP_ORIGIN must be a valid absolute URL');
    }
  }

  const trustProxyHops = Number(env.TRUST_PROXY);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!Number.isInteger(trustProxyHops) || trustProxyHops < 1 || trustProxyHops > 10) {
    errors.push('TRUST_PROXY must be an integer from 1 to 10 matching the TLS proxy hop count');
  }

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  try {
    validateAllowedProviderOrigins(env);
  } catch (error) {
    errors.push(error.message);
  }

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (errors.length > 0) {
    const error = new Error(`Cấu hình production không an toàn:\n- ${errors.join('\n- ')}`);
    error.code = 'INVALID_PRODUCTION_CONFIG';
    throw error;
  }
}

// Hàm validateSecret dùng để kiểm tra tính hợp lệ và các điều kiện an toàn; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function validateSecret(env, key, errors) {
  const value = String(env[key] || '');
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (value.length < 32) {
    errors.push(`${key} must contain at least 32 characters`);
    return;
  }
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (PLACEHOLDER_SECRETS.has(value.toLowerCase())) {
    errors.push(`${key} must not use a documented placeholder`);
  }
}

module.exports = {
  validateProductionConfig
};
