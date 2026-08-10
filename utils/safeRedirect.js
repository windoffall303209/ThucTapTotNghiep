// Ti?n ?ch safe redirect cung c?p c?c h?m d?ng chung cho chu?n h?a d? li?u, b?o m?t v? x? l? l?i.
function safeAdminReturnTo(value, fallback = '/admin/dashboard') {
  const candidate = typeof value === 'string' ? value.trim() : '';
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (
    !candidate
    || candidate.includes('\\')
    || /[\u0000-\u001f\u007f]/.test(candidate)
    || !/^\/admin(?:[/?#]|$)/.test(candidate)
    || candidate.startsWith('//')
  ) {
    return fallback;
  }

  // Kh?i n?y t?p trung x? l? l?i ho?c d?n d?p t?i nguy?n sau thao t?c tr??c ??.
  try {
    const parsed = new URL(candidate, 'https://local.invalid');
    // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
    if (parsed.origin !== 'https://local.invalid') return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch (error) {
    return fallback;
  }
}

module.exports = {
  safeAdminReturnTo
};
