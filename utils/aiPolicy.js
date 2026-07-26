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

function isAIEnabledForGrade(grade, settings = {}) {
  return parseEnabledGrades(settings.ai_enabled_grades).includes(Number(grade));
}

module.exports = {
  DEFAULT_ENABLED_GRADES,
  parseEnabledGrades,
  isAIEnabledForGrade
};
