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

function assertAllowedProviderBaseUrl(value, provider, env = process.env) {
  const normalizedProvider = String(provider || '').trim().toLowerCase();
  const officialOrigin = OFFICIAL_PROVIDER_ORIGINS[normalizedProvider];
  if (!officialOrigin) {
    throw policyError('Provider không hỗ trợ Base URL tùy chỉnh.');
  }

  let url;
  try {
    url = new URL(String(value || ''));
  } catch (error) {
    throw policyError('Base URL không hợp lệ.');
  }

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

function configuredOrigins(provider, env = process.env) {
  rejectLegacySharedAllowlist(env);
  const envKey = PROVIDER_ALLOWLIST_ENV_KEYS[provider];
  if (!envKey) {
    throw policyError('Provider không hỗ trợ Base URL tùy chỉnh.');
  }

  const values = String(env[envKey] || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const origins = [];

  for (const value of values) {
    try {
      const url = new URL(value);
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

function allowedOrigins(provider, env = process.env) {
  return new Set([
    OFFICIAL_PROVIDER_ORIGINS[provider],
    ...configuredOrigins(provider, env)
  ]);
}

function validateAllowedProviderOrigins(env = process.env) {
  rejectLegacySharedAllowlist(env);
  for (const provider of Object.keys(OFFICIAL_PROVIDER_ORIGINS)) {
    configuredOrigins(provider, env);
  }
}

function rejectLegacySharedAllowlist(env = process.env) {
  if (String(env[LEGACY_SHARED_ALLOWLIST_KEY] || '').trim()) {
    throw policyError(
      `${LEGACY_SHARED_ALLOWLIST_KEY} không còn được hỗ trợ; `
      + 'hãy cấu hình allowlist riêng cho từng provider để tránh gửi nhầm API key.'
    );
  }
}

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
