const DATABASE_UNAVAILABLE_CODES = new Set([
  'DB_UNAVAILABLE',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'PROTOCOL_CONNECTION_LOST',
  'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR',
  'POOL_CLOSED'
]);

function isSampleDataFallbackEnabled() {
  if (process.env.NODE_ENV === 'production') return false;
  return String(process.env.ALLOW_SAMPLE_DATA_FALLBACK ?? 'true').toLowerCase() === 'true';
}

function isDatabaseUnavailableError(error) {
  if (!error) return false;
  if (error.databaseUnavailable === true) return true;
  if (DATABASE_UNAVAILABLE_CODES.has(String(error.code || '').toUpperCase())) return true;
  return isDatabaseUnavailableError(error.cause);
}

function fallbackOrThrow(error) {
  if (!isSampleDataFallbackEnabled() || !isDatabaseUnavailableError(error)) {
    throw error;
  }
}

module.exports = {
  fallbackOrThrow,
  isDatabaseUnavailableError,
  isSampleDataFallbackEnabled
};
