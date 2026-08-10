// Ti?n ?ch ai policy cung c?p c?c h?m d?ng chung cho chu?n h?a d? li?u, b?o m?t v? x? l? l?i.
const { isSupportedGrade } = require('../config/grades');

const DEFAULT_ENABLED_GRADES = [3, 4, 5];

// Danh sách khối lớp được bật gợi ý AI do quản trị viên nhập ở /admin/settings
// dưới dạng chuỗi kiểu "3,4,5". Tách ở một chỗ duy nhất để backend và giao diện
// không thể lệch nhau.
function parseEnabledGrades(value) {
  const grades = String(value ?? '')
    .split(/[,.\s]+/)
    .filter((part) => part !== '')
    .map(Number)
    // Chỉ nhận khối lớp nằm trong phạm vi hệ thống hỗ trợ. Nhờ đó chuỗi nhập
    // sai hoặc còn khoảng trắng không tạo ra khối lớp rác kiểu 0.
    .filter((grade) => isSupportedGrade(grade));

  // Ô cấu hình để trống hoặc nhập toàn ký tự không hợp lệ thì dùng mặc định,
  // tránh tình trạng tắt gợi ý cho tất cả khối lớp mà không ai cố ý.
  return grades.length > 0 ? [...new Set(grades)] : [...DEFAULT_ENABLED_GRADES];
}

// H?m isAIEnabledForGrade d?ng ?? th?c hi?n logic nghi?p v? ch?nh v? tr? k?t qu? cho lu?ng g?i; c?n b?o to?n h?p ??ng ??u v?o v? gi? tr? tr? v? c?a lu?ng g?i.
function isAIEnabledForGrade(grade, settings = {}) {
  return parseEnabledGrades(settings.ai_enabled_grades).includes(Number(grade));
}

module.exports = {
  DEFAULT_ENABLED_GRADES,
  parseEnabledGrades,
  isAIEnabledForGrade
};
