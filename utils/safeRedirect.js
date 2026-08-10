// Tiện ích safe redirect cung cấp các hàm dùng chung cho chuẩn hóa dữ liệu, bảo mật và xử lý lỗi.
function safeAdminReturnTo(value, fallback = '/admin/dashboard') {
  const candidate = typeof value === 'string' ? value.trim() : '';
  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  if (
    !candidate
    || candidate.includes('\\')
    || /[\u0000-\u001f\u007f]/.test(candidate)
    || !/^\/admin(?:[/?#]|$)/.test(candidate)
    || candidate.startsWith('//')
  ) {
    return fallback;
  }

  // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
  try {
    const parsed = new URL(candidate, 'https://local.invalid');
    // Khối này tập trung xử lý nhánh nghiệp vụ và bảo toàn các điều kiện an toàn.
    if (parsed.origin !== 'https://local.invalid') return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch (error) {
    return fallback;
  }
}

module.exports = {
  safeAdminReturnTo
};
