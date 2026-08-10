// Tiện ích account validation cung cấp các hàm dùng chung cho chuẩn hóa dữ liệu, bảo mật và xử lý lỗi.
const USERNAME_PATTERN = /^[\p{L}\p{N}._-]+$/u;

// Hàm normalizeUsername dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function normalizeUsername(value) {
  return String(value || '').trim().normalize('NFKC');
}

// Hàm normalizeFullname dùng để chuẩn hóa và làm sạch dữ liệu đầu vào; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function normalizeFullname(value) {
  return String(value || '').trim().normalize('NFKC').replace(/\s+/g, ' ');
}

// Hàm validateUsername dùng để kiểm tra tính hợp lệ và các điều kiện an toàn; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function validateUsername(value, options = {}) {
  const username = normalizeUsername(value);
  const minimum = options.login ? 1 : 3;
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (username.length < minimum || username.length > 50) {
    return options.login
      ? 'Tên đăng nhập hoặc mật khẩu không chính xác.'
      : 'Tên đăng nhập phải có từ 3 đến 50 ký tự.';
  }
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (!USERNAME_PATTERN.test(username)) {
    return 'Tên đăng nhập chỉ được chứa chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.';
  }
  return '';
}

// Hàm validateFullname dùng để kiểm tra tính hợp lệ và các điều kiện an toàn; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function validateFullname(value) {
  const fullname = normalizeFullname(value);
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (fullname.length < 2 || fullname.length > 100) {
    return 'Họ và tên phải có từ 2 đến 100 ký tự.';
  }
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (/[\u0000-\u001f\u007f]/u.test(fullname)) {
    return 'Họ và tên chứa ký tự không hợp lệ.';
  }
  return '';
}

// Hàm validatePassword dùng để kiểm tra tính hợp lệ và các điều kiện an toàn; cần bảo toàn hợp đồng đầu vào và giá trị trả về của luồng gọi.
function validatePassword(value, options = {}) {
  const password = String(value || '');
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
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
