const OFFICIAL_PROVIDER_ORIGINS = Object.freeze({
  openai: 'https://api.openai.com',
  nvidia: 'https://integrate.api.nvidia.com',
  openrouter: 'https://openrouter.ai'
});

function assertAllowedProviderBaseUrl(value, provider, env = process.env) {
  const normalizedProvider = String(provider || '').toLowerCase();
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
    || !allowedOrigins(env).has(url.origin)
  ) {
    throw policyError(
      'Base URL phải dùng HTTPS và thuộc provider đã được máy chủ cho phép.'
    );
  }

  return url.href.replace(/\/$/, '');
}

function allowedOrigins(env = process.env) {
  const origins = new Set(Object.values(OFFICIAL_PROVIDER_ORIGINS));
  const configured = String(env.AI_ALLOWED_BASE_URL_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  for (const value of configured) {
    try {
      const url = new URL(value);
      if (url.protocol === 'https:' && !url.username && !url.password && !url.hash) {
        origins.add(url.origin);
      }
    } catch (error) {
      // Invalid operator entries are ignored. Production config validation below
      // rejects them before the server starts.
    }
  }
  return origins;
}

function validateAllowedProviderOrigins(env = process.env) {
  const invalid = String(env.AI_ALLOWED_BASE_URL_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => {
      try {
        const url = new URL(value);
        return (
          url.protocol !== 'https:'
          || Boolean(url.username)
          || Boolean(url.password)
          || Boolean(url.hash)
          || url.pathname !== '/'
          || Boolean(url.search)
        );
      } catch (error) {
        return true;
      }
    });
  if (invalid.length > 0) {
    throw policyError(
      'AI_ALLOWED_BASE_URL_ORIGINS chỉ được chứa các HTTPS origin, phân tách bằng dấu phẩy.'
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
  assertAllowedProviderBaseUrl,
  validateAllowedProviderOrigins
};
