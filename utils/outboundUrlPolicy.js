// Ti?n ?ch outbound url policy cung c?p c?c h?m d?ng chung cho chu?n h?a d? li?u, b?o m?t v? x? l? l?i.
const OFFICIAL_PROVIDER_ORIGINS = Object.freeze({
  openai: 'https://api.openai.com',
  nvidia: 'https://integrate.api.nvidia.com',
  openrouter: 'https://openrouter.ai'
});
const PROVIDER_ALLOWLIST_ENV_KEYS = Object.freeze({
  openai: 'AI_ALLOWED_OPENAI_BASE_URL_ORIGINS',
  nvidia: 'AI_ALLOWED_NVIDIA_BASE_URL_ORIGINS',
  openrouter: 'AI_ALLOWED_OPENROUTER_BASE_URL_ORIGINS'
});
const LEGACY_SHARED_ALLOWLIST_KEY = 'AI_ALLOWED_BASE_URL_ORIGINS';

// H?m assertAllowedProviderBaseUrl d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function assertAllowedProviderBaseUrl(value, provider, env = process.env) {
  const normalizedProvider = String(provider || '').trim().toLowerCase();
  const officialOrigin = OFFICIAL_PROVIDER_ORIGINS[normalizedProvider];
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!officialOrigin) {
    throw policyError('Provider không hỗ trợ Base URL tùy chỉnh.');
  }

  let url;
  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    url = new URL(String(value || ''));
  } catch (error) {
    throw policyError('Base URL không hợp lệ.');
  }

  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || url.hash
    || !allowedOrigins(normalizedProvider, env).has(url.origin)
  ) {
    throw policyError(
      'Base URL phải dùng HTTPS và thuộc provider đã được máy chủ cho phép.'
    );
  }

  return url.href.replace(/\/$/, '');
}

// H?m configuredOrigins d?ng ?? kh?i t?o tr?ng th?i v? c?c ph? thu?c c?n thi?t; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function configuredOrigins(provider, env = process.env) {
  rejectLegacySharedAllowlist(env);
  const envKey = PROVIDER_ALLOWLIST_ENV_KEYS[provider];
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!envKey) {
    throw policyError('Provider không hỗ trợ Base URL tùy chỉnh.');
  }

  const values = String(env[envKey] || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const origins = [];

  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const value of values) {
    // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
    try {
      const url = new URL(value);
      // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
      if (
        url.protocol !== 'https:'
        || url.username
        || url.password
        || url.hash
        || url.pathname !== '/'
        || url.search
      ) {
        throw new Error('not_origin');
      }
      origins.push(url.origin);
    } catch (error) {
      throw policyError(
        `${envKey} chỉ được chứa các HTTPS origin, phân tách bằng dấu phẩy.`
      );
    }
  }
  return origins;
}

// H?m allowedOrigins d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function allowedOrigins(provider, env = process.env) {
  return new Set([
    OFFICIAL_PROVIDER_ORIGINS[provider],
    ...configuredOrigins(provider, env)
  ]);
}

// H?m validateAllowedProviderOrigins d?ng ?? ki?m tra t?nh h?p l? v? c?c ?i?u ki?n an to?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function validateAllowedProviderOrigins(env = process.env) {
  rejectLegacySharedAllowlist(env);
  // V?ng l?p duy?t ho?c ch? d? li?u cho ??n khi ??t ?i?u ki?n d?ng ?? ??nh.
  for (const provider of Object.keys(OFFICIAL_PROVIDER_ORIGINS)) {
    configuredOrigins(provider, env);
  }
}

// H?m rejectLegacySharedAllowlist d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function rejectLegacySharedAllowlist(env = process.env) {
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (String(env[LEGACY_SHARED_ALLOWLIST_KEY] || '').trim()) {
    throw policyError(
      `${LEGACY_SHARED_ALLOWLIST_KEY} không còn được hỗ trợ; `
      + 'hãy cấu hình allowlist riêng cho từng provider để tránh gửi nhầm API key.'
    );
  }
}

// H?m policyError d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function policyError(message) {
  const error = new Error(message);
  error.code = 'OUTBOUND_URL_NOT_ALLOWED';
  error.status = 400;
  return error;
}

module.exports = {
  OFFICIAL_PROVIDER_ORIGINS,
  PROVIDER_ALLOWLIST_ENV_KEYS,
  LEGACY_SHARED_ALLOWLIST_KEY,
  assertAllowedProviderBaseUrl,
  validateAllowedProviderOrigins
};
