function safeAdminReturnTo(value, fallback = '/admin/dashboard') {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (
    !candidate
    || candidate.includes('\\')
    || /[\u0000-\u001f\u007f]/.test(candidate)
    || !/^\/admin(?:[/?#]|$)/.test(candidate)
    || candidate.startsWith('//')
  ) {
    return fallback;
  }

  try {
    const parsed = new URL(candidate, 'https://local.invalid');
    if (parsed.origin !== 'https://local.invalid') return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch (error) {
    return fallback;
  }
}

module.exports = {
  safeAdminReturnTo
};
