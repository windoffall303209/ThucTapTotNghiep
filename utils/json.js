function parseJsonField(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;

  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

module.exports = { parseJsonField };
