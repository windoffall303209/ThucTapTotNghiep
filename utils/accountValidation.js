const USERNAME_PATTERN = /^[\p{L}\p{N}._-]+$/u;

function normalizeUsername(value) {
  return String(value || '').trim().normalize('NFKC');
}

function normalizeFullname(value) {
  return String(value || '').trim().normalize('NFKC').replace(/\s+/g, ' ');
}

function validateUsername(value, options = {}) {
  const username = normalizeUsername(value);
  const minimum = options.login ? 1 : 3;
  if (username.length < minimum || username.length > 50) {
    return options.login
      ? 'Tên đăng nhập hoặc mật khẩu không chính xác.'
      : 'Tên đăng nhập phải có từ 3 đến 50 ký tự.';
  }
  if (!USERNAME_PATTERN.test(username)) {
    return 'Tên đăng nhập chỉ được chứa chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.';
  }
  return '';
}

function validateFullname(value) {
  const fullname = normalizeFullname(value);
  if (fullname.length < 2 || fullname.length > 100) {
    return 'Họ và tên phải có từ 2 đến 100 ký tự.';
  }
  if (/[\u0000-\u001f\u007f]/u.test(fullname)) {
    return 'Họ và tên chứa ký tự không hợp lệ.';
  }
  return '';
}

function validatePassword(value, options = {}) {
  const password = String(value || '');
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
