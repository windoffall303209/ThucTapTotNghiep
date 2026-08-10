// Ti?n ?ch account validation cung c?p c?c h?m d?ng chung cho chu?n h?a d? li?u, b?o m?t v? x? l? l?i.
const USERNAME_PATTERN = /^[\p{L}\p{N}._-]+$/u;

// H?m normalizeUsername d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function normalizeUsername(value) {
  return String(value || '').trim().normalize('NFKC');
}

// H?m normalizeFullname d?ng ?? chu?n h?a v? l?m s?ch d? li?u ??u v?o; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function normalizeFullname(value) {
  return String(value || '').trim().normalize('NFKC').replace(/\s+/g, ' ');
}

// H?m validateUsername d?ng ?? ki?m tra t?nh h?p l? v? c?c ?i?u ki?n an to?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function validateUsername(value, options = {}) {
  const username = normalizeUsername(value);
  const minimum = options.login ? 1 : 3;
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (username.length < minimum || username.length > 50) {
    return options.login
      ? 'Tên đăng nhập hoặc mật khẩu không chính xác.'
      : 'Tên đăng nhập phải có từ 3 đến 50 ký tự.';
  }
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (!USERNAME_PATTERN.test(username)) {
    return 'Tên đăng nhập chỉ được chứa chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.';
  }
  return '';
}

// H?m validateFullname d?ng ?? ki?m tra t?nh h?p l? v? c?c ?i?u ki?n an to?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function validateFullname(value) {
  const fullname = normalizeFullname(value);
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (fullname.length < 2 || fullname.length > 100) {
    return 'Họ và tên phải có từ 2 đến 100 ký tự.';
  }
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (/[\u0000-\u001f\u007f]/u.test(fullname)) {
    return 'Họ và tên chứa ký tự không hợp lệ.';
  }
  return '';
}

// H?m validatePassword d?ng ?? ki?m tra t?nh h?p l? v? c?c ?i?u ki?n an to?n; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function validatePassword(value, options = {}) {
  const password = String(value || '');
  // Kh?i ?i?u ki?n quy?t ??nh nh?nh x? l? d?a tr?n d? li?u v? tr?ng th?i hi?n t?i.
  if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
    return options.current
      ? 'Mật khẩu hiện tại không hợp lệ.'
      : 'Mật khẩu phải có ít nhất 8 ký tự và không vượt quá 72 byte.';
  }
  return '';
}

module.exports = {
  normalizeFullname,
  normalizeUsername,
  validateFullname,
  validatePassword,
  validateUsername
};
